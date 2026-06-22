package com.forgescan.nativeengines;

import androidx.annotation.NonNull;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class ForgeScanCameraXViewManager extends SimpleViewManager<ForgeScanCameraXView> {
  public static final String NAME = "ForgeScanCameraXView";

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @NonNull
  @Override
  protected ForgeScanCameraXView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new ForgeScanCameraXView(reactContext);
  }

  @ReactProp(name = "zoom", defaultFloat = 0f)
  public void setZoom(ForgeScanCameraXView view, float zoom) {
    view.setZoom(zoom);
  }

  @ReactProp(name = "videoQuality")
  public void setVideoQuality(ForgeScanCameraXView view, String videoQuality) {
    view.setVideoQuality(videoQuality);
  }

  @ReactProp(name = "manualControlsEnabled", defaultBoolean = false)
  public void setManualControlsEnabled(ForgeScanCameraXView view, boolean enabled) {
    view.setManualControlsEnabled(enabled);
  }

  @ReactProp(name = "manualIso", defaultInt = 100)
  public void setManualIso(ForgeScanCameraXView view, int iso) {
    view.setManualIso(iso);
  }

  @ReactProp(name = "manualShutterNs", defaultDouble = 16666667)
  public void setManualShutterNs(ForgeScanCameraXView view, double shutterNs) {
    view.setManualShutterNs(shutterNs);
  }

  @ReactProp(name = "manualFocusDistance", defaultFloat = 0f)
  public void setManualFocusDistance(ForgeScanCameraXView view, float focusDistance) {
    view.setManualFocusDistance(focusDistance);
  }
}
