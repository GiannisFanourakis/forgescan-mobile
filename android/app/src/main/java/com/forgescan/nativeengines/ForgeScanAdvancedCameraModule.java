package com.forgescan.nativeengines;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.util.Range;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.File;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanAdvancedCameraModule.NAME)
public class ForgeScanAdvancedCameraModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanAdvancedCamera";
  private static final String ENGINE_VERSION = "0.1.0";

  public ForgeScanAdvancedCameraModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getAvailability(Promise promise) {
    try {
      CameraManager cameraManager =
        (CameraManager) getReactApplicationContext().getSystemService(Context.CAMERA_SERVICE);

      JSONObject result = new JSONObject();
      result.put("available", cameraManager != null);
      result.put("moduleName", NAME);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("camera2Available", cameraManager != null);
      result.put("cameraXCaptureImplemented", true);
      result.put("camera2ManualCaptureImplemented", false);
      result.put("arCoreSharedCameraImplemented", false);
      result.put("recommendedNativePath", "CameraX preview/photo/video is the default Android capture path. Manual ISO/shutter/focus are applied through Camera2 interop when the device exposes MANUAL_SENSOR.");

      JSONArray cameras = new JSONArray();
      boolean hasBackCamera = false;
      boolean hasManualSensor = false;
      boolean hasRaw = false;
      boolean hasLogicalMultiCamera = false;
      boolean hasOis = false;
      boolean hasVideoStabilization = false;
      boolean hasPhysicalIds = false;
      double maxZoom = 1.0;

      if (cameraManager != null) {
        for (String cameraId : cameraManager.getCameraIdList()) {
          CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(cameraId);
          JSONObject camera = describeCamera(cameraId, characteristics);
          cameras.put(camera);

          boolean isBack = "back".equals(camera.optString("lensFacing"));
          hasBackCamera = hasBackCamera || isBack;
          hasManualSensor = hasManualSensor || camera.optBoolean("manualSensor");
          hasRaw = hasRaw || camera.optBoolean("rawCapture");
          hasLogicalMultiCamera =
            hasLogicalMultiCamera || camera.optBoolean("logicalMultiCamera");
          hasOis = hasOis || camera.optBoolean("opticalStabilization");
          hasVideoStabilization =
            hasVideoStabilization || camera.optBoolean("videoStabilization");
          hasPhysicalIds =
            hasPhysicalIds || camera.optJSONArray("physicalCameraIds").length() > 0;
          maxZoom = Math.max(maxZoom, camera.optDouble("maxDigitalZoom", 1.0));
        }
      }

      result.put("hasBackCamera", hasBackCamera);
      result.put("manualSensorSupported", hasManualSensor);
      result.put("camera2ManualCaptureImplemented", hasManualSensor);
      result.put("rawCaptureSupported", hasRaw);
      result.put("logicalMultiCameraSupported", hasLogicalMultiCamera);
      result.put("physicalCameraIdsAvailable", hasPhysicalIds);
      result.put("opticalStabilizationSupported", hasOis);
      result.put("videoStabilizationSupported", hasVideoStabilization);
      result.put("maxDigitalZoom", maxZoom);
      result.put("cameras", cameras);
      result.put(
        "warnings",
        new JSONArray()
          .put("Native CameraX is the active Android capture path in development builds.")
          .put("Manual ISO/shutter/focus locks are active through Camera2 interop on devices with MANUAL_SENSOR.")
          .put("4K and frame-rate availability are device/profile-specific and are selected through CameraX quality profiles.")
      );
      result.put("errors", new JSONArray());
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(failureJson(error));
    }
  }

  @ReactMethod
  public void capturePhoto(String inputJson, Promise promise) {
    try {
      ForgeScanCameraXView activeView = ForgeScanCameraXView.getActiveView();
      if (activeView == null) {
        promise.reject(
          "camera_view_unavailable",
          "Native CameraX preview is not mounted. Reopen capture in an Android development build."
        );
        return;
      }

      activeView.capturePhoto(createOutputFile(inputJson, "jpg"), promise);
    } catch (Throwable error) {
      promise.reject("camera_capture_setup_failed", safeMessage(error));
    }
  }

  @ReactMethod
  public void startVideoCapture(String inputJson, Promise promise) {
    try {
      ForgeScanCameraXView activeView = ForgeScanCameraXView.getActiveView();
      if (activeView == null) {
        promise.reject(
          "camera_view_unavailable",
          "Native CameraX preview is not mounted. Reopen capture in an Android development build."
        );
        return;
      }

      activeView.startVideoRecording(createOutputFile(inputJson, "mp4"), promise);
    } catch (Throwable error) {
      promise.reject("camera_video_setup_failed", safeMessage(error));
    }
  }

  @ReactMethod
  public void stopVideoCapture(Promise promise) {
    try {
      ForgeScanCameraXView activeView = ForgeScanCameraXView.getActiveView();
      if (activeView != null) {
        activeView.stopVideoRecording();
      }
      promise.resolve(null);
    } catch (Throwable error) {
      promise.reject("camera_video_stop_failed", safeMessage(error));
    }
  }

  private JSONObject describeCamera(
    String cameraId,
    CameraCharacteristics characteristics
  ) throws Exception {
    JSONObject camera = new JSONObject();
    camera.put("id", cameraId);
    camera.put("lensFacing", lensFacingName(characteristics));
    camera.put("hardwareLevel", hardwareLevelName(characteristics));
    camera.put("manualSensor", hasCapability(characteristics, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR));
    camera.put("rawCapture", hasCapability(characteristics, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW));
    camera.put("logicalMultiCamera", hasCapability(characteristics, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA));
    camera.put("maxDigitalZoom", maxDigitalZoom(characteristics));
    camera.put("isoRange", integerRange(characteristics.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)));
    camera.put("exposureTimeRangeNs", longRange(characteristics.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)));
    camera.put("minimumFocusDistance", minimumFocusDistance(characteristics));
    camera.put("focalLengths", floatArray(characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)));
    camera.put("opticalStabilization", hasMode(characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION), CameraCharacteristics.LENS_OPTICAL_STABILIZATION_MODE_ON));
    camera.put("videoStabilization", hasMode(characteristics.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES), CameraCharacteristics.CONTROL_VIDEO_STABILIZATION_MODE_ON));
    camera.put("physicalCameraIds", physicalCameraIds(characteristics));
    return camera;
  }

  private boolean hasCapability(
    CameraCharacteristics characteristics,
    int capability
  ) {
    int[] capabilities =
      characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
    if (capabilities == null) {
      return false;
    }

    for (int available : capabilities) {
      if (available == capability) {
        return true;
      }
    }
    return false;
  }

  private boolean hasMode(int[] modes, int target) {
    if (modes == null) {
      return false;
    }

    for (int mode : modes) {
      if (mode == target) {
        return true;
      }
    }
    return false;
  }

  private double maxDigitalZoom(CameraCharacteristics characteristics) {
    Float zoom = characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM);
    return zoom == null ? 1.0 : zoom.doubleValue();
  }

  private JSONArray floatArray(float[] values) throws Exception {
    JSONArray output = new JSONArray();
    if (values == null) {
      return output;
    }

    for (float value : values) {
      output.put(value);
    }
    return output;
  }

  private JSONArray integerRange(Range<Integer> range) {
    JSONArray output = new JSONArray();
    if (range == null) {
      return output;
    }

    output.put(range.getLower());
    output.put(range.getUpper());
    return output;
  }

  private JSONArray longRange(Range<Long> range) {
    JSONArray output = new JSONArray();
    if (range == null) {
      return output;
    }

    output.put(range.getLower());
    output.put(range.getUpper());
    return output;
  }

  private double minimumFocusDistance(CameraCharacteristics characteristics) {
    Float focusDistance =
      characteristics.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
    return focusDistance == null ? 0.0 : focusDistance.doubleValue();
  }

  private JSONArray physicalCameraIds(CameraCharacteristics characteristics) {
    JSONArray output = new JSONArray();
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return output;
    }

    Set<String> ids = characteristics.getPhysicalCameraIds();
    for (String id : ids) {
      output.put(id);
    }
    return output;
  }

  private String lensFacingName(CameraCharacteristics characteristics) {
    Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
    if (facing == null) {
      return "unknown";
    }

    if (facing == CameraCharacteristics.LENS_FACING_BACK) {
      return "back";
    }
    if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
      return "front";
    }
    if (facing == CameraCharacteristics.LENS_FACING_EXTERNAL) {
      return "external";
    }
    return "unknown";
  }

  private String hardwareLevelName(CameraCharacteristics characteristics) {
    Integer level = characteristics.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL);
    if (level == null) {
      return "unknown";
    }

    switch (level) {
      case CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY:
        return "legacy";
      case CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED:
        return "limited";
      case CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL:
        return "full";
      case CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_3:
        return "level-3";
      case CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_EXTERNAL:
        return "external";
      default:
        return "unknown";
    }
  }

  private String failureJson(Throwable error) {
    try {
      JSONObject result = new JSONObject();
      result.put("available", false);
      result.put("moduleName", NAME);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("camera2Available", false);
      result.put("cameraXCaptureImplemented", true);
      result.put("camera2ManualCaptureImplemented", false);
      result.put("arCoreSharedCameraImplemented", false);
      result.put("cameras", new JSONArray());
      result.put("warnings", new JSONArray());
      result.put("errors", new JSONArray().put(safeMessage(error)));
      return result.toString();
    } catch (Exception ignored) {
      return "{\"available\":false,\"moduleName\":\"ForgeScanAdvancedCamera\",\"errors\":[\"Unable to encode advanced camera diagnostics failure.\"]}";
    }
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }

  private File createOutputFile(String inputJson, String extension) throws Exception {
    JSONObject input =
      inputJson == null || inputJson.isEmpty() ? new JSONObject() : new JSONObject(inputJson);
    String projectId = sanitizePathPart(input.optString("projectId", "project"));
    String rotationId = sanitizePathPart(input.optString("rotationId", "rotation"));
    String filename = input.optString(
      "filename",
      "capture_" + System.currentTimeMillis() + "." + extension
    );

    File directory = new File(
      getReactApplicationContext().getCacheDir(),
      "ForgeScanCameraX" + File.separator + projectId + File.separator + rotationId
    );
    return new File(directory, sanitizePathPart(filename));
  }

  private String sanitizePathPart(String value) {
    if (value == null || value.trim().isEmpty()) {
      return "capture";
    }
    return value.replaceAll("[^A-Za-z0-9._-]", "_");
  }
}
