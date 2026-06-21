package com.forgescan.nativeengines;

import android.app.Activity;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.google.ar.core.ArCoreApk;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanARCaptureModule.NAME)
public class ForgeScanARCaptureModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanARCapture";
  private static final String ENGINE_VERSION = "0.1.0";

  public ForgeScanARCaptureModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getAvailability(Promise promise) {
    try {
      JSONObject result = baseAvailability();
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(failureJson("ARCore availability check failed.", error));
    }
  }

  @ReactMethod
  public void runKeyframeCaptureSmokeTest(String inputJson, Promise promise) {
    try {
      JSONObject input = inputJson == null || inputJson.isEmpty()
        ? new JSONObject()
        : new JSONObject(inputJson);
      JSONObject availability = baseAvailability();
      JSONArray frames = input.optJSONArray("frames");
      JSONArray keyframes = new JSONArray();
      if (frames != null) {
        for (int index = 0; index < frames.length(); index += 1) {
          JSONObject frame = frames.optJSONObject(index);
          if (frame == null) {
            continue;
          }
          keyframes.put(createFallbackKeyframe(frame, index, Math.max(1, frames.length())));
        }
      }

      JSONObject metadata = new JSONObject();
      metadata.put("status", "fallback-turntable");
      metadata.put("moduleName", NAME);
      metadata.put("engineVersion", ENGINE_VERSION);
      metadata.put("arCoreAvailable", availability.optBoolean("arCoreAvailable", false));
      metadata.put("arCoreAvailability", availability.optString("arCoreAvailability", "unknown"));
      metadata.put("liveCameraSessionImplemented", false);
      metadata.put("fallbackTurntablePoseUsed", true);
      metadata.put("keyframeCount", keyframes.length());
      metadata.put("cameraIntrinsicsCaptured", false);
      metadata.put("cameraExtrinsicsCaptured", false);
      metadata.put("keyframeSamplingSeconds", 0.5);
      metadata.put("keyframes", keyframes);
      metadata.put(
        "warnings",
        new JSONArray()
          .put("ARCore native module is installed and checked.")
          .put("Live ARCore camera-session keyframe capture requires the next native camera surface integration.")
          .put("ARCore tracking unavailable. Using turntable pose assumptions.")
      );
      metadata.put("errors", new JSONArray());

      File output = ForgeScanNativeFiles.resolveProjectFile(
        getReactApplicationContext(),
        input,
        "advanced/camera/keyframes.json"
      );
      writeJson(output, metadata);

      JSONObject result = new JSONObject(metadata.toString());
      result.put("keyframesPath", "advanced/camera/keyframes.json");
      result.put("keyframesUri", ForgeScanNativeFiles.fileUri(output));
      result.put("keyframesBytes", output.exists() ? output.length() : 0);
      result.put("status", output.exists() && output.length() > 0 ? "fallback-turntable" : "failed");
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(failureJson("ARCore keyframe smoke test failed.", error));
    }
  }

  private JSONObject baseAvailability() throws Exception {
    boolean runtimeAvailable = arCoreRuntimeAvailable();
    String availabilityName = runtimeAvailable ? "unknown" : "missing-arcore-runtime";
    boolean supported = false;
    boolean transientStatus = false;
    String warning = "";

    if (runtimeAvailable) {
      try {
        ArCoreApk.Availability availability =
          ArCoreApk.getInstance().checkAvailability(getReactApplicationContext());
        availabilityName = availability.name();
        supported = availability.isSupported();
        transientStatus = availability.isTransient();
      } catch (Throwable error) {
        warning = safeMessage(error);
      }
    }

    Activity activity = getCurrentActivity();
    JSONObject result = new JSONObject();
    result.put("available", runtimeAvailable);
    result.put("moduleName", NAME);
    result.put("engineVersion", ENGINE_VERSION);
    result.put("arCoreRuntimePresent", runtimeAvailable);
    result.put("arCoreAvailable", supported);
    result.put("arCoreAvailability", availabilityName);
    result.put("availabilityTransient", transientStatus);
    result.put("activityAttached", activity != null);
    result.put("trackingState", supported ? "available-not-started" : "unavailable");
    result.put("keyframeCaptureImplemented", false);
    result.put("fallbackTurntablePoseUsed", !supported);
    result.put("cameraIntrinsicsCaptured", false);
    result.put("cameraExtrinsicsCaptured", false);
    result.put("keyframeCount", 0);
    result.put("warnings", warning.isEmpty() ? new JSONArray() : new JSONArray().put(warning));
    result.put("errors", new JSONArray());
    return result;
  }

  private boolean arCoreRuntimeAvailable() {
    try {
      Class.forName("com.google.ar.core.ArCoreApk");
      return true;
    } catch (Throwable ignored) {
      return false;
    }
  }

  private JSONObject createFallbackKeyframe(
    JSONObject frame,
    int index,
    int totalFrames
  ) throws Exception {
    int width = Math.max(1, frame.optInt("width", 1080));
    int height = Math.max(1, frame.optInt("height", 1920));
    double yaw = totalFrames > 0 ? (index / (double) totalFrames) * 360.0 : 0.0;
    String rotationId = frame.optString("rotationId", "upright");

    JSONObject intrinsics = new JSONObject();
    intrinsics.put("fx", width);
    intrinsics.put("fy", width);
    intrinsics.put("cx", width / 2.0);
    intrinsics.put("cy", height / 2.0);
    intrinsics.put("width", width);
    intrinsics.put("height", height);

    JSONArray transform = new JSONArray();
    double radians = Math.toRadians(yaw);
    double cos = Math.cos(radians);
    double sin = Math.sin(radians);
    double[] matrix = new double[] {
      cos, 0, sin, 0,
      0, 1, 0, 0,
      -sin, 0, cos, -2.2,
      0, 0, 0, 1
    };
    for (double value : matrix) {
      transform.put(value);
    }

    JSONObject keyframe = new JSONObject();
    keyframe.put("frameUri", frame.optString("frameUri", frame.optString("uri", "")));
    keyframe.put("timestamp", frame.optString("timestamp", frame.optString("capturedAt", "")));
    keyframe.put("rotationId", rotationId);
    keyframe.put("frameIndex", frame.optInt("frameIndex", frame.optInt("index", index + 1)));
    keyframe.put("captureSource", "turntable-fallback");
    keyframe.put("trackingState", "fallback-turntable");
    keyframe.put("cameraIntrinsics", intrinsics);
    keyframe.put("cameraExtrinsics", transform);
    return keyframe;
  }

  private void writeJson(File file, JSONObject json) throws Exception {
    ForgeScanNativeFiles.ensureParent(file);
    FileOutputStream stream = new FileOutputStream(file);
    try {
      stream.write(json.toString(2).getBytes(StandardCharsets.UTF_8));
    } finally {
      stream.close();
    }
  }

  private String failureJson(String message, Throwable error) {
    try {
      JSONObject result = new JSONObject();
      result.put("status", "failed");
      result.put("available", false);
      result.put("moduleName", NAME);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("arCoreAvailable", false);
      result.put("trackingState", "failed");
      result.put("fallbackTurntablePoseUsed", true);
      result.put("warnings", new JSONArray().put(message));
      result.put("errors", new JSONArray().put(safeMessage(error)));
      return result.toString();
    } catch (Exception ignored) {
      return "{\"status\":\"failed\",\"warnings\":[\"ARCore diagnostic failed.\"],\"errors\":[\"Unable to encode ARCore diagnostic failure.\"]}";
    }
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }
}
