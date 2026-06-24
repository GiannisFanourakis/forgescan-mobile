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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanKsplatOptimizerModule.NAME)
public class ForgeScanKsplatOptimizerModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanKsplatOptimizer";
  private static final String TRAINABLE_OPTIMIZER_NAME = "trainable-3dgs-android-v1";
  private static final String CALIBRATED_OPTIMIZER_NAME = "calibrated-multiview-3dgs-android-v1";
  private static final String COARSE_FALLBACK_NAME = "coarse-on-device-splat-v1";
  private static final String OPTIMIZER_VERSION = "0.4.0";
  private static final String WRITER_STATUS = "experimental-ksplat";
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
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
    worker.execute(() -> {
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

        ProductionReadiness productionReadiness = inspectProductionReadiness(input, samples);
        List<Splat> splats = productionReadiness.ready
          ? initializeCalibratedMultiViewSplats(samples, config)
          : initializeSplats(samples, config);
        if (splats.isEmpty()) {
          throw new IOException("No masked foreground samples could initialize Gaussians.");
        }

        TrainingStats stats = trainSplats(splats, samples, config);
        if (productionReadiness.ready) {
          normalizeSplatBounds(splats);
        }
        File output = resolveOutput(input);
        writeKsplat(splats, output);
        boolean validOutput = output.exists() && output.length() > 0;

        JSONObject result = baseResult(input, startedAt, output, validOutput ? "generated" : "failed");
        result.put("optimizerName", productionReadiness.ready ? CALIBRATED_OPTIMIZER_NAME : TRAINABLE_OPTIMIZER_NAME);
        result.put("qualityTier", validOutput ? productionReadiness.qualityTier : "none");
        result.put("ksplatEngineStatus", validOutput ? "generated" : "failed");
        result.put("iterationCount", stats.iterations);
        result.put("gaussianCount", splats.size());
        result.put("finalLoss", stats.finalLoss);
        result.put("optimizerRuntimeStatus", "trainable-loop-complete");
        result.put("optimizerBlocker", "none");
        result.put("production3dgs", validOutput && productionReadiness.ready);
        result.put("production3dgsStatus", productionReadiness.ready ? "production-3dgs-running" : "production-3dgs-missing");
        putPoseDiagnostics(input, result);
        JSONArray warnings = new JSONArray();
        if (productionReadiness.ready) {
          warnings.put("Generated calibrated multi-view .ksplat using camera intrinsics/extrinsics.");
          warnings.put("Android V1 still uses a phone-safe optimizer, not CUDA-class production training.");
        } else {
          warnings.put("Generated experimental .ksplat from trainable Android V1.");
          warnings.put("This is not production 3DGS because calibrated synchronized multi-view input is incomplete.");
          for (String warning : productionReadiness.warnings) {
            warnings.put(warning);
          }
        }
        result.put("warnings", warnings);
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
    });
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
    putPoseDiagnostics(input, result);
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
    int maxSamples = Math.min(frames.length(), 96);
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
        hasCameraPose(frame),
        parseCameraCalibration(frame, image.getWidth(), image.getHeight()),
        frame.optString("poseSynchronization", "missing"),
        frame.optString("trackingState", "unknown"),
        frame.optString("rotationId"),
        frame.optInt("frameIndex")
      ));
    }

    return samples;
  }

  private ProductionReadiness inspectProductionReadiness(
    JSONObject input,
    List<TrainingSample> samples
  ) {
    List<String> warnings = new ArrayList<>();
    JSONObject readiness = input.optJSONObject("trackedCaptureReadiness");
    JSONObject frameStats = readiness == null ? null : readiness.optJSONObject("frameStats");
    int usableFrames = frameStats == null
      ? countCalibratedSamples(samples)
      : frameStats.optInt("usableForSplat", countCalibratedSamples(samples));
    int synchronizedFrames = frameStats == null
      ? countSynchronizedSamples(samples)
      : frameStats.optInt("framesWithSharedCameraSynchronizedPose", countSynchronizedSamples(samples));
    int associatedFrames = frameStats == null
      ? countAssociatedSamples(samples)
      : frameStats.optInt("framesWithCameraPhotoAssociatedPose", countAssociatedSamples(samples));
    int minFrames = Math.min(40, Math.max(12, samples.size() / 2));
    boolean enoughFrames = usableFrames >= minFrames;
    boolean hasSynchronizedFrames = synchronizedFrames >= minFrames;
    boolean allHaveCalibration = countCalibratedSamples(samples) >= minFrames;

    if (!enoughFrames) {
      warnings.add("Production 3DGS requires more calibrated tracked keyframes.");
    }
    if (!allHaveCalibration) {
      warnings.add("Production 3DGS requires camera intrinsics and a valid 4x4 extrinsics matrix.");
    }
    if (!hasSynchronizedFrames) {
      warnings.add("Production 3DGS requires shared-camera-synchronized frames; camera-photo-associated frames are not final-grade synchronization.");
    }
    if (associatedFrames > 0 && synchronizedFrames == 0) {
      warnings.add("Current tracked capture pairs CameraX photos with ARCore poses. That is useful for testing but not true synchronized capture.");
    }

    return new ProductionReadiness(
      enoughFrames && allHaveCalibration && hasSynchronizedFrames,
      enoughFrames && allHaveCalibration && hasSynchronizedFrames ? "production-3dgs" : "trainable-v1",
      warnings
    );
  }

  private int countCalibratedSamples(List<TrainingSample> samples) {
    int count = 0;
    for (TrainingSample sample : samples) {
      if (sample.calibration != null) {
        count += 1;
      }
    }
    return count;
  }

  private int countSynchronizedSamples(List<TrainingSample> samples) {
    int count = 0;
    for (TrainingSample sample : samples) {
      if (sample.calibration != null && "shared-camera-synchronized".equals(sample.poseSynchronization)) {
        count += 1;
      }
    }
    return count;
  }

  private int countAssociatedSamples(List<TrainingSample> samples) {
    int count = 0;
    for (TrainingSample sample : samples) {
      if (sample.calibration != null && "camera-photo-associated".equals(sample.poseSynchronization)) {
        count += 1;
      }
    }
    return count;
  }

  private CameraCalibration parseCameraCalibration(JSONObject frame, int imageWidth, int imageHeight) {
    JSONObject intrinsics = frame.optJSONObject("cameraIntrinsics");
    JSONObject extrinsics = frame.optJSONObject("cameraExtrinsics");
    JSONArray transform = extrinsics == null ? null : extrinsics.optJSONArray("transform");
    if (intrinsics == null || transform == null || transform.length() != 16) {
      return null;
    }

    float sourceWidth = (float) intrinsics.optDouble("width", imageWidth);
    float sourceHeight = (float) intrinsics.optDouble("height", imageHeight);
    float scaleX = imageWidth / Math.max(1.0f, sourceWidth);
    float scaleY = imageHeight / Math.max(1.0f, sourceHeight);
    float[] cameraToWorld = new float[16];
    for (int index = 0; index < 16; index += 1) {
      cameraToWorld[index] = (float) transform.optDouble(index, index % 5 == 0 ? 1.0 : 0.0);
    }

    return new CameraCalibration(
      (float) intrinsics.optDouble("fx", imageWidth) * scaleX,
      (float) intrinsics.optDouble("fy", imageHeight) * scaleY,
      (float) intrinsics.optDouble("cx", imageWidth * 0.5f) * scaleX,
      (float) intrinsics.optDouble("cy", imageHeight * 0.5f) * scaleY,
      imageWidth,
      imageHeight,
      cameraToWorld
    );
  }

  private List<Splat> initializeCalibratedMultiViewSplats(
    List<TrainingSample> samples,
    OptimizerConfig config
  ) {
    List<Splat> splats = new ArrayList<>();
    List<TrainingSample> calibrated = new ArrayList<>();
    for (TrainingSample sample : samples) {
      if (sample.calibration != null) {
        calibrated.add(sample);
      }
    }
    if (calibrated.size() < 2) {
      return splats;
    }

    TrainingSample anchor = chooseAnchorSample(calibrated);
    int target = Math.min(config.gaussianCount, 16000);
    List<ForegroundCandidate> candidates = collectForegroundCandidates(anchor, target * 2);
    int stride = Math.max(1, (int) Math.ceil(candidates.size() / (double) Math.max(1, target)));
    float[] depthCandidates = new float[] { 0.35f, 0.5f, 0.7f, 0.95f, 1.25f };

    for (int index = 0; index < candidates.size() && splats.size() < target; index += stride) {
      ForegroundCandidate candidate = candidates.get(index);
      Splat best = null;
      int bestSupport = 0;
      double bestLoss = Double.MAX_VALUE;

      for (float depth : depthCandidates) {
        float[] world = unproject(anchor.calibration, candidate.x, candidate.y, depth);
        Splat trial = new Splat(
          world[0],
          world[1],
          world[2],
          clampFloat(0.008f + candidate.confidence * 0.014f, 0.008f, 0.025f),
          Color.red(candidate.color),
          Color.green(candidate.color),
          Color.blue(candidate.color),
          Math.round(clampFloat(150f + candidate.confidence * 90f, 150f, 240f))
        );
        MultiViewSupport support = evaluateMultiViewSupport(trial, calibrated);
        if (
          support.supportCount > bestSupport ||
          (support.supportCount == bestSupport && support.colorLoss < bestLoss)
        ) {
          best = trial;
          bestSupport = support.supportCount;
          bestLoss = support.colorLoss;
        }
      }

      if (best != null && bestSupport >= Math.max(2, Math.min(6, calibrated.size() / 5))) {
        splats.add(best);
      }
    }

    return splats;
  }

  private MultiViewSupport evaluateMultiViewSupport(Splat splat, List<TrainingSample> samples) {
    int support = 0;
    double loss = 0.0;

    for (TrainingSample sample : samples) {
      ProjectedPoint point = projectCalibrated(splat, sample.calibration, sample.image);
      if (!point.inBounds || !isForeground(sample.mask, sample.image, point.x, point.y)) {
        continue;
      }

      int target = sample.image.getPixel(point.x, point.y);
      float dr = Color.red(target) - splat.r;
      float dg = Color.green(target) - splat.g;
      float db = Color.blue(target) - splat.b;
      loss += (dr * dr + dg * dg + db * db) / (255.0 * 255.0 * 3.0);
      support += 1;
    }

    return new MultiViewSupport(support, support == 0 ? Double.MAX_VALUE : loss / support);
  }

  private float[] unproject(CameraCalibration calibration, int x, int y, float depth) {
    float cameraX = ((x - calibration.fxCenterX) / Math.max(1.0f, calibration.fx)) * depth;
    float cameraY = ((y - calibration.fyCenterY) / Math.max(1.0f, calibration.fy)) * depth;
    float cameraZ = depth;
    return transformPoint(calibration.cameraToWorld, cameraX, cameraY, cameraZ);
  }

  private float[] transformPoint(float[] matrix, float x, float y, float z) {
    return new float[] {
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    };
  }

  private float[] inverseTransformPoint(float[] cameraToWorld, float x, float y, float z) {
    float dx = x - cameraToWorld[12];
    float dy = y - cameraToWorld[13];
    float dz = z - cameraToWorld[14];
    return new float[] {
      cameraToWorld[0] * dx + cameraToWorld[1] * dy + cameraToWorld[2] * dz,
      cameraToWorld[4] * dx + cameraToWorld[5] * dy + cameraToWorld[6] * dz,
      cameraToWorld[8] * dx + cameraToWorld[9] * dy + cameraToWorld[10] * dz
    };
  }

  private void normalizeSplatBounds(List<Splat> splats) {
    if (splats.isEmpty()) {
      return;
    }

    float minX = Float.MAX_VALUE;
    float minY = Float.MAX_VALUE;
    float minZ = Float.MAX_VALUE;
    float maxX = -Float.MAX_VALUE;
    float maxY = -Float.MAX_VALUE;
    float maxZ = -Float.MAX_VALUE;
    for (Splat splat : splats) {
      minX = Math.min(minX, splat.x);
      minY = Math.min(minY, splat.y);
      minZ = Math.min(minZ, splat.z);
      maxX = Math.max(maxX, splat.x);
      maxY = Math.max(maxY, splat.y);
      maxZ = Math.max(maxZ, splat.z);
    }

    float centerX = (minX + maxX) * 0.5f;
    float centerY = (minY + maxY) * 0.5f;
    float centerZ = (minZ + maxZ) * 0.5f;
    float extent = Math.max(maxX - minX, Math.max(maxY - minY, maxZ - minZ));
    float scale = extent <= 0.0001f ? 1.0f : 1.4f / extent;
    for (Splat splat : splats) {
      splat.x = (splat.x - centerX) * scale;
      splat.y = (splat.y - centerY) * scale;
      splat.z = (splat.z - centerZ) * scale;
      splat.scale = clampFloat(splat.scale * scale, 0.006f, 0.045f);
    }
  }

  private List<Splat> initializeSplats(
    List<TrainingSample> samples,
    OptimizerConfig config
  ) {
    List<Splat> splats = new ArrayList<>();
    if (samples.isEmpty()) {
      return splats;
    }

    TrainingSample anchor = chooseAnchorSample(samples);
    int anchorBudget = Math.min(
      config.gaussianCount,
      Math.max(1200, Math.round(config.gaussianCount * 0.72f))
    );
    addImageSheetSplats(splats, anchor, anchorBudget);

    int detailBudget = config.gaussianCount - splats.size();
    if (detailBudget <= 0) {
      return splats;
    }

    int perSampleBudget = Math.max(24, (int) Math.ceil(detailBudget / (double) samples.size()));
    for (TrainingSample sample : samples) {
      if (splats.size() >= config.gaussianCount) {
        break;
      }

      int remainingBudget = Math.min(perSampleBudget, config.gaussianCount - splats.size());
      List<ForegroundCandidate> candidates = collectForegroundCandidates(sample, remainingBudget);
      double yawRadians = Math.toRadians(sample.yawDegrees);
      float cos = (float) Math.cos(yawRadians);
      float sin = (float) Math.sin(yawRadians);
      int stride = Math.max(1, (int) Math.ceil(candidates.size() / (double) Math.max(1, remainingBudget)));

      for (int index = 0; index < candidates.size() && splats.size() < config.gaussianCount; index += stride) {
        ForegroundCandidate candidate = candidates.get(index);
        float subjectDepth = estimateSubjectDepth(candidate.nx, candidate.ny);
        float px = candidate.nx * cos + subjectDepth * sin;
        float pz = -candidate.nx * sin + subjectDepth * cos;
        float scale = clampFloat(0.008f + candidate.confidence * 0.014f, 0.008f, 0.026f);
        int alpha = Math.round(clampFloat(70f + candidate.confidence * 90f, 70f, 160f));
        splats.add(new Splat(
          px,
          candidate.ny,
          pz,
          scale,
          Color.red(candidate.color),
          Color.green(candidate.color),
          Color.blue(candidate.color),
          alpha
        ));
      }
    }

    return splats;
  }

  private TrainingSample chooseAnchorSample(List<TrainingSample> samples) {
    TrainingSample best = samples.get(0);
    float bestScore = Float.MAX_VALUE;

    for (TrainingSample sample : samples) {
      float yawScore = yawDistanceFromFront(sample.yawDegrees);
      float frameBias = Math.max(0, sample.frameIndex) * 0.001f;
      float score = yawScore + frameBias;
      if (score < bestScore) {
        best = sample;
        bestScore = score;
      }
    }

    return best;
  }

  private float yawDistanceFromFront(float yawDegrees) {
    float normalized = yawDegrees % 360.0f;
    if (normalized < 0) {
      normalized += 360.0f;
    }
    return Math.min(normalized, 360.0f - normalized);
  }

  private void addImageSheetSplats(
    List<Splat> splats,
    TrainingSample sample,
    int budget
  ) {
    List<ForegroundCandidate> candidates = collectForegroundCandidates(sample, budget);
    if (candidates.isEmpty()) {
      return;
    }

    int stride = Math.max(1, (int) Math.ceil(candidates.size() / (double) Math.max(1, budget)));
    for (int index = 0; index < candidates.size() && splats.size() < budget; index += stride) {
      ForegroundCandidate candidate = candidates.get(index);
      float shallowDepth = estimateSubjectDepth(candidate.nx, candidate.ny) * 0.08f;
      float scale = clampFloat(0.010f + candidate.confidence * 0.012f, 0.010f, 0.024f);
      int alpha = Math.round(clampFloat(190f + candidate.confidence * 60f, 190f, 250f));
      splats.add(new Splat(
        candidate.nx,
        candidate.ny,
        shallowDepth,
        scale,
        Color.red(candidate.color),
        Color.green(candidate.color),
        Color.blue(candidate.color),
        alpha,
        true
      ));
    }
  }

  private List<ForegroundCandidate> collectForegroundCandidates(
    TrainingSample sample,
    int targetCount
  ) {
    List<ForegroundCandidate> candidates = new ArrayList<>();
    int width = sample.image.getWidth();
    int height = sample.image.getHeight();
    int backgroundColor = estimateBackgroundColor(sample.image);
    int initialStep = Math.max(2, (int) Math.sqrt((width * height) / (double) Math.max(1, targetCount * 4)));

    for (int step = initialStep; step >= 1; step = Math.max(1, step / 2)) {
      candidates.clear();
      for (int y = step / 2; y < height; y += step) {
        for (int x = step / 2; x < width; x += step) {
          float confidence = foregroundConfidence(sample, backgroundColor, x, y);
          if (confidence <= 0.0f) {
            continue;
          }
          int color = sample.image.getPixel(x, y);
          float nx = (x / Math.max(1.0f, width - 1.0f)) - 0.5f;
          float ny = 0.5f - (y / Math.max(1.0f, height - 1.0f));
          candidates.add(new ForegroundCandidate(x, y, nx, ny, color, confidence));
        }
      }

      if (candidates.size() >= targetCount || step == 1) {
        break;
      }
    }

    if (candidates.isEmpty()) {
      int fallbackStep = Math.max(2, (int) Math.sqrt((width * height) / (double) Math.max(1, targetCount)));
      for (int y = fallbackStep / 2; y < height; y += fallbackStep) {
        for (int x = fallbackStep / 2; x < width; x += fallbackStep) {
          float nx = (x / Math.max(1.0f, width - 1.0f)) - 0.5f;
          float ny = 0.5f - (y / Math.max(1.0f, height - 1.0f));
          if (Math.abs(nx) > 0.42f || Math.abs(ny) > 0.46f) {
            continue;
          }
          candidates.add(new ForegroundCandidate(x, y, nx, ny, sample.image.getPixel(x, y), 0.45f));
        }
      }
    }

    return candidates;
  }

  private float foregroundConfidence(
    TrainingSample sample,
    int backgroundColor,
    int x,
    int y
  ) {
    if (isLikelyTurntableSurface(sample.image, x, y)) {
      return 0.0f;
    }

    float maskConfidence = maskConfidence(sample.mask, sample.image, x, y);
    float imageConfidence = centralSubjectConfidence(sample.image, backgroundColor, x, y);
    return Math.max(maskConfidence, imageConfidence);
  }

  private boolean isLikelyTurntableSurface(Bitmap image, int x, int y) {
    float yNorm = y / (float) Math.max(1, image.getHeight() - 1);
    if (yNorm < 0.52f) {
      return false;
    }

    int color = image.getPixel(x, y);
    int max = Math.max(Color.red(color), Math.max(Color.green(color), Color.blue(color)));
    int min = Math.min(Color.red(color), Math.min(Color.green(color), Color.blue(color)));
    int brightness = (Color.red(color) + Color.green(color) + Color.blue(color)) / 3;
    int chroma = max - min;
    return brightness > 182 && chroma < 36;
  }

  private float maskConfidence(Bitmap mask, Bitmap image, int x, int y) {
    if (mask == null) {
      return 0.0f;
    }

    int mx = Math.min(mask.getWidth() - 1, Math.max(0, Math.round((x / (float) image.getWidth()) * mask.getWidth())));
    int my = Math.min(mask.getHeight() - 1, Math.max(0, Math.round((y / (float) image.getHeight()) * mask.getHeight())));
    int maskColor = mask.getPixel(mx, my);
    int value = Math.max(Color.alpha(maskColor), Math.max(Color.red(maskColor), Math.max(Color.green(maskColor), Color.blue(maskColor))));
    return value > 48 ? clampFloat(value / 255.0f, 0.0f, 1.0f) : 0.0f;
  }

  private float centralSubjectConfidence(Bitmap image, int backgroundColor, int x, int y) {
    float nx = Math.abs((x / Math.max(1.0f, image.getWidth() - 1.0f)) - 0.5f);
    float ny = Math.abs((y / Math.max(1.0f, image.getHeight() - 1.0f)) - 0.5f);
    if (nx > 0.42f || ny > 0.46f) {
      return 0.0f;
    }

    int color = image.getPixel(x, y);
    float distance = colorDistance(color, backgroundColor) / 441.7f;
    float centerWeight = 1.0f - clampFloat((nx / 0.42f + ny / 0.46f) * 0.5f, 0.0f, 1.0f);
    float textureWeight = localTextureConfidence(image, x, y);
    float confidence = distance * 0.72f + textureWeight * 0.38f + centerWeight * 0.18f;
    return confidence > 0.22f ? clampFloat(confidence, 0.0f, 0.82f) : 0.0f;
  }

  private float localTextureConfidence(Bitmap image, int x, int y) {
    int x2 = Math.min(image.getWidth() - 1, x + 2);
    int y2 = Math.min(image.getHeight() - 1, y + 2);
    return clampFloat(colorDistance(image.getPixel(x, y), image.getPixel(x2, y2)) / 160.0f, 0.0f, 1.0f);
  }

  private int estimateBackgroundColor(Bitmap image) {
    int width = image.getWidth();
    int height = image.getHeight();
    int[] colors = new int[] {
      image.getPixel(0, 0),
      image.getPixel(width - 1, 0),
      image.getPixel(0, height - 1),
      image.getPixel(width - 1, height - 1)
    };
    int r = 0;
    int g = 0;
    int b = 0;
    for (int color : colors) {
      r += Color.red(color);
      g += Color.green(color);
      b += Color.blue(color);
    }
    return Color.rgb(r / colors.length, g / colors.length, b / colors.length);
  }

  private float colorDistance(int a, int b) {
    int dr = Color.red(a) - Color.red(b);
    int dg = Color.green(a) - Color.green(b);
    int db = Color.blue(a) - Color.blue(b);
    return (float) Math.sqrt(dr * dr + dg * dg + db * db);
  }

  private float estimateSubjectDepth(float nx, float ny) {
    float ellipsoid = 1.0f - clampFloat((nx * nx) / 0.25f + (ny * ny) / 0.36f, 0.0f, 1.0f);
    return 0.12f + ellipsoid * 0.24f;
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
          if (splat.locked) {
            continue;
          }

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
    if (sample.calibration != null) {
      return projectCalibrated(splat, sample.calibration, sample.image);
    }

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

  private ProjectedPoint projectCalibrated(
    Splat splat,
    CameraCalibration calibration,
    Bitmap image
  ) {
    if (calibration == null) {
      return new ProjectedPoint(0, 0, false);
    }

    float[] camera = inverseTransformPoint(calibration.cameraToWorld, splat.x, splat.y, splat.z);
    float z = camera[2];
    if (z <= 0.01f) {
      return new ProjectedPoint(0, 0, false);
    }

    int px = Math.round(calibration.fx * (camera[0] / z) + calibration.fxCenterX);
    int py = Math.round(calibration.fy * (camera[1] / z) + calibration.fyCenterY);
    return new ProjectedPoint(
      px,
      py,
      px >= 0 && py >= 0 && px < image.getWidth() && py < image.getHeight()
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
    Float poseYaw = estimateYawFromPose(frame);
    if (poseYaw != null) {
      return poseYaw;
    }

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

  private Float estimateYawFromPose(JSONObject frame) {
    JSONObject extrinsics = frame.optJSONObject("cameraExtrinsics");
    if (extrinsics == null) {
      return null;
    }

    JSONArray transform = extrinsics.optJSONArray("transform");
    if (transform == null || transform.length() < 16) {
      return null;
    }

    double tx = transform.optDouble(12, 0.0);
    double tz = transform.optDouble(14, 0.0);
    if (Math.abs(tx) > 0.00001 || Math.abs(tz) > 0.00001) {
      double yaw = Math.toDegrees(Math.atan2(tx, tz));
      return (float) normalizeDegrees(yaw);
    }

    double forwardX = transform.optDouble(8, 0.0);
    double forwardZ = transform.optDouble(10, 1.0);
    return (float) normalizeDegrees(Math.toDegrees(Math.atan2(forwardX, forwardZ)));
  }

  private boolean hasCameraPose(JSONObject frame) {
    JSONObject intrinsics = frame.optJSONObject("cameraIntrinsics");
    JSONObject extrinsics = frame.optJSONObject("cameraExtrinsics");
    JSONArray transform = extrinsics == null ? null : extrinsics.optJSONArray("transform");
    return intrinsics != null &&
      transform != null &&
      transform.length() == 16 &&
      "arcore-shared-camera".equals(frame.optString("captureSource"));
  }

  private double normalizeDegrees(double degrees) {
    double normalized = degrees % 360.0;
    return normalized < 0 ? normalized + 360.0 : normalized;
  }

  private void putPoseDiagnostics(JSONObject input, JSONObject result) throws Exception {
    JSONObject cameraData = input.optJSONObject("cameraData");
    JSONObject settings = input.optJSONObject("optimizerSettings");
    String poseSource = cameraData == null
      ? "ordered-turntable-fallback"
      : cameraData.optString("poseSource", "ordered-turntable-fallback");
    boolean useCameraPoses = settings != null && settings.optBoolean("useCameraPoses", false);
    result.put("poseSource", poseSource);
    result.put("useCameraPoses", useCameraPoses && "arcore-shared-camera".equals(poseSource));
    result.put("trackedFrameCount", cameraData == null ? 0 : cameraData.optInt("trackedFrameCount", 0));
    result.put("untrackedFrameCount", cameraData == null ? 0 : cameraData.optInt("untrackedFrameCount", 0));
  }

  private List<TrainingSample> syntheticTrainingSamples() {
    List<TrainingSample> samples = new ArrayList<>();
    samples.add(new TrainingSample(syntheticImage(0), syntheticMask(), 0.0f, false, null, "missing", "unknown", "smoke", 1));
    samples.add(new TrainingSample(syntheticImage(1), syntheticMask(), 90.0f, false, null, "missing", "unknown", "smoke", 2));
    samples.add(new TrainingSample(syntheticImage(2), syntheticMask(), 180.0f, false, null, "missing", "unknown", "smoke", 3));
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
      this.gaussianCount = Math.max(96, Math.min(gaussianCount, 16000));
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
      int defaultGaussians = "standard".equals(preset) ? 12000 : "fast".equals(preset) ? 9000 : 6000;
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
    final boolean usesCameraPose;
    final CameraCalibration calibration;
    final String poseSynchronization;
    final String trackingState;
    final String rotationId;
    final int frameIndex;

    TrainingSample(
      Bitmap image,
      Bitmap mask,
      float yawDegrees,
      boolean usesCameraPose,
      CameraCalibration calibration,
      String poseSynchronization,
      String trackingState,
      String rotationId,
      int frameIndex
    ) {
      this.image = image;
      this.mask = mask;
      this.yawDegrees = yawDegrees;
      this.usesCameraPose = usesCameraPose;
      this.calibration = calibration;
      this.poseSynchronization = poseSynchronization;
      this.trackingState = trackingState;
      this.rotationId = rotationId;
      this.frameIndex = frameIndex;
    }
  }

  private static class CameraCalibration {
    final float fx;
    final float fy;
    final float fxCenterX;
    final float fyCenterY;
    final int width;
    final int height;
    final float[] cameraToWorld;

    CameraCalibration(
      float fx,
      float fy,
      float fxCenterX,
      float fyCenterY,
      int width,
      int height,
      float[] cameraToWorld
    ) {
      this.fx = fx;
      this.fy = fy;
      this.fxCenterX = fxCenterX;
      this.fyCenterY = fyCenterY;
      this.width = width;
      this.height = height;
      this.cameraToWorld = cameraToWorld;
    }
  }

  private static class ProductionReadiness {
    final boolean ready;
    final String qualityTier;
    final List<String> warnings;

    ProductionReadiness(boolean ready, String qualityTier, List<String> warnings) {
      this.ready = ready;
      this.qualityTier = qualityTier;
      this.warnings = warnings;
    }
  }

  private static class MultiViewSupport {
    final int supportCount;
    final double colorLoss;

    MultiViewSupport(int supportCount, double colorLoss) {
      this.supportCount = supportCount;
      this.colorLoss = colorLoss;
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

  private static class ForegroundCandidate {
    final int x;
    final int y;
    final float nx;
    final float ny;
    final int color;
    final float confidence;

    ForegroundCandidate(int x, int y, float nx, float ny, int color, float confidence) {
      this.x = x;
      this.y = y;
      this.nx = nx;
      this.ny = ny;
      this.color = color;
      this.confidence = confidence;
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
    final boolean locked;

    Splat(float x, float y, float z, float scale, int r, int g, int b, int a) {
      this(x, y, z, scale, r, g, b, a, false);
    }

    Splat(float x, float y, float z, float scale, int r, int g, int b, int a, boolean locked) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.scale = scale;
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;
      this.locked = locked;
    }
  }
}
