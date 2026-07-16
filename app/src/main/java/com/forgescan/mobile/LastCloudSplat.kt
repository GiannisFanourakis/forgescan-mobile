package com.forgescan.mobile

import android.content.Context
import java.io.File

// Remembers the most recent successful cloud-training result's app-private
// cache file (BackendClient.kt writes it to exportsDir() before
// CloudUploadWorker.kt copies it to public Downloads; the private copy is
// never deleted) so "View Splat" (RingCaptureScreen.kt) is still available
// after an app restart, not just within the same session that ran the
// upload. Confirmed a real gap on a real device: closing/backgrounding the
// app while a run was in flight, then reopening after it finished, left no
// way to reach SplatViewerScreen.kt even though the result had already
// landed in Downloads - MainActivity.kt's WorkInfo Flow observer only
// exists within the session that enqueued the work.
//
// Deliberately just the one private file's path in SharedPreferences, not a
// MediaStore query over Downloads/ForgeScan/ for the newest cloud-splat-*.ply
// - that would mean either copying a potentially 100-500MB file out of
// scoped storage on every cold start just to check "does one exist", or
// juggling two different file-access paths (direct File vs
// ContentResolver+Uri) in SplatViewerScreen.kt's WebViewAssetLoader
// PathHandler for what's otherwise the exact same already-cached file.
private const val PrefsName = "forgescan_cloud_splat"
private const val KeyPath = "last_result_path"

internal fun rememberLastCloudSplat(context: Context, plyFile: File) {
    context.getSharedPreferences(PrefsName, Context.MODE_PRIVATE)
        .edit()
        .putString(KeyPath, plyFile.absolutePath)
        .apply()
}

internal fun restoreLastCloudSplat(context: Context): File? {
    val path = context.getSharedPreferences(PrefsName, Context.MODE_PRIVATE).getString(KeyPath, null) ?: return null
    val file = File(path)
    return if (file.exists()) file else null
}
