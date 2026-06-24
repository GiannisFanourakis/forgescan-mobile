package com.forgescan.nativeengines;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

@ReactModule(name = ForgeScanFileExportModule.NAME)
public class ForgeScanFileExportModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanFileExport";

  public ForgeScanFileExportModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void shareFile(String inputJson, Promise promise) {
    try {
      JSONObject input = new JSONObject(inputJson);
      String uri = input.getString("uri");
      String filename = input.optString("filename", "ForgeScan.ksplat");
      String mimeType = input.optString("mimeType", "application/octet-stream");
      String title = input.optString("title", "Export ForgeScan file");
      File file = ForgeScanNativeFiles.fileFromUri(uri);

      if (!file.exists() || file.length() <= 0) {
        promise.resolve(result("failed", "Export file does not exist or is empty."));
        return;
      }

      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.resolve(result("failed", "No Android activity is attached."));
        return;
      }

      Uri contentUri = FileProvider.getUriForFile(
        getReactApplicationContext(),
        getReactApplicationContext().getPackageName() + ".forgescan.fileprovider",
        file
      );

      Intent sendIntent = new Intent(Intent.ACTION_SEND);
      sendIntent.setType(mimeType);
      sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
      sendIntent.putExtra(Intent.EXTRA_TITLE, filename);
      sendIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
      sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

      Intent chooser = Intent.createChooser(sendIntent, title);
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(chooser);
      promise.resolve(result("shared", ""));
    } catch (Exception error) {
      promise.resolve(result("failed", safeMessage(error)));
    }
  }

  private String result(String status, String error) {
    try {
      JSONObject output = new JSONObject();
      output.put("status", status);
      JSONArray errors = new JSONArray();
      if (error != null && !error.isEmpty()) {
        errors.put(error);
      }
      output.put("errors", errors);
      return output.toString();
    } catch (Exception ignored) {
      return "{\"status\":\"failed\",\"errors\":[\"Unable to encode export result.\"]}";
    }
  }

  private String safeMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
  }
}
