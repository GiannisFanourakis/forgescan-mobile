package com.forgescan.nativeengines;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import org.json.JSONObject;

@ReactModule(name = ForgeScanMediaPickerModule.NAME)
public class ForgeScanMediaPickerModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanMediaPicker";
  private static final int PICK_VIDEO_REQUEST_CODE = 43117;

  private Promise pendingPromise;

  private final ActivityEventListener activityEventListener =
    new BaseActivityEventListener() {
      @Override
      public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_VIDEO_REQUEST_CODE || pendingPromise == null) {
          return;
        }

        Promise promise = pendingPromise;
        pendingPromise = null;

        try {
          if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSONObject cancelled = new JSONObject();
            cancelled.put("status", "cancelled");
            promise.resolve(cancelled.toString());
            return;
          }

          Uri sourceUri = data.getData();
          copyPickedVideo(sourceUri, promise);
        } catch (Exception exception) {
          promise.reject("PICK_VIDEO_FAILED", exception);
        }
      }
    };

  public ForgeScanMediaPickerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    reactContext.addActivityEventListener(activityEventListener);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void pickVideo(Promise promise) {
    if (pendingPromise != null) {
      promise.reject("PICKER_BUSY", "A clip picker is already open.");
      return;
    }

    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No Android activity is attached.");
      return;
    }

    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("video/*");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

    pendingPromise = promise;
    try {
      activity.startActivityForResult(intent, PICK_VIDEO_REQUEST_CODE);
    } catch (Exception exception) {
      pendingPromise = null;
      promise.reject("PICKER_OPEN_FAILED", exception);
    }
  }

  private void copyPickedVideo(Uri sourceUri, Promise promise) throws Exception {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    String displayName = sanitizeFilename(getDisplayName(sourceUri));
    if (displayName.length() == 0) {
      displayName = "imported_clip.mp4";
    }

    try {
      resolver.takePersistableUriPermission(sourceUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    } catch (Exception ignored) {
      // Some providers do not allow persistable grants. The stream copy below is what matters.
    }

    File importDirectory = new File(getReactApplicationContext().getCacheDir(), "forgescan-imports");
    if (!importDirectory.exists() && !importDirectory.mkdirs()) {
      throw new IOException("Unable to create import cache directory.");
    }

    File outputFile = new File(importDirectory, System.currentTimeMillis() + "_" + displayName);
    long byteCount = copyUriToFile(sourceUri, outputFile);

    JSONObject result = new JSONObject();
    result.put("status", "selected");
    result.put("uri", Uri.fromFile(outputFile).toString());
    result.put("sourceUri", sourceUri.toString());
    result.put("filename", displayName);
    result.put("mimeType", resolver.getType(sourceUri));
    result.put("bytes", byteCount);
    promise.resolve(result.toString());
  }

  private long copyUriToFile(Uri sourceUri, File outputFile) throws IOException {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    InputStream inputStream = resolver.openInputStream(sourceUri);
    if (inputStream == null) {
      throw new IOException("Unable to open selected clip.");
    }

    try (InputStream input = inputStream; OutputStream output = new FileOutputStream(outputFile)) {
      byte[] buffer = new byte[1024 * 128];
      long totalBytes = 0;
      int bytesRead;
      while ((bytesRead = input.read(buffer)) != -1) {
        output.write(buffer, 0, bytesRead);
        totalBytes += bytesRead;
      }
      output.flush();
      return totalBytes;
    }
  }

  private String getDisplayName(Uri sourceUri) {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    try (Cursor cursor = resolver.query(sourceUri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int displayNameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (displayNameIndex >= 0) {
          return cursor.getString(displayNameIndex);
        }
      }
    } catch (Exception ignored) {
      // Fall back to the URI tail below.
    }

    String lastPathSegment = sourceUri.getLastPathSegment();
    return lastPathSegment == null ? "" : lastPathSegment;
  }

  private String sanitizeFilename(String filename) {
    if (filename == null) {
      return "";
    }

    String sanitized = filename.replaceAll("[^A-Za-z0-9._-]", "_");
    return sanitized.length() > 120 ? sanitized.substring(sanitized.length() - 120) : sanitized;
  }
}
