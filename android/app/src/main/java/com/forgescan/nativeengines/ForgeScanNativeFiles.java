package com.forgescan.nativeengines;

import android.content.Context;
import android.net.Uri;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

final class ForgeScanNativeFiles {
  private ForgeScanNativeFiles() {}

  static String fileUri(File file) {
    return Uri.fromFile(file).toString();
  }

  static File fileFromUri(String uriString) {
    Uri uri = Uri.parse(uriString);
    if ("file".equals(uri.getScheme())) {
      return new File(uri.getPath());
    }
    return new File(uriString);
  }

  static File inferProjectRoot(Context context, JSONObject input) {
    String projectDirectoryUri = input.optString("projectDirectoryUri", input.optString("projectRootUri", ""));
    if (projectDirectoryUri != null && !projectDirectoryUri.isEmpty()) {
      return fileFromUri(projectDirectoryUri);
    }

    JSONArray frames = input.optJSONArray("orderedFrames");
    if (frames == null) {
      frames = input.optJSONArray("frames");
    }

    if (frames != null && frames.length() > 0) {
      JSONObject frame = frames.optJSONObject(0);
      String frameUri = frame == null
        ? null
        : frame.optString("frameUri", frame.optString("sourceFrameUri", ""));

      if (frameUri != null && !frameUri.isEmpty()) {
        File frameFile = fileFromUri(frameUri);
        String marker = File.separator + "rotations" + File.separator;
        String path = frameFile.getAbsolutePath();
        int markerIndex = path.indexOf(marker);
        if (markerIndex > 0) {
          return new File(path.substring(0, markerIndex));
        }
      }
    }

    String projectId = input.optString("projectId", "smoke");
    return new File(context.getFilesDir(), "ForgeScanNative" + File.separator + projectId);
  }

  static File resolveProjectFile(Context context, JSONObject input, String relativePath) {
    return new File(inferProjectRoot(context, input), relativePath);
  }

  static void ensureParent(File file) {
    File parent = file.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }
  }
}
