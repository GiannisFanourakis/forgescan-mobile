package com.forgescan.nativeengines;

import androidx.annotation.NonNull;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class ForgeScanKsplatViewManager extends SimpleViewManager<ForgeScanKsplatView> {
  public static final String NAME = "ForgeScanKsplatView";

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @NonNull
  @Override
  protected ForgeScanKsplatView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new ForgeScanKsplatView(reactContext);
  }

  @ReactProp(name = "autoRotate", defaultBoolean = true)
  public void setAutoRotate(ForgeScanKsplatView view, boolean autoRotate) {
    view.setAutoRotate(autoRotate);
  }

  @ReactProp(name = "ksplatUri")
  public void setKsplatUri(ForgeScanKsplatView view, String ksplatUri) {
    view.setKsplatUri(ksplatUri);
  }

  @ReactProp(name = "renderScale", defaultFloat = 1f)
  public void setRenderScale(ForgeScanKsplatView view, float renderScale) {
    view.setRenderScale(renderScale);
  }
}
