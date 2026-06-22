package com.forgescan.nativeengines;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.net.Uri;
import android.util.Range;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactContext;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

public class ForgeScanCameraXView extends FrameLayout {
  private static WeakReference<ForgeScanCameraXView> activeView =
    new WeakReference<>(null);

  private final ReactContext reactContext;
  private final PreviewView previewView;
  private ProcessCameraProvider cameraProvider;
  private Preview preview;
  private ImageCapture imageCapture;
  private VideoCapture<Recorder> videoCapture;
  private Recording activeRecording;
  private Promise activeRecordingPromise;
  private Camera camera;
  private float zoom = 0f;
  private String videoQuality = "2160p";
  private boolean manualControlsEnabled = false;
  private int manualIso = 100;
  private long manualShutterNs = 16_666_667L;
  private float manualFocusDistance = 0f;
  private boolean manualSensorSupported = false;
  private int minIso = 50;
  private int maxIso = 12_800;
  private long minShutterNs = 1_000_000L;
  private long maxShutterNs = 1_000_000_000L;
  private float maxFocusDistance = 20f;
  private String lastCameraError;

  public ForgeScanCameraXView(ReactContext context) {
    super(context);
    reactContext = context;
    previewView = new PreviewView(context);
    previewView.setImplementationMode(PreviewView.ImplementationMode.PERFORMANCE);
    previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
    addView(
      previewView,
      new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    );
  }

  public static ForgeScanCameraXView getActiveView() {
    return activeView.get();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    activeView = new WeakReference<>(this);
    post(this::startCamera);
  }

  @Override
  protected void onDetachedFromWindow() {
    if (activeView.get() == this) {
      activeView = new WeakReference<>(null);
    }
    stopCamera();
    super.onDetachedFromWindow();
  }

  public void setZoom(float nextZoom) {
    zoom = Math.max(0f, Math.min(1f, nextZoom));
    if (camera != null) {
      camera.getCameraControl().setLinearZoom(zoom);
    }
  }

  public void setVideoQuality(String quality) {
    if (quality == null || quality.isEmpty() || quality.equals(videoQuality)) {
      return;
    }

    videoQuality = quality;
    startCamera();
  }

  public void setManualControlsEnabled(boolean enabled) {
    if (manualControlsEnabled == enabled) {
      return;
    }

    manualControlsEnabled = enabled;
    startCamera();
  }

  public void setManualIso(int iso) {
    int nextIso = Math.max(minIso, Math.min(maxIso, iso));
    if (manualIso == nextIso) {
      return;
    }

    manualIso = nextIso;
    if (manualControlsEnabled) {
      startCamera();
    }
  }

  public void setManualShutterNs(double shutterNs) {
    long nextShutterNs = Math.max(
      minShutterNs,
      Math.min(maxShutterNs, Math.round(shutterNs))
    );
    if (manualShutterNs == nextShutterNs) {
      return;
    }

    manualShutterNs = nextShutterNs;
    if (manualControlsEnabled) {
      startCamera();
    }
  }

  public void setManualFocusDistance(float focusDistance) {
    float nextFocusDistance = Math.max(0f, Math.min(maxFocusDistance, focusDistance));
    if (Math.abs(manualFocusDistance - nextFocusDistance) < 0.001f) {
      return;
    }

    manualFocusDistance = nextFocusDistance;
    if (manualControlsEnabled) {
      startCamera();
    }
  }

