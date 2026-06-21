package com.forgescan.nativeengines;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanKsplatOptimizerModule.NAME)
public class ForgeScanKsplatOptimizerModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanKsplatOptimizer";
  private static final String TRAINABLE_OPTIMIZER_NAME = "trainable-3dgs-android-v1";
  private static final String COARSE_FALLBACK_NAME = "coarse-on-device-splat-v1";
  private static final String OPTIMIZER_VERSION = "0.3.0";
  private static final String WRITER_STATUS = "experimental-ksplat";
  private volatile boolean cancelled = false;

  public ForgeScanKsplatOptimizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getAvailability(Promise promise) {
    try {
      JSONObject result = new JSONObject();
      File smokeDir = new File(getReactApplicationContext().getCacheDir(), "forgescan-smoke/splat");
      boolean canCreateOutputDirectory = smokeDir.exists() || smokeDir.mkdirs();
      result.put("available", true);
      result.put("mode", "native-on-device");
      result.put("moduleName", NAME);
      result.put("optimizerName", TRAINABLE_OPTIMIZER_NAME);
      result.put("optimizerVersion", OPTIMIZER_VERSION);
      result.put("writerAvailable", true);
      result.put("canCreateOutputDirectory", canCreateOutputDirectory);
      result.put("qualityTier", "trainable-v1");
      result.put("ksplatEngineStatus", "trainable-3dgs-v1-running");
      result.put("ksplatWriterStatus", WRITER_STATUS);
      result.put("optimizerRuntimeStatus", "trainable-loop-available");
      result.put("optimizerBlocker", "none");
      result.put("trainableLoopAvailable", true);
      result.put("coarseFallbackAvailable", true);
      result.put("production3dgs", false);
      result.put("production3dgsStatus", "production-3dgs-missing");
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_KSPLAT_AVAILABILITY_FAILED", error);
    }
  }

  @ReactMethod
  public void runKsplatOptimizer(String inputJson, Promise promise) {
    cancelled = false;
    long startedAt = System.currentTimeMillis();
    JSONObject input;
    try {
      input = new JSONObject(inputJson);
    } catch (Exception error) {
      promise.reject("FORGESCAN_KSPLAT_BAD_INPUT", error);
      return;
    }

    try {
      OptimizerConfig config = OptimizerConfig.fromInput(input);
      List<TrainingSample> samples = loadTrainingSamples(input, config);
      if (samples.isEmpty()) {
        throw new IOException("No training frames could be decoded.");
      }

      List<Splat> splats = initializeSplats(samples, config);
      if (splats.isEmpty()) {
        throw new IOException("No masked foreground samples could initialize Gaussians.");
      }

      TrainingStats stats = trainSplats(splats, samples, config);
      File output = resolveOutput(input);
      writeKsplat(splats, output);
      boolean validOutput = output.exists() && output.length() > 0;

      JSONObject result = baseResult(input, startedAt, output, validOutput ? "generated" : "failed");
      result.put("optimizerName", TRAINABLE_OPTIMIZER_NAME);
      result.put("qualityTier", validOutput ? "trainable-v1" : "none");
      result.put("ksplatEngineStatus", validOutput ? "generated" : "failed");
      result.put("iterationCount", stats.iterations);
      result.put("gaussianCount", splats.size());
      result.put("finalLoss", stats.finalLoss);
      result.put("optimizerRuntimeStatus", "trainable-loop-complete");
      result.put("optimizerBlocker", "none");
      result.put("warnings", new JSONArray()
        .put("Generated experimental .ksplat from trainable Android V1.")
        .put("This is Android V1 optimization, not final production 3DGS quality."));
      result.put("errors", new JSONArray());
      promise.resolve(result.toString());
    } catch (Exception trainableError) {
      try {
        JSONObject fallback = runCoarseFallback(input, startedAt, trainableError);
        promise.resolve(fallback.toString());
      } catch (Exception fallbackError) {
        try {
          JSONObject failed = baseResult(input, startedAt, null, "failed");
          failed.put("optimizerName", TRAINABLE_OPTIMIZER_NAME);
          failed.put("qualityTier", "none");
          failed.put("ksplatEngineStatus", "failed");
          failed.put("optimizerRuntimeStatus", "failed");
          failed.put("optimizerBlocker", "trainable-loop-failed-and-coarse-fallback-failed");
          failed.put("warnings", new JSONArray());
          failed.put("errors", new JSONArray()
            .put(trainableError.getMessage())
            .put(fallbackError.getMessage()));
          promise.resolve(failed.toString());
        } catch (Exception jsonError) {
          promise.reject("FORGESCAN_KSPLAT_FAILED", fallbackError);
        }
      }
    }
  }

  @ReactMethod
  public void runTinyGaussianTrainingTest(Promise promise) {
    cancelled = false;
    long startedAt = System.currentTimeMillis();
    try {
      OptimizerConfig config = OptimizerConfig.smoke();
      List<TrainingSample> samples = syntheticTrainingSamples();
      List<Splat> splats = initializeSplats(samples, config);
      TrainingStats stats = trainSplats(splats, samples, config);
      File output = new File(
        getReactApplicationContext().getCacheDir(),
        "forgescan-smoke/splat/tiny-gaussian-training-smoke.ksplat"
      );
      writeKsplat(splats, output);

      JSONObject result = new JSONObject();
      result.put("status", output.exists() && output.length() > 0 ? "pass" : "fail");
      result.put("ksplatUri", ForgeScanNativeFiles.fileUri(output));
      result.put("ksplatBytes", output.length());
      result.put("writerAvailable", true);
      result.put("optimizerName", TRAINABLE_OPTIMIZER_NAME);
      result.put("optimizerVersion", OPTIMIZER_VERSION);
      result.put("qualityTier", "trainable-v1");
      result.put("ksplatEngineStatus", "generated");
      result.put("ksplatWriterStatus", WRITER_STATUS);
      result.put("optimizerRuntimeStatus", "trainable-loop-complete");
      result.put("optimizerBlocker", "none");
      result.put("trainableLoopAvailable", true);
      result.put("coarseFallbackAvailable", true);
      result.put("production3dgs", false);
      result.put("production3dgsStatus", "production-3dgs-missing");
      result.put("iterationCount", stats.iterations);
      result.put("gaussianCount", splats.size());
      result.put("finalLoss", stats.finalLoss);
      result.put("durationMs", System.currentTimeMillis() - startedAt);
      result.put("warnings", new JSONArray().put("Smoke test only. This file is not a user scan export."));
      result.put("errors", new JSONArray());
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_TINY_GAUSSIAN_TRAINING_FAILED", error);
    }
  }

  @ReactMethod
  public void runTinySplatSmokeTest(Promise promise) {
    cancelled = false;
    try {
      File output = new File(
        getReactApplicationContext().getCacheDir(),
        "forgescan-smoke/splat/tiny-splat-writer-smoke.ksplat"
      );
      List<Splat> splats = new ArrayList<>();
      splats.add(new Splat(-0.25f, 0.0f, 0.0f, 0.045f, 236, 190, 116, 235));
      splats.add(new Splat(0.25f, 0.0f, 0.0f, 0.045f, 41, 117, 122, 235));
      splats.add(new Splat(0.0f, 0.25f, 0.0f, 0.045f, 246, 246, 238, 230));
      splats.add(new Splat(0.0f, -0.25f, 0.0f, 0.045f, 16, 24, 23, 230));
      splats.add(new Splat(0.0f, 0.0f, -0.25f, 0.05f, 236, 190, 116, 220));
      splats.add(new Splat(0.0f, 0.0f, 0.25f, 0.05f, 41, 117, 122, 220));
      writeKsplat(splats, output);

      JSONObject result = new JSONObject();
      result.put("status", output.exists() && output.length() > 0 ? "pass" : "fail");
      result.put("ksplatUri", ForgeScanNativeFiles.fileUri(output));
      result.put("ksplatBytes", output.length());
      result.put("writerAvailable", true);
      result.put("optimizerName", "experimental-ksplat-writer");
      result.put("optimizerVersion", OPTIMIZER_VERSION);
      result.put("qualityTier", "smoke-test");
      result.put("production3dgs", false);
      result.put("ksplatEngineStatus", "generated");
      result.put("ksplatWriterStatus", WRITER_STATUS);
      result.put("optimizerRuntimeStatus", "writer-only-complete");
      result.put("optimizerBlocker", "none");
      result.put("trainableLoopAvailable", true);
      result.put("coarseFallbackAvailable", true);
      result.put("production3dgsStatus", "production-3dgs-missing");
      result.put("warnings", new JSONArray().put("Smoke test only. This file is not a user scan export."));
      result.put("errors", new JSONArray());
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_KSPLAT_SMOKE_FAILED", error);
    }
  }

  @ReactMethod
  public void cancelKsplatOptimizer(Promise promise) {
    cancelled = true;
    promise.resolve(null);
  }

  private JSONObject runCoarseFallback(
    JSONObject input,
    long startedAt,
    Exception trainableError
  ) throws Exception {
    OptimizerConfig config = OptimizerConfig.fromInput(input);
    List<TrainingSample> samples = loadTrainingSamples(input, config);
    List<Splat> splats = initializeSplats(samples, config);
    if (splats.isEmpty()) {
      throw new IOException("Coarse fallback could not create splats.");
    }

    File output = resolveOutput(input);
    writeKsplat(splats, output);
    boolean validOutput = output.exists() && output.length() > 0;
    JSONObject result = baseResult(input, startedAt, output, validOutput ? "generated" : "failed");
    result.put("optimizerName", COARSE_FALLBACK_NAME);
    result.put("qualityTier", validOutput ? "coarse-v1" : "none");
    result.put("ksplatEngineStatus", validOutput ? "coarse-v1-fallback" : "failed");
    result.put("iterationCount", 0);
    result.put("gaussianCount", splats.size());
    result.put("finalLoss", JSONObject.NULL);
    result.put("optimizerRuntimeStatus", validOutput ? "coarse-fallback-complete" : "failed");
    result.put("optimizerBlocker", "trainable-loop-failed: " + trainableError.getMessage());
    result.put("warnings", new JSONArray()
      .put("Coarse on-phone splat generated. Quality is limited.")
      .put("Trainable Android V1 failed before completion: " + trainableError.getMessage()));
    result.put("errors", new JSONArray());
    return result;
  }

  private JSONObject baseResult(
    JSONObject input,
    long startedAt,
    File output,
    String status
  ) throws Exception {
    JSONObject result = new JSONObject();
    result.put("status", status);
    if (output != null) {
      result.put("ksplatUri", ForgeScanNativeFiles.fileUri(output));
      result.put("ksplatPath", input.optString("outputPath", "photoreal/" + input.getString("outputFilename")));
    }
    result.put("outputFilename", input.optString("outputFilename", "ForgeScan_scan.ksplat"));
    result.put("optimizerVersion", OPTIMIZER_VERSION);
    result.put("ksplatWriterStatus", WRITER_STATUS);
    result.put("optimizerRuntimeStatus", status);
    result.put("optimizerBlocker", "none");
    result.put("production3dgs", false);
    result.put("production3dgsStatus", "production-3dgs-missing");
    result.put("durationMs", System.currentTimeMillis() - startedAt);
    return result;
  }

  private File resolveOutput(JSONObject input) throws Exception {
    File output = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      input.optString("outputPath", "photoreal/" + input.getString("outputFilename"))
    );
    if (!output.getName().toLowerCase().endsWith(".ksplat")) {
      throw new IOException("Output filename must end with .ksplat.");
    }
    return output;
  }

  private List<TrainingSample> loadTrainingSamples(
    JSONObject input,
    OptimizerConfig config
  ) throws Exception {
    JSONArray frames = input.getJSONArray("orderedFrames");
    JSONArray masks = input.optJSONArray("objectMasks");
    List<TrainingSample> samples = new ArrayList<>();
    int maxSamples = Math.min(frames.length(), 36);
    int stride = Math.max(1, frames.length() / Math.max(1, maxSamples));

    for (int index = 0; index < frames.length() && samples.size() < maxSamples; index += stride) {
      if (cancelled) {
        throw new IOException("Native .ksplat optimizer was cancelled.");
      }

      JSONObject frame = frames.getJSONObject(index);
      File frameFile = ForgeScanNativeFiles.fileFromUri(frame.getString("frameUri"));
      Bitmap image = BitmapFactory.decodeFile(frameFile.getAbsolutePath());
      if (image == null) {
        continue;
      }

      Bitmap mask = loadMaskForFrame(frame, masks);
      if (config.imageDownscale > 1) {
        int width = Math.max(16, image.getWidth() / config.imageDownscale);
        int height = Math.max(16, image.getHeight() / config.imageDownscale);
        image = Bitmap.createScaledBitmap(image, width, height, true);
        if (mask != null) {
          mask = Bitmap.createScaledBitmap(mask, width, height, true);
        }
      }

      samples.add(new TrainingSample(
        image,
        mask,
        estimateYaw(frame, frames),
        frame.optString("rotationId"),
        frame.optInt("frameIndex")
      ));
    }

    return samples;
  }

  private List<Splat> initializeSplats(
    List<TrainingSample> samples,
    OptimizerConfig config
  ) {
    List<Splat> splats = new ArrayList<>();
    if (samples.isEmpty()) {
      return splats;
    }

    int perSampleBudget = Math.max(12, config.gaussianCount / samples.size());
    for (TrainingSample sample : samples) {
      if (splats.size() >= config.gaussianCount) {
        break;
      }

      double pixelBudget = Math.max(1.0, perSampleBudget);
      int sampleStep = Math.max(
        4,
        (int) Math.sqrt((sample.image.getWidth() * sample.image.getHeight()) / pixelBudget)
      );
      double yawRadians = Math.toRadians(sample.yawDegrees);
      float cos = (float) Math.cos(yawRadians);
      float sin = (float) Math.sin(yawRadians);

      for (int y = sampleStep / 2; y < sample.image.getHeight() && splats.size() < config.gaussianCount; y += sampleStep) {
        for (int x = sampleStep / 2; x < sample.image.getWidth() && splats.size() < config.gaussianCount; x += sampleStep) {
          if (!isForeground(sample.mask, sample.image, x, y)) {
            continue;
          }

          int color = sample.image.getPixel(x, y);
          float nx = (x / Math.max(1.0f, sample.image.getWidth() - 1.0f)) - 0.5f;
          float ny = 0.5f - (y / Math.max(1.0f, sample.image.getHeight() - 1.0f));
          float radius = 0.48f + Math.abs(nx) * 0.16f;
          float px = nx * cos + radius * sin * 0.22f;
          float pz = -nx * sin + radius * cos * 0.22f;
          splats.add(new Splat(px, ny, pz, 0.018f, Color.red(color), Color.green(color), Color.blue(color), 220));
        }
      }
    }

    return splats;
  }

  private TrainingStats trainSplats(
    List<Splat> splats,
    List<TrainingSample> samples,
    OptimizerConfig config
  ) throws IOException {
    int iterations = Math.max(1, Math.min(config.maxIterations, 48));
    double finalLoss = 0.0;

    for (int iteration = 0; iteration < iterations; iteration += 1) {
      if (cancelled) {
        throw new IOException("Native .ksplat optimizer was cancelled.");
      }

      double loss = 0.0;
      int count = 0;
      float iterationRate = (float) (config.learningRate * (1.0 - (iteration / (double) Math.max(1, iterations))));

      for (TrainingSample sample : samples) {
        for (Splat splat : splats) {
          ProjectedPoint point = project(splat, sample);
          if (!point.inBounds || !isForeground(sample.mask, sample.image, point.x, point.y)) {
            continue;
          }

          int target = sample.image.getPixel(point.x, point.y);
          float dr = Color.red(target) - splat.r;
          float dg = Color.green(target) - splat.g;
          float db = Color.blue(target) - splat.b;
          double sampleLoss = (dr * dr + dg * dg + db * db) / (255.0 * 255.0 * 3.0);
          loss += sampleLoss;
          count += 1;

          splat.r += dr * iterationRate;
          splat.g += dg * iterationRate;
          splat.b += db * iterationRate;
          splat.a = clampFloat(splat.a + (220.0f - splat.a) * iterationRate * 0.25f, 80.0f, 255.0f);
          splat.scale = clampFloat(
            splat.scale * (float) (1.0 + (0.12 - sampleLoss) * iterationRate * 0.08),
            0.006f,
            0.055f
          );

          float centerPullX = ((point.x / Math.max(1.0f, sample.image.getWidth() - 1.0f)) - 0.5f) * 0.0009f;
          float centerPullY = (0.5f - (point.y / Math.max(1.0f, sample.image.getHeight() - 1.0f))) * 0.0009f;
          splat.x = clampFloat(splat.x + centerPullX * iterationRate, -0.85f, 0.85f);
          splat.y = clampFloat(splat.y + centerPullY * iterationRate, -0.85f, 0.85f);
        }
      }

      finalLoss = count == 0 ? 1.0 : loss / count;
    }

    return new TrainingStats(iterations, finalLoss);
  }

  private ProjectedPoint project(Splat splat, TrainingSample sample) {
    double yawRadians = Math.toRadians(sample.yawDegrees);
    float cos = (float) Math.cos(-yawRadians);
    float sin = (float) Math.sin(-yawRadians);
    float viewX = splat.x * cos - splat.z * sin;
    float viewZ = splat.x * sin + splat.z * cos;
    float perspective = 0.92f / Math.max(0.7f, 1.15f + viewZ * 0.12f);
    int px = Math.round((viewX * perspective + 0.5f) * (sample.image.getWidth() - 1));
    int py = Math.round((0.5f - splat.y * perspective) * (sample.image.getHeight() - 1));
    return new ProjectedPoint(
      px,
      py,
      px >= 0 && py >= 0 && px < sample.image.getWidth() && py < sample.image.getHeight()
    );
  }

  private Bitmap loadMaskForFrame(JSONObject frame, JSONArray masks) {
    if (masks == null) {
      return null;
    }

    String rotationId = frame.optString("rotationId");
    int frameIndex = frame.optInt("frameIndex");
    for (int index = 0; index < masks.length(); index += 1) {
      JSONObject mask = masks.optJSONObject(index);
      if (mask == null) {
        continue;
      }
      if (!rotationId.equals(mask.optString("rotationId")) || frameIndex != mask.optInt("frameIndex")) {
        continue;
      }
      String maskUri = mask.optString("refinedMaskUri", "");
      if (maskUri.isEmpty()) {
        continue;
      }
      File maskFile = ForgeScanNativeFiles.fileFromUri(maskUri);
      return BitmapFactory.decodeFile(maskFile.getAbsolutePath());
    }
    return null;
  }

  private boolean isForeground(Bitmap mask, Bitmap image, int x, int y) {
    if (mask == null) {
      float nx = Math.abs((x / Math.max(1.0f, image.getWidth() - 1.0f)) - 0.5f);
      float ny = Math.abs((y / Math.max(1.0f, image.getHeight() - 1.0f)) - 0.5f);
      return nx < 0.36f && ny < 0.44f;
    }

    int mx = Math.min(mask.getWidth() - 1, Math.max(0, Math.round((x / (float) image.getWidth()) * mask.getWidth())));
    int my = Math.min(mask.getHeight() - 1, Math.max(0, Math.round((y / (float) image.getHeight()) * mask.getHeight())));
    int maskColor = mask.getPixel(mx, my);
    return Color.alpha(maskColor) > 0 && (Color.red(maskColor) + Color.green(maskColor) + Color.blue(maskColor)) > 64;
  }

  private float estimateYaw(JSONObject frame, JSONArray frames) {
    String rotationId = frame.optString("rotationId");
    int frameIndex = frame.optInt("frameIndex");
    int sameRotationCount = 0;
    int orderInRotation = 0;

    for (int index = 0; index < frames.length(); index += 1) {
      JSONObject candidate = frames.optJSONObject(index);
      if (candidate == null || !rotationId.equals(candidate.optString("rotationId"))) {
        continue;
      }
      sameRotationCount += 1;
      if (candidate.optInt("frameIndex") <= frameIndex) {
        orderInRotation += 1;
      }
    }

    return sameRotationCount == 0 ? 0 : ((orderInRotation - 1) / (float) sameRotationCount) * 360.0f;
  }

  private List<TrainingSample> syntheticTrainingSamples() {
    List<TrainingSample> samples = new ArrayList<>();
    samples.add(new TrainingSample(syntheticImage(0), syntheticMask(), 0.0f, "smoke", 1));
    samples.add(new TrainingSample(syntheticImage(1), syntheticMask(), 90.0f, "smoke", 2));
    samples.add(new TrainingSample(syntheticImage(2), syntheticMask(), 180.0f, "smoke", 3));
    return samples;
  }

  private Bitmap syntheticImage(int variant) {
    Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.rgb(24, 32, 32));
    canvas.drawRect(0, 0, 96, 96, paint);
    paint.setColor(variant == 0 ? Color.rgb(235, 188, 112) : variant == 1 ? Color.rgb(42, 118, 124) : Color.rgb(238, 238, 224));
    canvas.drawCircle(48, 48, 28, paint);
    paint.setColor(Color.rgb(20, 24, 23));
    canvas.drawCircle(38 + variant * 6, 42, 7, paint);
    return bitmap;
  }

  private Bitmap syntheticMask() {
    Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.TRANSPARENT);
    canvas.drawRect(0, 0, 96, 96, paint);
    paint.setColor(Color.WHITE);
    canvas.drawCircle(48, 48, 30, paint);
    return bitmap;
  }

  private void writeKsplat(List<Splat> splats, File output) throws IOException {
    final int headerSize = 4096;
    final int sectionHeaderSize = 1024;
    final int bytesPerSplat = 44;
    int splatCount = splats.size();
    int totalSize = headerSize + sectionHeaderSize + splatCount * bytesPerSplat;
    ByteBuffer buffer = ByteBuffer.allocate(totalSize).order(ByteOrder.LITTLE_ENDIAN);

    buffer.put(0, (byte) 0);
    buffer.put(1, (byte) 1);
    buffer.putInt(4, 1);
    buffer.putInt(8, 1);
    buffer.putInt(12, splatCount);
    buffer.putInt(16, splatCount);
    buffer.putShort(20, (short) 0);
    buffer.putFloat(24, 0.0f);
    buffer.putFloat(28, 0.0f);
    buffer.putFloat(32, 0.0f);
    buffer.putFloat(36, -1.5f);
    buffer.putFloat(40, 1.5f);

    int sectionBase = headerSize;
    buffer.putInt(sectionBase, splatCount);
    buffer.putInt(sectionBase + 4, splatCount);
    buffer.putInt(sectionBase + 28, splatCount * bytesPerSplat);
    buffer.putShort(sectionBase + 40, (short) 0);

    int dataBase = headerSize + sectionHeaderSize;
    for (int index = 0; index < splats.size(); index += 1) {
      Splat splat = splats.get(index);
      int base = dataBase + index * bytesPerSplat;
      buffer.putFloat(base, splat.x);
      buffer.putFloat(base + 4, splat.y);
      buffer.putFloat(base + 8, splat.z);
      buffer.putFloat(base + 12, splat.scale);
      buffer.putFloat(base + 16, splat.scale);
      buffer.putFloat(base + 20, splat.scale);
      buffer.putFloat(base + 24, 0.0f);
      buffer.putFloat(base + 28, 0.0f);
      buffer.putFloat(base + 32, 0.0f);
      buffer.putFloat(base + 36, 1.0f);
      buffer.put(base + 40, (byte) Math.round(clampFloat(splat.r, 0, 255)));
      buffer.put(base + 41, (byte) Math.round(clampFloat(splat.g, 0, 255)));
      buffer.put(base + 42, (byte) Math.round(clampFloat(splat.b, 0, 255)));
      buffer.put(base + 43, (byte) Math.round(clampFloat(splat.a, 0, 255)));
    }

    ForgeScanNativeFiles.ensureParent(output);
    FileOutputStream stream = new FileOutputStream(output);
    try {
      stream.write(buffer.array());
    } finally {
      stream.close();
    }
  }

  private static float clampFloat(float value, float min, float max) {
    return Math.max(min, Math.min(max, value));
  }

  private static class OptimizerConfig {
    final int maxIterations;
    final int gaussianCount;
    final int imageDownscale;
    final float learningRate;

    OptimizerConfig(int maxIterations, int gaussianCount, int imageDownscale, float learningRate) {
      this.maxIterations = Math.max(1, Math.min(maxIterations, 48));
      this.gaussianCount = Math.max(32, Math.min(gaussianCount, 2000));
      this.imageDownscale = Math.max(1, Math.min(imageDownscale, 4));
      this.learningRate = clampFloat(learningRate, 0.005f, 0.25f);
    }

    static OptimizerConfig fromInput(JSONObject input) {
      JSONObject settings = input.optJSONObject("optimizerSettings");
      if (settings == null) {
        return smoke();
      }
      String preset = settings.optString("qualityPreset", "smoke");
      int defaultIterations = "standard".equals(preset) ? 36 : "fast".equals(preset) ? 24 : 18;
      int defaultGaussians = "standard".equals(preset) ? 1200 : "fast".equals(preset) ? 900 : 600;
      return new OptimizerConfig(
        settings.optInt("maxIterations", defaultIterations),
        settings.optInt("gaussianCount", settings.optInt("maxSplats", defaultGaussians)),
        settings.optInt("imageDownscale", 1),
        (float) settings.optDouble("learningRate", 0.08)
      );
    }

    static OptimizerConfig smoke() {
      return new OptimizerConfig(8, 96, 1, 0.12f);
    }
  }

  private static class TrainingSample {
    final Bitmap image;
    final Bitmap mask;
    final float yawDegrees;
    final String rotationId;
    final int frameIndex;

    TrainingSample(Bitmap image, Bitmap mask, float yawDegrees, String rotationId, int frameIndex) {
      this.image = image;
      this.mask = mask;
      this.yawDegrees = yawDegrees;
      this.rotationId = rotationId;
      this.frameIndex = frameIndex;
    }
  }

  private static class TrainingStats {
    final int iterations;
    final double finalLoss;

    TrainingStats(int iterations, double finalLoss) {
      this.iterations = iterations;
      this.finalLoss = finalLoss;
    }
  }

  private static class ProjectedPoint {
    final int x;
    final int y;
    final boolean inBounds;

    ProjectedPoint(int x, int y, boolean inBounds) {
      this.x = x;
      this.y = y;
      this.inBounds = inBounds;
    }
  }

  private static class Splat {
    float x;
    float y;
    float z;
    float scale;
    float r;
    float g;
    float b;
    float a;

    Splat(float x, float y, float z, float scale, int r, int g, int b, int a) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.scale = scale;
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;
    }
  }
}
