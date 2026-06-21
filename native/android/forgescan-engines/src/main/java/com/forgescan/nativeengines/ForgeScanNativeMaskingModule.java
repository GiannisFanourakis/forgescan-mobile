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
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.FloatBuffer;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanNativeMaskingModule.NAME)
public class ForgeScanNativeMaskingModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanNativeMasking";
  private static final String ENGINE_VERSION = "0.6.0";
  private static final String MLKIT_ENGINE = "mlkit-subject-segmentation";
  private static final String FALLBACK_ENGINE = "fallback-local";
  private static final float MLKIT_FOREGROUND_THRESHOLD = 0.85f;
  private volatile boolean cancelled = false;

  public ForgeScanNativeMaskingModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getAvailability(Promise promise) {
    try {
      boolean mlKitAvailable = mlKitRuntimeAvailable();
      JSONObject result = new JSONObject();
      result.put("available", mlKitAvailable);
      result.put("mode", mlKitAvailable ? "native-ai" : "fallback-local");
      result.put("moduleName", NAME);
      result.put("engineName", "android-masking");
      result.put("engineVersion", ENGINE_VERSION);
      result.put("mlKitAvailable", mlKitAvailable);
      result.put("defaultMaskingEngine", MLKIT_ENGINE);
      result.put("confidenceThreshold", MLKIT_FOREGROUND_THRESHOLD);
      result.put("modelExists", mlKitAvailable);
      result.put("modelPresent", mlKitAvailable);
      result.put("modelPath", "android-runtime:" + MLKIT_ENGINE);
      result.put("modelAssetPath", "android-runtime:" + MLKIT_ENGINE);
      result.put("modelName", MLKIT_ENGINE);
      result.put("modelTier", MLKIT_ENGINE);
      result.put("modelPreference", "auto-mobile");
      result.put("modelFileSize", 0);
      result.put("runtime", MLKIT_ENGINE);
      result.put("inferenceBackend", mlKitAvailable ? MLKIT_ENGINE : "none");
      result.put("heavyInitializationRequired", false);
      result.put("runtimeClassesAvailable", mlKitAvailable);
      result.put("detectedModels", detectedModelsJson(mlKitAvailable));
      result.put("modelLoaded", false);
      result.put("inferenceRan", false);
      result.put("maskPngWritten", false);
      result.put("modelStatus", mlKitAvailable ? "not-loaded" : "missing");
      result.put("fallbackUsed", !mlKitAvailable);
      result.put("activeMaskingEngine", mlKitAvailable ? "ML Kit Subject Segmentation" : FALLBACK_ENGINE);
      result.put("maskingEngineStatus", mlKitAvailable ? "available-not-loaded" : FALLBACK_ENGINE);
      result.put("memory", currentMemoryJson());

      JSONArray warnings = new JSONArray();
      JSONArray errors = new JSONArray();
      if (!mlKitAvailable) {
        warnings.put("ML Kit Subject Segmentation is unavailable. Fallback local masks can be written but are not real segmentation.");
        result.put("reason", "ML Kit Subject Segmentation is unavailable.");
      }
      result.put("warnings", warnings);
      result.put("errors", errors);
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(maskingAvailabilityFailureJson(error));
    }
  }

  @ReactMethod
  public void runMasking(String inputJson, Promise promise) {
    cancelled = false;
    MaskingSession session = new MaskingSession(mlKitRuntimeAvailable());
    try {
      JSONObject input = new JSONObject(inputJson);
      JSONArray frames = input.getJSONArray("frames");
      JSONArray artifacts = new JSONArray();
      JSONArray warnings = new JSONArray();
      JSONArray errors = new JSONArray();

      if (!session.mlKitAvailable) {
        warnings.put("ML Kit Subject Segmentation is unavailable. Fallback local masks were written for pipeline continuity only.");
      }

      for (int index = 0; index < frames.length(); index += 1) {
        if (cancelled) {
          throw new IOException("Native masking was cancelled.");
        }

        JSONObject frame = frames.getJSONObject(index);
        try {
          JSONObject artifact = runMaskForFrame(input, frame, session);
          appendAll(warnings, artifact.getJSONArray("warnings"));
          appendAll(errors, artifact.getJSONArray("errors"));
          artifacts.put(artifact);
        } catch (Exception frameError) {
          JSONObject failed = baseArtifact(frame);
          failed.put("status", "failed");
          failed.getJSONArray("errors").put(safeMessage(frameError));
          artifacts.put(failed);
          errors.put(safeMessage(frameError));
        }
      }

      JSONObject result = new JSONObject();
      result.put("status", errors.length() == 0 ? "complete" : "failed");
      result.put("maskArtifacts", artifacts);
      result.put("engineName", session.engineName());
      result.put("engineVersion", ENGINE_VERSION);
      result.put("modelName", session.modelName());
      result.put("mlKitAvailable", session.mlKitAvailable);
      result.put("defaultMaskingEngine", MLKIT_ENGINE);
      result.put("confidenceThreshold", MLKIT_FOREGROUND_THRESHOLD);
      result.put("modelExists", session.mlKitAvailable);
      result.put("modelTier", session.mlKitAvailable ? MLKIT_ENGINE : FALLBACK_ENGINE);
      result.put("modelPreference", "auto-mobile");
      result.put("modelAssetPath", session.mlKitAvailable ? "android-runtime:" + MLKIT_ENGINE : "");
      result.put("modelFileSize", 0);
      result.put("maskInputSize", 0);
      result.put("inferenceTimeMs", session.lastInferenceTimeMs);
      result.put("modelLoaded", session.mlKitAvailable);
      result.put("inferenceRan", session.inferenceRan);
      result.put("maskPngWritten", session.maskPngWritten);
      result.put("modelStatus", session.mlKitAvailable ? "loaded" : "missing");
      result.put("errorCode", "");
      result.put("lastInferenceError", session.lastInferenceError);
      result.put("memoryBeforeLoad", currentMemoryJson());
      result.put("memoryAfterLoad", currentMemoryJson());
      result.put("inferenceBackend", session.mlKitAvailable ? MLKIT_ENGINE : "none");
      result.put("fallbackUsed", session.fallbackUsed);
      result.put("activeMaskingEngine", session.engineName());
      result.put("maskingEngineStatus", maskingEngineStatus(session));
      result.put("warnings", warnings);
      result.put("errors", errors);
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(maskingFailureJson(error));
    }
  }

  @ReactMethod
  public void runOneFrameMaskTest(String inputJson, Promise promise) {
    cancelled = false;
    MaskingSession session = new MaskingSession(mlKitRuntimeAvailable());
    try {
      File root = new File(getReactApplicationContext().getCacheDir(), "forgescan-smoke/masking");
      File source = new File(root, "source.png");
      ForgeScanNativeFiles.ensureParent(source);
      writeSmokeSource(source);

      JSONObject input = new JSONObject();
      input.put("projectId", "mask-smoke");
      input.put("outputDirectory", "advanced/masks");
      JSONArray frames = new JSONArray();
      JSONObject frame = new JSONObject();
      frame.put("rotationId", "upright");
      frame.put("frameIndex", 1);
      frame.put("frameUri", ForgeScanNativeFiles.fileUri(source));
      frames.put(frame);
      input.put("frames", frames);

      JSONObject artifact = runMaskForFrame(input, frame, session);
      File refined = ForgeScanNativeFiles.fileFromUri(artifact.getString("refinedMaskUri"));
      boolean passed = session.inferenceRan && refined.exists() && refined.length() > 0;

      JSONObject result = new JSONObject();
      result.put("status", passed ? "pass" : "fail");
      result.put("maskUri", ForgeScanNativeFiles.fileUri(refined));
      result.put("maskBytes", refined.exists() ? refined.length() : 0);
      result.put("mlKitAvailable", session.mlKitAvailable);
      result.put("defaultMaskingEngine", MLKIT_ENGINE);
      result.put("confidenceThreshold", MLKIT_FOREGROUND_THRESHOLD);
      result.put("modelExists", session.mlKitAvailable);
      result.put("modelLoaded", session.mlKitAvailable);
      result.put("inferenceRan", session.inferenceRan);
      result.put("maskPngWritten", session.maskPngWritten);
      result.put("modelStatus", session.mlKitAvailable ? "loaded" : "missing");
      result.put("modelName", session.modelName());
      result.put("engineName", session.engineName());
      result.put("modelAssetPath", session.mlKitAvailable ? "android-runtime:" + MLKIT_ENGINE : "");
      result.put("modelTier", session.mlKitAvailable ? MLKIT_ENGINE : FALLBACK_ENGINE);
      result.put("modelPreference", "auto-mobile");
      result.put("modelFileSize", 0);
      result.put("maskInputSize", 0);
      result.put("inferenceTimeMs", session.lastInferenceTimeMs);
      result.put("errorCode", "");
      result.put("lastInferenceError", session.lastInferenceError);
      result.put("memoryBeforeLoad", currentMemoryJson());
      result.put("memoryAfterLoad", currentMemoryJson());
      result.put("activeMaskingEngine", session.engineName());
      result.put("maskingEngineStatus", maskingEngineStatus(session));
      result.put("inferenceBackend", session.mlKitAvailable ? MLKIT_ENGINE : "none");
      result.put("fallbackUsed", session.fallbackUsed);
      result.put("warnings", artifact.getJSONArray("warnings"));
      result.put("errors", artifact.getJSONArray("errors"));
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(maskSmokeFailureJson(error));
    }
  }

  @ReactMethod
  public void cancelMasking(Promise promise) {
    cancelled = true;
    promise.resolve(null);
  }

  private JSONObject runMaskForFrame(
    JSONObject input,
    JSONObject frame,
    MaskingSession session
  ) throws Exception {
    String rotationId = frame.getString("rotationId");
    int frameIndex = frame.getInt("frameIndex");
    String sourceFrameUri = frame.getString("frameUri");
    File source = ForgeScanNativeFiles.fileFromUri(sourceFrameUri);
    Bitmap bitmap = BitmapFactory.decodeFile(source.getAbsolutePath());

    if (bitmap == null) {
      throw new IOException("Unable to decode source frame: " + sourceFrameUri);
    }

    Bitmap rawMask = session.createMask(bitmap);
    Bitmap refinedMask = refineMask(rawMask);
    String frameName = "frame_" + String.format("%03d", frameIndex) + ".png";
    File rawFile = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      "advanced/masks/raw/" + rotationId + "/" + frameName
    );
    File refinedFile = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      "advanced/masks/refined/" + rotationId + "/" + frameName
    );

    writePng(rawMask, rawFile);
    writePng(refinedMask, refinedFile);
    session.maskPngWritten =
      rawFile.exists() && rawFile.length() > 0 && refinedFile.exists() && refinedFile.length() > 0;

    JSONObject artifact = baseArtifact(frame);
    artifact.put("sourceFrameUri", sourceFrameUri);
    artifact.put("rawMaskPath", "advanced/masks/raw/" + rotationId + "/" + frameName);
    artifact.put("refinedMaskPath", "advanced/masks/refined/" + rotationId + "/" + frameName);
    artifact.put("rawMaskUri", ForgeScanNativeFiles.fileUri(rawFile));
    artifact.put("refinedMaskUri", ForgeScanNativeFiles.fileUri(refinedFile));
    artifact.put("rawMaskBytes", rawFile.exists() ? rawFile.length() : 0);
    artifact.put("refinedMaskBytes", refinedFile.exists() ? refinedFile.length() : 0);
    artifact.put("engineName", session.engineName());
    artifact.put("modelName", session.modelName());
    artifact.put("modelLoaded", session.mlKitAvailable);
    artifact.put("inferenceRan", session.inferenceRan);
    artifact.put("maskPngWritten", session.maskPngWritten);
    artifact.put("inferenceTimeMs", session.lastInferenceTimeMs);
    artifact.put("confidenceThreshold", MLKIT_FOREGROUND_THRESHOLD);
    artifact.put("inputFramePath", source.getAbsolutePath());
    artifact.put("status", "complete");

    if (session.fallbackUsed) {
      artifact.getJSONArray("warnings").put(
        "Fallback local mask was written. This is not ML Kit object/background segmentation."
      );
    }
    if (!session.lastInferenceError.isEmpty()) {
      artifact.getJSONArray("errors").put(session.lastInferenceError);
    }

    return artifact;
  }

  private JSONObject baseArtifact(JSONObject frame) throws Exception {
    JSONObject artifact = new JSONObject();
    artifact.put("rotationId", frame.getString("rotationId"));
    artifact.put("frameIndex", frame.getInt("frameIndex"));
    artifact.put("sourceFrameUri", frame.optString("frameUri", ""));
    artifact.put("rawMaskPath", "");
    artifact.put("refinedMaskPath", "");
    artifact.put("warnings", new JSONArray());
    artifact.put("errors", new JSONArray());
    return artifact;
  }

  private Bitmap refineMask(Bitmap rawMask) {
    return rawMask.copy(Bitmap.Config.ARGB_8888, false);
  }

  private Bitmap createMlKitSubjectMask(Bitmap source) throws Exception {
    SubjectSegmenterOptions options = new SubjectSegmenterOptions.Builder()
      .enableForegroundBitmap()
      .enableForegroundConfidenceMask()
      .build();
    SubjectSegmenter segmenter = SubjectSegmentation.getClient(options);
    try {
      InputImage image = InputImage.fromBitmap(source, 0);
      SubjectSegmentationResult result = Tasks.await(
        segmenter.process(image),
        30,
        TimeUnit.SECONDS
      );
      return maskFromMlKitResult(result, source.getWidth(), source.getHeight());
    } finally {
      segmenter.close();
    }
  }

  private Bitmap maskFromMlKitResult(
    SubjectSegmentationResult result,
    int targetWidth,
    int targetHeight
  ) throws IOException {
    FloatBuffer confidence = result.getForegroundConfidenceMask();
    if (confidence == null || confidence.capacity() == 0) {
      Bitmap foreground = result.getForegroundBitmap();
      if (foreground != null) {
        return maskFromForegroundBitmap(foreground, targetWidth, targetHeight);
      }
      throw new IOException("ML Kit did not return a foreground confidence mask.");
    }

    confidence.rewind();
    int count = confidence.capacity();
    MaskDimensions dimensions = inferMaskDimensions(count, targetWidth, targetHeight);
    Bitmap mask = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
    int[] pixels = new int[targetWidth * targetHeight];

    for (int y = 0; y < targetHeight; y += 1) {
      int my = Math.min(
        dimensions.height - 1,
        Math.max(0, Math.round((y / (float) Math.max(1, targetHeight - 1)) * (dimensions.height - 1)))
      );
      for (int x = 0; x < targetWidth; x += 1) {
        int mx = Math.min(
          dimensions.width - 1,
          Math.max(0, Math.round((x / (float) Math.max(1, targetWidth - 1)) * (dimensions.width - 1)))
        );
        int index = Math.min(count - 1, my * dimensions.width + mx);
        float value = confidence.get(index);
        pixels[y * targetWidth + x] =
          value >= MLKIT_FOREGROUND_THRESHOLD ? Color.WHITE : Color.TRANSPARENT;
      }
    }

    mask.setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight);
    return mask;
  }

  private Bitmap maskFromForegroundBitmap(Bitmap foreground, int targetWidth, int targetHeight) {
    Bitmap scaled = Bitmap.createScaledBitmap(foreground, targetWidth, targetHeight, true);
    Bitmap mask = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
    int[] pixels = new int[targetWidth * targetHeight];
    for (int y = 0; y < targetHeight; y += 1) {
      for (int x = 0; x < targetWidth; x += 1) {
        int color = scaled.getPixel(x, y);
        pixels[y * targetWidth + x] = Color.alpha(color) > 216 ? Color.WHITE : Color.TRANSPARENT;
      }
    }
    mask.setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight);
    return mask;
  }

  private MaskDimensions inferMaskDimensions(int count, int targetWidth, int targetHeight) {
    if (count == targetWidth * targetHeight) {
      return new MaskDimensions(targetWidth, targetHeight);
    }

    double aspect = targetWidth / (double) Math.max(1, targetHeight);
    int height = Math.max(1, (int) Math.round(Math.sqrt(count / Math.max(0.01, aspect))));
    int width = Math.max(1, count / height);
    while (width * height < count) {
      width += 1;
    }
    return new MaskDimensions(width, height);
  }

  private Bitmap createFallbackMask(Bitmap source) {
    Bitmap mask = Bitmap.createBitmap(source.getWidth(), source.getHeight(), Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(mask);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.WHITE);
    float insetX = source.getWidth() * 0.18f;
    float insetY = source.getHeight() * 0.14f;
    canvas.drawOval(insetX, insetY, source.getWidth() - insetX, source.getHeight() - insetY, paint);
    return mask;
  }

  private void writePng(Bitmap bitmap, File file) throws IOException {
    ForgeScanNativeFiles.ensureParent(file);
    FileOutputStream stream = new FileOutputStream(file);
    try {
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
        throw new IOException("Unable to write PNG mask: " + file.getAbsolutePath());
      }
    } finally {
      stream.close();
    }
  }

  private void writeSmokeSource(File file) throws IOException {
    Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.rgb(28, 84, 88));
    canvas.drawRect(0, 0, 96, 96, paint);
    paint.setColor(Color.rgb(230, 190, 118));
    canvas.drawCircle(48, 48, 28, paint);
    writePng(bitmap, file);
  }

  private boolean mlKitRuntimeAvailable() {
    try {
      Class.forName("com.google.mlkit.vision.segmentation.subject.SubjectSegmentation");
      Class.forName("com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions");
      return true;
    } catch (Throwable ignored) {
      return false;
    }
  }

  private JSONArray detectedModelsJson(boolean mlKitAvailable) {
    JSONArray models = new JSONArray();
    try {
      JSONObject model = new JSONObject();
      model.put("path", "android-runtime:" + MLKIT_ENGINE);
      model.put("tier", MLKIT_ENGINE);
      model.put("runtime", MLKIT_ENGINE);
      model.put("present", mlKitAvailable);
      model.put("fileSize", 0);
      model.put("quantized", false);
      model.put("fullModel", false);
      model.put("defaultEligible", true);
      models.put(model);
    } catch (Exception ignored) {
    }
    return models;
  }

  private String maskingEngineStatus(MaskingSession session) {
    if (session.mlKitAvailable) {
      return session.inferenceRan ? "mlkit-complete" : "mlkit-running";
    }
    return FALLBACK_ENGINE;
  }

  private void appendAll(JSONArray destination, JSONArray source) {
    for (int index = 0; index < source.length(); index += 1) {
      destination.put(source.opt(index));
    }
  }

  private JSONObject currentMemoryJson() {
    Runtime runtime = Runtime.getRuntime();
    long maxMemory = runtime.maxMemory();
    long totalMemory = runtime.totalMemory();
    long freeMemory = runtime.freeMemory();
    JSONObject result = new JSONObject();
    try {
      result.put("maxMemoryBytes", maxMemory);
      result.put("totalMemoryBytes", totalMemory);
      result.put("freeMemoryBytes", freeMemory);
      result.put("availableMemoryBytes", Math.max(0, maxMemory - totalMemory + freeMemory));
    } catch (Exception ignored) {
    }
    return result;
  }

  private String maskingAvailabilityFailureJson(Throwable error) {
    try {
      JSONObject result = new JSONObject();
      result.put("available", false);
      result.put("mode", "unavailable");
      result.put("moduleName", NAME);
      result.put("reason", "Native masking availability check failed.");
      result.put("errors", new JSONArray().put(safeMessage(error)));
      result.put("warnings", new JSONArray());
      return result.toString();
    } catch (Exception ignored) {
      return "{\"available\":false,\"mode\":\"unavailable\",\"moduleName\":\"ForgeScanNativeMasking\",\"warnings\":[],\"errors\":[\"Unable to encode native failure.\"]}";
    }
  }

  private String maskingFailureJson(Throwable error) {
    try {
      JSONObject result = new JSONObject();
      result.put("status", "failed");
      result.put("maskArtifacts", new JSONArray());
      result.put("engineName", FALLBACK_ENGINE);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("modelName", FALLBACK_ENGINE);
      result.put("modelExists", false);
      result.put("modelLoaded", false);
      result.put("inferenceRan", false);
      result.put("maskPngWritten", false);
      result.put("modelStatus", "load-failed");
      result.put("errorCode", "NATIVE_ERROR");
      result.put("fallbackUsed", true);
      result.put("activeMaskingEngine", FALLBACK_ENGINE);
      result.put("maskingEngineStatus", FALLBACK_ENGINE);
      result.put("memoryBeforeLoad", currentMemoryJson());
      result.put("memoryAfterLoad", currentMemoryJson());
      result.put("warnings", new JSONArray().put("Native masking failed."));
      result.put("errors", new JSONArray().put(safeMessage(error)));
      return result.toString();
    } catch (Exception ignored) {
      return "{\"status\":\"failed\",\"maskArtifacts\":[],\"engineName\":\"fallback-local\",\"modelName\":\"fallback-local\",\"warnings\":[\"Native masking failed.\"],\"errors\":[\"Unable to encode native failure.\"]}";
    }
  }

  private String maskSmokeFailureJson(Throwable error) {
    try {
      JSONObject result = new JSONObject();
      result.put("status", "fail");
      result.put("maskBytes", 0);
      result.put("modelExists", false);
      result.put("modelLoaded", false);
      result.put("inferenceRan", false);
      result.put("maskPngWritten", false);
      result.put("modelStatus", "load-failed");
      result.put("errorCode", "NATIVE_ERROR");
      result.put("engineName", FALLBACK_ENGINE);
      result.put("activeMaskingEngine", FALLBACK_ENGINE);
      result.put("fallbackUsed", true);
      result.put("memoryBeforeLoad", currentMemoryJson());
      result.put("memoryAfterLoad", currentMemoryJson());
      result.put("warnings", new JSONArray().put("Native masking smoke test failed."));
      result.put("errors", new JSONArray().put(safeMessage(error)));
      return result.toString();
    } catch (Exception ignored) {
      return "{\"status\":\"fail\",\"warnings\":[\"Native masking smoke test failed.\"],\"errors\":[\"Unable to encode native failure.\"]}";
    }
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }

  private class MaskingSession {
    final boolean mlKitAvailable;
    boolean inferenceRan = false;
    boolean maskPngWritten = false;
    boolean fallbackUsed = false;
    long lastInferenceTimeMs = 0;
    String lastInferenceError = "";

    MaskingSession(boolean mlKitAvailable) {
      this.mlKitAvailable = mlKitAvailable;
      this.fallbackUsed = !mlKitAvailable;
    }

    String engineName() {
      return mlKitAvailable ? "ML Kit Subject Segmentation" : FALLBACK_ENGINE;
    }

    String modelName() {
      return mlKitAvailable ? MLKIT_ENGINE : FALLBACK_ENGINE;
    }

    Bitmap createMask(Bitmap source) {
      if (!mlKitAvailable) {
        return createFallbackMask(source);
      }

      try {
        long startedAt = System.currentTimeMillis();
        Bitmap mask = createMlKitSubjectMask(source);
        lastInferenceTimeMs = System.currentTimeMillis() - startedAt;
        inferenceRan = true;
        lastInferenceError = "";
        return mask;
      } catch (Throwable error) {
        inferenceRan = false;
        fallbackUsed = true;
        lastInferenceError = safeMessage(error);
        if (error instanceof OutOfMemoryError) {
          System.gc();
        }
        return createFallbackMask(source);
      }
    }
  }

  private static class MaskDimensions {
    final int width;
    final int height;

    MaskDimensions(int width, int height) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
    }
  }
}
