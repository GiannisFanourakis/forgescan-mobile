package com.forgescan.nativeengines;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Size;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
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
    startCamera();
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

  public void capturePhoto(File output, Promise promise) {
    if (imageCapture == null) {
      promise.reject("camera_not_ready", "Native CameraX image capture is not ready.");
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
      promise.reject("camera_not_ready", "Native CameraX video capture is not ready.");
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
          cameraProvider = cameraProviderFuture.get();
          bindUseCases((LifecycleOwner) activity);
        } catch (Exception ignored) {
          // Readiness is reported through JS fallback and diagnostics.
        }
      },
      ContextCompat.getMainExecutor(reactContext)
    );
  }

  private void bindUseCases(LifecycleOwner lifecycleOwner) {
    if (cameraProvider == null) {
      return;
    }

    cameraProvider.unbindAll();
    preview = new Preview.Builder().build();
    imageCapture = new ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
      .setTargetResolution(new Size(2160, 3840))
      .build();
    Recorder recorder = new Recorder.Builder()
      .setQualitySelector(QualitySelector.from(qualityFromString(videoQuality)))
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