  public void capturePhoto(File output, Promise promise) {
    if (imageCapture == null) {
      promise.reject(
        "camera_not_ready",
        lastCameraError == null
          ? "Native CameraX image capture is not ready."
          : lastCameraError
      );
      return;
    }

    ForgeScanNativeFiles.ensureParent(output);
    ImageCapture.OutputFileOptions options =
      new ImageCapture.OutputFileOptions.Builder(output).build();
    imageCapture.takePicture(
      options,
      ContextCompat.getMainExecutor(reactContext),
      new ImageCapture.OnImageSavedCallback() {
        @Override
        public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) {
          try {
            JSONObject json = new JSONObject();
            Uri savedUri = result.getSavedUri();
            json.put("uri", savedUri != null ? savedUri.toString() : ForgeScanNativeFiles.fileUri(output));
            json.put("path", output.getAbsolutePath());
            json.put("width", 0);
            json.put("height", 0);
            json.put("bytes", output.exists() ? output.length() : 0);
            json.put("engineName", "android-camerax");
            json.put("engineVersion", "0.1.0");
            promise.resolve(json.toString());
          } catch (Exception error) {
            promise.reject("camera_capture_result_failed", safeMessage(error));
          }
        }

        @Override
        public void onError(@NonNull ImageCaptureException exception) {
          promise.reject("camera_capture_failed", safeMessage(exception));
        }
      }
    );
  }

  public void startVideoRecording(File output, Promise promise) {
    if (videoCapture == null) {
      promise.reject(
        "camera_not_ready",
        lastCameraError == null
          ? "Native CameraX video capture is not ready."
          : lastCameraError
      );
      return;
    }
    if (activeRecording != null) {
      promise.reject("camera_recording_active", "A native CameraX recording is already active.");
      return;
    }

    ForgeScanNativeFiles.ensureParent(output);
    activeRecordingPromise = promise;
    FileOutputOptions options = new FileOutputOptions.Builder(output).build();
    PendingRecording pendingRecording = videoCapture.getOutput().prepareRecording(
      reactContext,
      options
    );
    activeRecording = pendingRecording.start(
      ContextCompat.getMainExecutor(reactContext),
      event -> {
        if (event instanceof VideoRecordEvent.Finalize) {
          VideoRecordEvent.Finalize finalizeEvent = (VideoRecordEvent.Finalize) event;
          Promise recordingPromise = activeRecordingPromise;
          activeRecording = null;
          activeRecordingPromise = null;

          if (recordingPromise == null) {
            return;
          }

          if (finalizeEvent.hasError()) {
            recordingPromise.reject(
              "camera_video_failed",
              finalizeEvent.getCause() == null
                ? "Native CameraX video recording failed."
                : safeMessage(finalizeEvent.getCause())
            );
            return;
          }

          try {
            JSONObject json = new JSONObject();
            json.put("uri", ForgeScanNativeFiles.fileUri(output));
            json.put("path", output.getAbsolutePath());
            json.put("bytes", output.exists() ? output.length() : 0);
            json.put("engineName", "android-camerax");
            json.put("engineVersion", "0.1.0");
            json.put("videoQuality", videoQuality);
            recordingPromise.resolve(json.toString());
          } catch (Exception error) {
            recordingPromise.reject("camera_video_result_failed", safeMessage(error));
          }
        }
      }
    );
  }

  public void stopVideoRecording() {
    if (activeRecording != null) {
      activeRecording.stop();
    }
  }

  private void startCamera() {
    Activity activity = reactContext.getCurrentActivity();
    if (
      activity == null ||
      !(activity instanceof LifecycleOwner) ||
      ActivityCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      return;
    }

    ListenableFuture<ProcessCameraProvider> cameraProviderFuture =
      ProcessCameraProvider.getInstance(reactContext);
    cameraProviderFuture.addListener(
      () -> {
        try {
          refreshCamera2Ranges();
          cameraProvider = cameraProviderFuture.get();
          bindUseCases((LifecycleOwner) activity);
        } catch (Exception ignored) {
          // Readiness is reported through JS fallback and diagnostics.
        }
      },
      ContextCompat.getMainExecutor(reactContext)
    );
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void bindUseCases(LifecycleOwner lifecycleOwner) {
    if (cameraProvider == null) {
      return;
    }

    lastCameraError = null;
    cameraProvider.unbindAll();
    try {
      bindPreviewImageAndVideo(lifecycleOwner, qualityFromString(videoQuality));
      return;
    } catch (Exception firstError) {
      lastCameraError = "CameraX video quality failed: " + safeMessage(firstError);
    }

    try {
      bindPreviewImageAndVideo(lifecycleOwner, Quality.FHD);
      return;
    } catch (Exception secondError) {
      lastCameraError = "CameraX FHD video fallback failed: " + safeMessage(secondError);
    }

    try {
      bindPreviewAndImageOnly(lifecycleOwner);
    } catch (Exception thirdError) {
      lastCameraError = "CameraX preview failed: " + safeMessage(thirdError);
      imageCapture = null;
      videoCapture = null;
      preview = null;
      camera = null;
    }
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void bindPreviewImageAndVideo(
    LifecycleOwner lifecycleOwner,
    Quality requestedQuality
  ) {
    Preview.Builder previewBuilder = new Preview.Builder();
    ImageCapture.Builder imageCaptureBuilder = new ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY);
    applyManualCamera2Options(previewBuilder);
    applyManualCamera2Options(imageCaptureBuilder);
    preview = previewBuilder.build();
    imageCapture = imageCaptureBuilder.build();
    Recorder recorder = new Recorder.Builder()
      .setQualitySelector(
        QualitySelector.from(
          requestedQuality,
          FallbackStrategy.lowerQualityOrHigherThan(requestedQuality)
        )
      )
      .build();
    videoCapture = VideoCapture.withOutput(recorder);

    preview.setSurfaceProvider(previewView.getSurfaceProvider());
    camera = cameraProvider.bindToLifecycle(
      lifecycleOwner,
      CameraSelector.DEFAULT_BACK_CAMERA,
      preview,
      imageCapture,
      videoCapture
    );
    camera.getCameraControl().setLinearZoom(zoom);
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void bindPreviewAndImageOnly(LifecycleOwner lifecycleOwner) {
    Preview.Builder previewBuilder = new Preview.Builder();
    ImageCapture.Builder imageCaptureBuilder = new ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY);
    applyManualCamera2Options(previewBuilder);
    applyManualCamera2Options(imageCaptureBuilder);
    preview = previewBuilder.build();
    imageCapture = imageCaptureBuilder.build();
    videoCapture = null;

    preview.setSurfaceProvider(previewView.getSurfaceProvider());
    camera = cameraProvider.bindToLifecycle(
      lifecycleOwner,
      CameraSelector.DEFAULT_BACK_CAMERA,
      preview,
      imageCapture
    );
    camera.getCameraControl().setLinearZoom(zoom);
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void applyManualCamera2Options(Preview.Builder builder) {
    if (!manualControlsEnabled || !manualSensorSupported) {
      return;
    }

    Camera2Interop.Extender<Preview> extender = new Camera2Interop.Extender<>(builder);
    applyManualCamera2Options(extender);
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void applyManualCamera2Options(ImageCapture.Builder builder) {
    if (!manualControlsEnabled || !manualSensorSupported) {
      return;
    }

    Camera2Interop.Extender<ImageCapture> extender = new Camera2Interop.Extender<>(builder);
    applyManualCamera2Options(extender);
  }

  private void refreshCamera2Ranges() {
    try {
      CameraManager cameraManager =
        (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
      if (cameraManager == null) {
        manualSensorSupported = false;
        return;
      }

      for (String cameraId : cameraManager.getCameraIdList()) {
        CameraCharacteristics characteristics =
          cameraManager.getCameraCharacteristics(cameraId);
        Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
        if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) {
          continue;
        }

        manualSensorSupported = hasManualSensor(characteristics);
        Range<Integer> isoRange =
          characteristics.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
        if (isoRange != null) {
          minIso = isoRange.getLower();
          maxIso = isoRange.getUpper();
          manualIso = Math.max(minIso, Math.min(maxIso, manualIso));
        }

        Range<Long> shutterRange =
          characteristics.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
        if (shutterRange != null) {
          minShutterNs = shutterRange.getLower();
          maxShutterNs = shutterRange.getUpper();
          manualShutterNs =
            Math.max(minShutterNs, Math.min(maxShutterNs, manualShutterNs));
        }

        Float focusDistance =
          characteristics.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
        maxFocusDistance = focusDistance == null ? 0f : Math.max(0f, focusDistance);
        manualFocusDistance =
          Math.max(0f, Math.min(maxFocusDistance, manualFocusDistance));
        return;
      }

      manualSensorSupported = false;
    } catch (Exception ignored) {
      manualSensorSupported = false;
    }
  }

  private boolean hasManualSensor(CameraCharacteristics characteristics) {
    int[] capabilities =
      characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
    if (capabilities == null) {
      return false;
    }

    for (int capability : capabilities) {
      if (capability == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) {
        return true;
      }
    }
    return false;
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void applyManualCamera2Options(Camera2Interop.Extender<?> extender) {
    extender.setCaptureRequestOption(
      CaptureRequest.CONTROL_MODE,
      CaptureRequest.CONTROL_MODE_OFF
    );
    extender.setCaptureRequestOption(
      CaptureRequest.CONTROL_AE_MODE,
      CaptureRequest.CONTROL_AE_MODE_OFF
    );
    extender.setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, manualIso);
    extender.setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, manualShutterNs);
    extender.setCaptureRequestOption(
      CaptureRequest.CONTROL_AF_MODE,
      CaptureRequest.CONTROL_AF_MODE_OFF
    );
    extender.setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, manualFocusDistance);
  }

  private Quality qualityFromString(String quality) {
    if ("2160p".equals(quality)) {
      return Quality.UHD;
    }
    if ("720p".equals(quality)) {
      return Quality.HD;
    }
    return Quality.FHD;
  }

  private void stopCamera() {
    stopVideoRecording();
    if (cameraProvider != null) {
      cameraProvider.unbindAll();
      cameraProvider = null;
    }
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }
}
