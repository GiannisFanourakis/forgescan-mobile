package com.forgescan.nativeengines;

import android.app.Activity;
import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.SharedCamera;
import com.google.ar.core.TrackingState;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanARCaptureModule.NAME)
public class ForgeScanARCaptureModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanARCapture";
  private static final String ENGINE_VERSION = "0.2.0";
  private static final int DEFAULT_KEYFRAME_INTERVAL_MS = 500;
  private static final int DEFAULT_MAX_KEYFRAMES = 60;
  private static final String KEYFRAME_PATH = "advanced/camera/keyframes.json";

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private Session arSession;
  private SharedCamera sharedCamera;
  private JSONObject sessionInput = new JSONObject();
  private JSONArray keyframes = new JSONArray();
  private JSONObject lastKeyframe;
  private Runnable timedCaptureRunnable;
  private boolean sessionRunning = false;
  private boolean sharedCameraStarted = false;
  private boolean timedCaptureRunning = false;
  private String lastNativeError = "";

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
      promise.resolve(baseAvailability().toString());
    } catch (Throwable error) {
      promise.resolve(failureJson("ARCore availability check failed.", error));
    }
  }

  @ReactMethod
  public void startSession(String inputJson, Promise promise) {
    try {
      JSONObject input = parseInput(inputJson);
      promise.resolve(startSessionInternal(input).toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("ARCore SharedCamera session failed to start.", error));
    }
  }

  @ReactMethod
  public void captureKeyframe(String inputJson, Promise promise) {
    try {
      JSONObject input = parseInput(inputJson);
      mergeSessionInput(input);
      JSONObject result = captureKeyframeInternal(input);
      promise.resolve(result.toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("ARCore tracked keyframe capture failed.", error));
    }
  }

  @ReactMethod
  public void startTimedKeyframeCapture(String inputJson, Promise promise) {
    try {
      JSONObject input = parseInput(inputJson);
      mergeSessionInput(input);
      JSONArray sourceFrames = input.optJSONArray("sourceFrames");
      if (sourceFrames == null || sourceFrames.length() == 0) {
        JSONObject failed = statusJson("failed");
        failed.put(
          "errors",
          new JSONArray().put("Timed ARCore capture needs real source frames from the active Camera2/CameraX capture stream.")
        );
        failed.put(
          "warnings",
          new JSONArray().put("No fake image frames were created.")
        );
        promise.resolve(failed.toString());
        return;
      }

      timedCaptureRunning = true;
      timedCaptureRunnable = createTimedCaptureRunnable(input, sourceFrames, 0);
      mainHandler.postDelayed(
        timedCaptureRunnable,
        Math.max(100, input.optInt("keyframeIntervalMs", DEFAULT_KEYFRAME_INTERVAL_MS))
      );

      JSONObject result = statusJson("timed-capture-running");
      result.put("sourceFrameCount", sourceFrames.length());
      result.put("keyframeIntervalMs", input.optInt("keyframeIntervalMs", DEFAULT_KEYFRAME_INTERVAL_MS));
      promise.resolve(result.toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("Timed ARCore keyframe capture failed.", error));
    }
  }

  @ReactMethod
  public void stopTimedKeyframeCapture(Promise promise) {
    try {
      if (timedCaptureRunnable != null) {
        mainHandler.removeCallbacks(timedCaptureRunnable);
      }
      timedCaptureRunnable = null;
      timedCaptureRunning = false;
      JSONObject result = statusJson("ready");
      result.put("message", "Timed ARCore keyframe capture stopped.");
      promise.resolve(result.toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("Stopping timed ARCore keyframe capture failed.", error));
    }
  }

  @ReactMethod
  public void getSessionStatus(Promise promise) {
    try {
      promise.resolve(statusJson(sessionRunning ? "ready" : "not-started").toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("ARCore session status failed.", error));
    }
  }

  @ReactMethod
  public void endSession(Promise promise) {
    try {
      endCurrentSession(true);
      JSONObject result = statusJson("ended");
      result.put("message", "ARCore SharedCamera session ended.");
      promise.resolve(result.toString());
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      promise.resolve(failureJson("Ending ARCore session failed.", error));
    }
  }

  @ReactMethod
  public void runKeyframeCaptureSmokeTest(String inputJson, Promise promise) {
    try {
      JSONObject input = parseInput(inputJson);
      JSONObject availability = baseAvailability();
      JSONArray frames = input.optJSONArray("frames");
      if (frames == null || frames.length() == 0) {
        JSONObject result = new JSONObject(availability.toString());
        result.put("status", "failed");
        result.put("keyframeCount", 0);
        result.put("warnings", new JSONArray().put("No captured frames were provided for the ARCore smoke test."));
        result.put("errors", new JSONArray().put("Capture one real frame first, then run this test."));
        promise.resolve(result.toString());
        return;
      }

      startSessionInternal(input);
      JSONObject firstFrame = frames.getJSONObject(0);
      JSONObject keyframeInput = new JSONObject(input.toString());
      keyframeInput.put("rotationId", firstFrame.optString("rotationId", "upright"));
      keyframeInput.put("frameIndex", firstFrame.optInt("frameIndex", 1));
      keyframeInput.put("sourceFrameUri", firstFrame.optString("frameUri", firstFrame.optString("uri", "")));
      keyframeInput.put("width", firstFrame.optInt("width", 0));
      keyframeInput.put("height", firstFrame.optInt("height", 0));
      JSONObject result = captureKeyframeInternal(keyframeInput);
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(failureJson("ARCore keyframe smoke test failed.", error));
    }
  }

  private JSONObject startSessionInternal(JSONObject input) throws Exception {
    sessionInput = input;
    keyframes = new JSONArray();
    lastKeyframe = null;

    Activity activity = getCurrentActivity();
    if (activity == null) {
      throw new IllegalStateException("No Android Activity attached.");
    }

    JSONObject availability = baseAvailability();
    if (!availability.optBoolean("arCoreAvailable", false)) {
      throw new IllegalStateException("ARCore is unavailable on this device/runtime.");
    }

    endCurrentSession(false);
    arSession = new Session(activity, EnumSet.of(Session.Feature.SHARED_CAMERA));
    sharedCamera = arSession.getSharedCamera();
    Config config = new Config(arSession);
    config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
    arSession.configure(config);
    arSession.resume();
    sessionRunning = true;
    sharedCameraStarted = sharedCamera != null;
    lastNativeError = "";

    JSONObject result = statusJson("ready");
    result.put("message", "ARCore SharedCamera session started.");
    result.put("sharedCameraSupported", sharedCameraStarted);
    return result;
  }

  private JSONObject captureKeyframeInternal(JSONObject input) throws Exception {
    if (!sessionRunning || arSession == null) {
      throw new IllegalStateException("Start an ARCore SharedCamera session before capturing a tracked keyframe.");
    }

    String sourceUri = input.optString("sourceFrameUri", input.optString("frameUri", input.optString("uri", "")));
    if (sourceUri.isEmpty()) {
      throw new IllegalArgumentException("Tracked keyframe capture needs a real sourceFrameUri. No placeholder frame was written.");
    }

    String rotationId = input.optString("rotationId", "upright");
    int frameIndex = Math.max(1, input.optInt("frameIndex", keyframes.length() + 1));
    File source = ForgeScanNativeFiles.fileFromUri(sourceUri);
    if (!source.exists() || source.length() <= 0) {
      throw new IllegalArgumentException("Source frame does not exist or is empty: " + sourceUri);
    }

    File output = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      "advanced/camera/frames/" + rotationId + "/frame_" + String.format("%03d", frameIndex) + ".jpg"
    );
    copyFile(source, output);

    String poseWarning = "";
    JSONObject pose;
    try {
      pose = captureCurrentPose(input);
    } catch (Throwable error) {
      pose = new JSONObject();
      pose.put("trackingState", "unknown");
      poseWarning = "ARCore pose update failed: " + safeMessage(error);
      lastNativeError = poseWarning;
    }
    String trackingState = pose.optString("trackingState", "unknown");
    boolean tracked = "TRACKING".equals(trackingState) &&
      pose.has("cameraIntrinsics") &&
      pose.has("cameraExtrinsics");
    String poseSynchronization = tracked ? "camera-photo-associated" : "missing";

    JSONObject keyframe = new JSONObject();
    keyframe.put("frameUri", ForgeScanNativeFiles.fileUri(output));
    keyframe.put("framePath", "advanced/camera/frames/" + rotationId + "/frame_" + String.format("%03d", frameIndex) + ".jpg");
    keyframe.put("timestamp", input.optString("timestamp", Long.toString(System.currentTimeMillis())));
    keyframe.put("frameIndex", frameIndex);
    keyframe.put("rotationId", rotationId);
    keyframe.put("captureSource", tracked ? "arcore-shared-camera" : "camera");
    keyframe.put("poseSynchronization", poseSynchronization);
    keyframe.put("trackingState", trackingState);
    keyframe.put("cameraTransformConvention", "ARCore camera pose matrix, column-major, camera-to-world transform.");
    keyframe.put("sourceFrameUri", sourceUri);
    if (pose.has("cameraIntrinsics")) {
      keyframe.put("cameraIntrinsics", pose.getJSONObject("cameraIntrinsics"));
    }
    if (pose.has("cameraExtrinsics")) {
      keyframe.put("cameraExtrinsics", pose.getJSONObject("cameraExtrinsics"));
    }
    keyframe.put("exposureMetadata", exposureMetadata(input));
    keyframe.put("lensMetadata", lensMetadata(input));

    keyframes.put(keyframe);
    lastKeyframe = keyframe;
    writeKeyframes(input);

    JSONObject result = statusJson(tracked ? "tracked" : "untracked");
    result.put("keyframe", keyframe);
    result.put("frameUri", keyframe.getString("frameUri"));
    result.put("framePath", keyframe.getString("framePath"));
    result.put("keyframeCount", keyframes.length());
    result.put("keyframesPath", KEYFRAME_PATH);
    result.put("captureSource", keyframe.getString("captureSource"));
    result.put("poseSynchronization", poseSynchronization);
    result.put("trackingState", trackingState);
    result.put("cameraIntrinsicsCaptured", pose.has("cameraIntrinsics"));
    result.put("cameraExtrinsicsCaptured", pose.has("cameraExtrinsics"));
    if (!tracked) {
      JSONArray warnings = new JSONArray()
        .put("Untracked capture does not contain camera pose matrices. Results may fail or use rough turntable assumptions.")
        .put("ARCore tracking state was " + trackingState + ".");
      if (!poseWarning.isEmpty()) {
        warnings.put(poseWarning);
      }
      result.put("warnings", warnings);
    }
    return result;
  }

  private JSONObject captureCurrentPose(JSONObject input) throws Exception {
    JSONObject result = new JSONObject();
    Frame frame = arSession.update();
    Camera camera = frame.getCamera();
    TrackingState trackingState = camera.getTrackingState();
    result.put("trackingState", trackingState.name());

    if (trackingState != TrackingState.TRACKING) {
      return result;
    }

    CameraIntrinsics intrinsics = camera.getImageIntrinsics();
    float[] focalLength = intrinsics.getFocalLength();
    float[] principalPoint = intrinsics.getPrincipalPoint();
    int[] dimensions = intrinsics.getImageDimensions();
    JSONObject intrinsicsJson = new JSONObject();
    intrinsicsJson.put("fx", focalLength.length > 0 ? focalLength[0] : input.optDouble("width", 0));
    intrinsicsJson.put("fy", focalLength.length > 1 ? focalLength[1] : input.optDouble("width", 0));
    intrinsicsJson.put("cx", principalPoint.length > 0 ? principalPoint[0] : input.optDouble("width", 0) / 2.0);
    intrinsicsJson.put("cy", principalPoint.length > 1 ? principalPoint[1] : input.optDouble("height", 0) / 2.0);
    intrinsicsJson.put("width", dimensions.length > 0 ? dimensions[0] : input.optInt("width", 0));
    intrinsicsJson.put("height", dimensions.length > 1 ? dimensions[1] : input.optInt("height", 0));

    Pose pose = camera.getPose();
    float[] matrix = new float[16];
    pose.toMatrix(matrix, 0);
    JSONArray transform = new JSONArray();
    for (float value : matrix) {
      transform.put(value);
    }
    JSONObject extrinsicsJson = new JSONObject();
    extrinsicsJson.put("transform", transform);
    extrinsicsJson.put("convention", "ARCore camera pose matrix, column-major, camera-to-world transform.");

    result.put("cameraIntrinsics", intrinsicsJson);
    result.put("cameraExtrinsics", extrinsicsJson);
    return result;
  }

  private Runnable createTimedCaptureRunnable(JSONObject input, JSONArray frames, int index) {
    return () -> {
      try {
        if (!timedCaptureRunning || index >= frames.length()) {
          timedCaptureRunning = false;
          return;
        }

        JSONObject frame = frames.getJSONObject(index);
        JSONObject keyframeInput = new JSONObject(input.toString());
        keyframeInput.put("rotationId", frame.optString("rotationId", input.optString("rotationId", "upright")));
        keyframeInput.put("frameIndex", frame.optInt("frameIndex", index + 1));
        keyframeInput.put("sourceFrameUri", frame.optString("frameUri", frame.optString("uri", "")));
        keyframeInput.put("width", frame.optInt("width", input.optInt("width", 0)));
        keyframeInput.put("height", frame.optInt("height", input.optInt("height", 0)));
        captureKeyframeInternal(keyframeInput);

        timedCaptureRunnable = createTimedCaptureRunnable(input, frames, index + 1);
        mainHandler.postDelayed(
          timedCaptureRunnable,
          Math.max(100, input.optInt("keyframeIntervalMs", DEFAULT_KEYFRAME_INTERVAL_MS))
        );
      } catch (Throwable error) {
        lastNativeError = safeMessage(error);
        timedCaptureRunning = false;
      }
    };
  }

  private JSONObject baseAvailability() throws Exception {
    boolean runtimeAvailable = arCoreRuntimeAvailable();
    String availabilityName = runtimeAvailable ? "unknown" : "missing-arcore-runtime";
    boolean supported = false;
    boolean transientStatus = false;
    JSONArray warnings = new JSONArray();
    JSONArray errors = new JSONArray();

    if (runtimeAvailable) {
      try {
        ArCoreApk.Availability availability =
          ArCoreApk.getInstance().checkAvailability(getReactApplicationContext());
        availabilityName = availability.name();
        supported = availability.isSupported();
        transientStatus = availability.isTransient();
      } catch (Throwable error) {
        errors.put(safeMessage(error));
      }
    }

    JSONObject camera2 = camera2Availability();
    Activity activity = getCurrentActivity();
    JSONObject result = new JSONObject();
    result.put("available", runtimeAvailable && supported);
    result.put("moduleName", NAME);
    result.put("engineVersion", ENGINE_VERSION);
    result.put("arCoreRuntimePresent", runtimeAvailable);
    result.put("arCoreAvailable", supported);
    result.put("arCoreAvailability", availabilityName);
    result.put("availabilityTransient", transientStatus);
    result.put("sharedCameraSupported", runtimeAvailable && supported);
    result.put("camera2Available", camera2.optBoolean("camera2Available", false));
    result.put("supportedPhysicalCameras", camera2.optJSONArray("supportedPhysicalCameras"));
    result.put("supportedLensOptions", camera2.optJSONArray("supportedLensOptions"));
    result.put("canLockExposure", camera2.optBoolean("canLockExposure", false));
    result.put("canLockWhiteBalance", camera2.optBoolean("canLockWhiteBalance", false));
    result.put("canLockFocus", camera2.optBoolean("canLockFocus", false));
    result.put("activityAttached", activity != null);
    result.put("trackingState", sessionRunning ? currentTrackingState() : supported ? "available-not-started" : "unavailable");
    result.put("keyframeCaptureImplemented", true);
    result.put("fallbackTurntablePoseUsed", false);
    result.put("cameraIntrinsicsCaptured", lastKeyframe != null && lastKeyframe.has("cameraIntrinsics"));
    result.put("cameraExtrinsicsCaptured", lastKeyframe != null && lastKeyframe.has("cameraExtrinsics"));
    result.put("keyframeCount", keyframes.length());
    result.put("lastKeyframePath", lastKeyframe == null ? JSONObject.NULL : lastKeyframe.optString("framePath"));
    result.put("lastPoseSynchronization", lastKeyframe == null ? JSONObject.NULL : lastKeyframe.optString("poseSynchronization", "missing"));
    result.put("lastPoseMatrix", lastKeyframe == null || !lastKeyframe.has("cameraExtrinsics")
      ? JSONObject.NULL
      : lastKeyframe.getJSONObject("cameraExtrinsics").optJSONArray("transform"));
    result.put("lastNativeError", lastNativeError);
    if (!runtimeAvailable || !supported) {
      warnings.put("ARCore is unavailable. Basic untracked capture can still save images but is not suitable for real Gaussian Splat optimization.");
    }
    result.put("warnings", warnings);
    result.put("errors", errors);
    return result;
  }

  private JSONObject camera2Availability() {
    JSONObject result = new JSONObject();
    JSONArray physicalCameras = new JSONArray();
    JSONArray lensOptions = new JSONArray();
    boolean camera2Available = false;
    boolean canLockExposure = false;
    boolean canLockWhiteBalance = false;
    boolean canLockFocus = false;

    try {
      CameraManager manager = (CameraManager) getReactApplicationContext().getSystemService(Context.CAMERA_SERVICE);
      if (manager == null) {
        result.put("camera2Available", false);
        result.put("supportedPhysicalCameras", physicalCameras);
        result.put("supportedLensOptions", lensOptions);
        result.put("canLockExposure", false);
        result.put("canLockWhiteBalance", false);
        result.put("canLockFocus", false);
        return result;
      }

      for (String cameraId : manager.getCameraIdList()) {
        CameraCharacteristics characteristics = manager.getCameraCharacteristics(cameraId);
        Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
        if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) {
          continue;
        }

        camera2Available = true;
        physicalCameras.put(cameraId);
        Boolean aeLock = characteristics.get(CameraCharacteristics.CONTROL_AE_LOCK_AVAILABLE);
        Boolean awbLock = characteristics.get(CameraCharacteristics.CONTROL_AWB_LOCK_AVAILABLE);
        Float minFocusDistance = characteristics.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
        float[] focalLengths = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        canLockExposure = canLockExposure || Boolean.TRUE.equals(aeLock) || hasCapability(characteristics, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR);
        canLockWhiteBalance = canLockWhiteBalance || Boolean.TRUE.equals(awbLock);
        canLockFocus = canLockFocus || (minFocusDistance != null && minFocusDistance > 0);
        if (focalLengths != null) {
          for (float focalLength : focalLengths) {
            lensOptions.put(lensLabel(focalLength));
          }
        }
      }
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
    }

    try {
      result.put("camera2Available", camera2Available);
      result.put("supportedPhysicalCameras", physicalCameras);
      result.put("supportedLensOptions", uniqueArray(lensOptions));
      result.put("canLockExposure", canLockExposure);
      result.put("canLockWhiteBalance", canLockWhiteBalance);
      result.put("canLockFocus", canLockFocus);
    } catch (Exception ignored) {
      // JSONObject put only fails for invalid numbers, which are not used here.
    }
    return result;
  }

  private boolean hasCapability(CameraCharacteristics characteristics, int capability) {
    int[] capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
    if (capabilities == null) {
      return false;
    }
    for (int candidate : capabilities) {
      if (candidate == capability) {
        return true;
      }
    }
    return false;
  }

  private String lensLabel(float focalLengthMm) {
    if (focalLengthMm <= 2.5f) {
      return "ultrawide";
    }
    if (focalLengthMm >= 7.0f) {
      return "telephoto";
    }
    return "wide";
  }

  private JSONArray uniqueArray(JSONArray values) {
    JSONArray unique = new JSONArray();
    for (int index = 0; index < values.length(); index += 1) {
      String value = values.optString(index);
      boolean exists = false;
      for (int uniqueIndex = 0; uniqueIndex < unique.length(); uniqueIndex += 1) {
        if (value.equals(unique.optString(uniqueIndex))) {
          exists = true;
          break;
        }
      }
      if (!exists && !value.isEmpty()) {
        unique.put(value);
      }
    }
    if (unique.length() == 0) {
      unique.put("default");
    }
    return unique;
  }

  private String currentTrackingState() {
    try {
      Frame frame = arSession.update();
      return frame.getCamera().getTrackingState().name();
    } catch (Throwable error) {
      lastNativeError = safeMessage(error);
      return "unknown";
    }
  }

  private JSONObject statusJson(String status) throws Exception {
    JSONObject availability = baseAvailability();
    availability.put("status", status);
    availability.put("sessionRunning", sessionRunning);
    availability.put("sharedCameraSessionStarted", sharedCameraStarted);
    availability.put("timedCaptureRunning", timedCaptureRunning);
    availability.put("keyframeCount", keyframes.length());
    availability.put("keyframesPath", KEYFRAME_PATH);
    if (lastKeyframe != null) {
      availability.put("lastKeyframe", lastKeyframe);
    }
    return availability;
  }

  private JSONObject exposureMetadata(JSONObject input) throws Exception {
    JSONObject exposure = new JSONObject();
    exposure.put("lockExposure", input.optBoolean("lockExposure", true));
    exposure.put("lockWhiteBalance", input.optBoolean("lockWhiteBalance", true));
    exposure.put("lockFocus", input.optBoolean("lockFocus", true));
    exposure.put("manualIso", input.optInt("manualIso", 0));
    exposure.put("manualShutterNs", input.optDouble("manualShutterNs", 0));
    return exposure;
  }

  private JSONObject lensMetadata(JSONObject input) throws Exception {
    JSONObject lens = new JSONObject();
    lens.put("preferredLens", input.optString("preferredLens", "default"));
    lens.put("cameraId", input.optString("cameraId", ""));
    lens.put("imageResolutionPreset", input.optString("imageResolutionPreset", "high"));
    return lens;
  }

  private void writeKeyframes(JSONObject input) throws Exception {
    JSONObject metadata = new JSONObject();
    metadata.put("status", "complete");
    metadata.put("moduleName", NAME);
    metadata.put("engineVersion", ENGINE_VERSION);
    metadata.put("captureSource", "arcore-shared-camera");
    metadata.put("poseSynchronizationMode", "camera-photo-associated");
    metadata.put("cameraTransformConvention", "ARCore camera pose matrix, column-major, camera-to-world transform.");
    metadata.put("keyframeCount", keyframes.length());
    metadata.put("keyframes", keyframes);
    metadata.put("warnings", new JSONArray());
    metadata.put("errors", new JSONArray());
    File output = ForgeScanNativeFiles.resolveProjectFile(getReactApplicationContext(), input, KEYFRAME_PATH);
    writeJson(output, metadata);
  }

  private void mergeSessionInput(JSONObject input) {
    try {
      JSONObject merged = new JSONObject(sessionInput.toString());
      JSONArray names = input.names();
      if (names != null) {
        for (int index = 0; index < names.length(); index += 1) {
          String name = names.getString(index);
          merged.put(name, input.get(name));
        }
      }
      sessionInput = merged;
    } catch (Exception ignored) {
      sessionInput = input;
    }
  }

  private JSONObject parseInput(String inputJson) throws Exception {
    return inputJson == null || inputJson.isEmpty() ? new JSONObject() : new JSONObject(inputJson);
  }

  private void copyFile(File source, File destination) throws Exception {
    ForgeScanNativeFiles.ensureParent(destination);
    FileInputStream input = new FileInputStream(source);
    FileOutputStream output = new FileOutputStream(destination);
    byte[] buffer = new byte[8192];
    try {
      int read;
      while ((read = input.read(buffer)) >= 0) {
        output.write(buffer, 0, read);
      }
    } finally {
      input.close();
      output.close();
    }
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

  private void endCurrentSession(boolean clearKeyframes) {
    if (timedCaptureRunnable != null) {
      mainHandler.removeCallbacks(timedCaptureRunnable);
    }
    timedCaptureRunnable = null;
    timedCaptureRunning = false;
    if (arSession != null) {
      try {
        arSession.pause();
      } catch (Throwable ignored) {
        // Pause can throw if the camera is already released.
      }
      try {
        arSession.close();
      } catch (Throwable ignored) {
        // Close is best-effort during React Native lifecycle transitions.
      }
    }
    arSession = null;
    sharedCamera = null;
    sessionRunning = false;
    sharedCameraStarted = false;
    if (clearKeyframes) {
      keyframes = new JSONArray();
      lastKeyframe = null;
    }
  }

  private boolean arCoreRuntimeAvailable() {
    try {
      Class.forName("com.google.ar.core.ArCoreApk");
      return true;
    } catch (Throwable ignored) {
      return false;
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
      result.put("sharedCameraSupported", false);
      result.put("camera2Available", false);
      result.put("trackingState", "failed");
      result.put("poseSynchronization", "missing");
      result.put("fallbackTurntablePoseUsed", false);
      result.put("cameraIntrinsicsCaptured", false);
      result.put("cameraExtrinsicsCaptured", false);
      result.put("warnings", new JSONArray().put(message));
      result.put("errors", new JSONArray().put(safeMessage(error)));
      result.put("lastNativeError", safeMessage(error));
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
