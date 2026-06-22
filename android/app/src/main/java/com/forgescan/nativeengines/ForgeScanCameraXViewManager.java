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
}
