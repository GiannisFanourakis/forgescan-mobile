package com.forgescan.nativeengines;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.List;

public class ForgeScanEnginesPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new ForgeScanNativeMaskingModule(reactContext));
    modules.add(new ForgeScanAdvancedCameraModule(reactContext));
    modules.add(new ForgeScanARCaptureModule(reactContext));
    modules.add(new ForgeScanKsplatOptimizerModule(reactContext));
    modules.add(new ForgeScanMediaPickerModule(reactContext));
    modules.add(new ForgeScanFileExportModule(reactContext));
    return modules;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    List<ViewManager> viewManagers = new ArrayList<>();
    viewManagers.add(new ForgeScanCameraXViewManager());
    return viewManagers;
  }
}
