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
import android.util.Log;
import android.view.View;
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
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleEventObserver;
import androidx.lifecycle.LifecycleOwner;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactContext;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

public class ForgeScanCameraXView extends FrameLayout {
  private static final String TAG = "ForgeScanCameraX";
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
  private boolean torchEnabled = false;
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
  private Lifecycle lifecycle;
  private LifecycleEventObserver lifecycleObserver;
  private boolean viewAttached = false;
  private boolean cameraStartInFlight = false;
  private boolean pendingCameraStart = false;
  private int cameraSessionId = 0;

  public ForgeScanCameraXView(ReactContext context) {
    super(context);
    reactContext = context;
    setClipChildren(false);
    setClipToPadding(false);
    previewView = new PreviewView(context);
    previewView.setClipChildren(false);
    previewView.setClipToPadding(false);
    previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
    previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
    addView(
      previewView,
      new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    );
  }

  @Override
  public void requestLayout() {
    super.requestLayout();
    post(this::forceLayoutPreview);
  }

  @Override
  protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
    int width = MeasureSpec.getSize(widthMeasureSpec);
    int height = MeasureSpec.getSize(heightMeasureSpec);
    setMeasuredDimension(width, height);

    int exactWidth = MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY);
    int exactHeight = MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY);
    previewView.measure(exactWidth, exactHeight);
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    int width = right - left;
    int height = bottom - top;
    previewView.layout(0, 0, width, height);
    if (changed) {
      Log.d(TAG, "CameraX host laid out " + width + "x" + height);
      post(this::startCamera);
    }
  }

  @Override
  protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
    super.onSizeChanged(width, height, oldWidth, oldHeight);
    forceLayoutPreview();
    if (width > 0 && height > 0) {
      Log.d(TAG, "CameraX host sized " + width + "x" + height);
      post(this::startCamera);
    }
  }

  public static ForgeScanCameraXView getActiveView() {
    return activeView.get();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    viewAttached = true;
    activeView = new WeakReference<>(this);
    registerLifecycleObserver();
    post(this::startCamera);
  }

  @Override
  protected void onDetachedFromWindow() {
    if (activeView.get() == this) {
      activeView = new WeakReference<>(null);
    }
    unregisterLifecycleObserver();
    viewAttached = false;
    stopCamera();
    super.onDetachedFromWindow();
  }

  @Override
  public void onWindowFocusChanged(boolean hasWindowFocus) {
    super.onWindowFocusChanged(hasWindowFocus);
    if (hasWindowFocus) {
      post(this::startCamera);
    } else {
      stopCamera();
    }
  }

  @Override
  protected void onWindowVisibilityChanged(int visibility) {
    super.onWindowVisibilityChanged(visibility);
    if (visibility == View.VISIBLE) {
      post(this::startCamera);
    } else {
      stopCamera();
    }
  }

  public void setZoom(float nextZoom) {
    zoom = Math.max(0f, Math.min(1f, nextZoom));
    if (camera != null) {
      camera.getCameraControl().setLinearZoom(zoom);
    }
  }

  public void setTorchEnabled(boolean enabled) {
    torchEnabled = enabled;
    if (camera != null && camera.getCameraInfo().hasFlashUnit()) {
      camera.getCameraControl().enableTorch(torchEnabled);
    }
  }

  public void setVideoQuality(String quality) {
    if (quality == null || quality.isEmpty() || quality.equals(videoQuality)) {
      return;
    }

    videoQuality = quality;
    restartCamera();
  }

  public void setManualControlsEnabled(boolean enabled) {
    if (manualControlsEnabled == enabled) {
      return;
    }

    manualControlsEnabled = enabled;
    restartCamera();
  }

  public void setManualIso(int iso) {
    int nextIso = Math.max(minIso, Math.min(maxIso, iso));
    if (manualIso == nextIso) {
      return;
    }

    manualIso = nextIso;
    if (manualControlsEnabled) {
      restartCamera();
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
      restartCamera();
    }
  }

  public void setManualFocusDistance(float focusDistance) {
    float nextFocusDistance = Math.max(0f, Math.min(maxFocusDistance, focusDistance));
    if (Math.abs(manualFocusDistance - nextFocusDistance) < 0.001f) {
      return;
    }

    manualFocusDistance = nextFocusDistance;
    if (manualControlsEnabled) {
      restartCamera();
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
    if (videoCapture == null && !prepareVideoCapture()) {
      promise.reject(
        "camera_video_not_ready",
        lastCameraError == null
          ? "Native CameraX video capture is not ready."
          : lastCameraError
      );
      return;
    }

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
    if (!canStartCamera(activity)) {
      return;
    }

    if (cameraProvider != null && camera != null && imageCapture != null) {
      return;
    }

    if (cameraStartInFlight) {
      pendingCameraStart = true;
      return;
    }

    cameraStartInFlight = true;
    pendingCameraStart = false;
    final int sessionId = cameraSessionId;
    ListenableFuture<ProcessCameraProvider> cameraProviderFuture =
      ProcessCameraProvider.getInstance(reactContext);
    cameraProviderFuture.addListener(
      () -> {
        try {
          if (sessionId != cameraSessionId || !canStartCamera(activity)) {
            return;
          }

          refreshCamera2Ranges();
          cameraProvider = cameraProviderFuture.get();
          bindUseCases((LifecycleOwner) activity);
        } catch (Exception error) {
          lastCameraError = "CameraX start failed: " + safeMessage(error);
          Log.w(TAG, lastCameraError, error);
        } finally {
          cameraStartInFlight = false;
          if (pendingCameraStart) {
            pendingCameraStart = false;
            post(this::startCamera);
          }
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
      bindPreviewAndImageOnly(lifecycleOwner);
      Log.d(TAG, "CameraX preview/photo bound");
      return;
    } catch (Exception firstError) {
      lastCameraError = "CameraX preview/photo failed: " + safeMessage(firstError);
      Log.w(TAG, lastCameraError, firstError);
    }

    try {
      bindPreviewOnly(lifecycleOwner);
      Log.d(TAG, "CameraX preview-only bound");
      return;
    } catch (Exception secondError) {
      lastCameraError = "CameraX preview-only failed: " + safeMessage(secondError);
      Log.w(TAG, lastCameraError, secondError);
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
    if (camera.getCameraInfo().hasFlashUnit()) {
      camera.getCameraControl().enableTorch(torchEnabled);
    }
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
    if (camera.getCameraInfo().hasFlashUnit()) {
      camera.getCameraControl().enableTorch(torchEnabled);
    }
  }

  @OptIn(markerClass = ExperimentalCamera2Interop.class)
  private void bindPreviewOnly(LifecycleOwner lifecycleOwner) {
    Preview.Builder previewBuilder = new Preview.Builder();
    applyManualCamera2Options(previewBuilder);
    preview = previewBuilder.build();
    imageCapture = null;
    videoCapture = null;

    preview.setSurfaceProvider(previewView.getSurfaceProvider());
    camera = cameraProvider.bindToLifecycle(
      lifecycleOwner,
      CameraSelector.DEFAULT_BACK_CAMERA,
      preview
    );
    camera.getCameraControl().setLinearZoom(zoom);
    if (camera.getCameraInfo().hasFlashUnit()) {
      camera.getCameraControl().enableTorch(torchEnabled);
    }
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
    cameraSessionId += 1;
    pendingCameraStart = false;
    stopVideoRecording();
    if (cameraProvider != null) {
      cameraProvider.unbindAll();
      cameraProvider = null;
    }
    preview = null;
    imageCapture = null;
    videoCapture = null;
    camera = null;
  }

  private void restartCamera() {
    if (!viewAttached) {
      return;
    }

    stopCamera();
    post(this::startCamera);
  }

  private boolean prepareVideoCapture() {
    Activity activity = reactContext.getCurrentActivity();
    if (cameraProvider == null || !canStartCamera(activity)) {
      return false;
    }

    try {
      cameraProvider.unbindAll();
      bindPreviewImageAndVideo((LifecycleOwner) activity, qualityFromString(videoQuality));
      Log.d(TAG, "CameraX preview/photo/video bound");
      lastCameraError = null;
      return true;
    } catch (Exception firstError) {
      lastCameraError = "CameraX video quality failed: " + safeMessage(firstError);
      Log.w(TAG, lastCameraError, firstError);
    }

    try {
      cameraProvider.unbindAll();
      bindPreviewImageAndVideo((LifecycleOwner) activity, Quality.FHD);
      Log.d(TAG, "CameraX preview/photo/video FHD bound");
      lastCameraError = null;
      return true;
    } catch (Exception secondError) {
      lastCameraError = "CameraX FHD video fallback failed: " + safeMessage(secondError);
      Log.w(TAG, lastCameraError, secondError);
    }

    try {
      cameraProvider.unbindAll();
      bindPreviewAndImageOnly((LifecycleOwner) activity);
    } catch (Exception restoreError) {
      Log.w(TAG, "CameraX preview restore failed after video bind failure", restoreError);
    }
    videoCapture = null;
    return false;
  }

  private boolean canStartCamera(Activity activity) {
    return viewAttached &&
      activity != null &&
      activity instanceof LifecycleOwner &&
      activity.hasWindowFocus() &&
      getWindowVisibility() == View.VISIBLE &&
      getWidth() > 0 &&
      getHeight() > 0 &&
      ActivityCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED;
  }

  private void forceLayoutPreview() {
    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0) {
      return;
    }

    int exactWidth = MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY);
    int exactHeight = MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY);
    previewView.measure(exactWidth, exactHeight);
    previewView.layout(0, 0, width, height);
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }

  private void registerLifecycleObserver() {
    Activity activity = reactContext.getCurrentActivity();
    if (!(activity instanceof LifecycleOwner) || lifecycleObserver != null) {
      return;
    }

    lifecycle = ((LifecycleOwner) activity).getLifecycle();
    lifecycleObserver =
      (source, event) -> {
        if (event == Lifecycle.Event.ON_RESUME) {
          post(this::startCamera);
        } else if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
          stopCamera();
        } else if (event == Lifecycle.Event.ON_DESTROY) {
          unregisterLifecycleObserver();
        }
      };
    lifecycle.addObserver(lifecycleObserver);
  }

  private void unregisterLifecycleObserver() {
    if (lifecycle != null && lifecycleObserver != null) {
      lifecycle.removeObserver(lifecycleObserver);
    }
    lifecycle = null;
    lifecycleObserver = null;
  }
}
