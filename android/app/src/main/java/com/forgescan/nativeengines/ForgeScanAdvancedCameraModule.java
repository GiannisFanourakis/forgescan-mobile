package com.forgescan.nativeengines;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
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
      result.put("cameraXCaptureImplemented", false);
      result.put("camera2ManualCaptureImplemented", false);
      result.put("arCoreSharedCameraImplemented", false);
      result.put("recommendedNativePath", "CameraX ImageCapture/ImageAnalysis first; Camera2 manual capture for locked exposure/focus; ARCore SharedCamera for pose-linked frames.");

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
          .put("Expo camera remains the active capture path in this build.")
          .put("Full OEM-style control requires replacing capture with native CameraX/Camera2 surface.")
          .put("4K60 availability is device/profile-specific and needs native CamcorderProfile/CameraX quality probing.")
      );
      result.put("errors", new JSONArray());
      promise.resolve(result.toString());
    } catch (Throwable error) {
      promise.resolve(failureJson(error));
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
      result.put("cameraXCaptureImplemented", false);
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
}
