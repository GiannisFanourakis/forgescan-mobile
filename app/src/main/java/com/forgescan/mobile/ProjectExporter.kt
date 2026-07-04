package com.forgescan.mobile

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File

internal fun exportsDir(context: Context): File = File(context.cacheDir, "exports").apply { mkdirs() }

fun exportMeshToGlb(context: Context, mesh: ForgeScanMesh, fileName: String = "ForgeScan.glb"): File {
    val file = File(exportsDir(context), fileName)
    writeGlb(mesh, file)
    return file
}

fun exportMeshToObjZip(context: Context, mesh: ForgeScanMesh, fileName: String = "ForgeScan-obj.zip"): File {
    val file = File(exportsDir(context), fileName)
    writeObjZip(mesh, file, baseName = fileName.removeSuffix(".zip"))
    return file
}

fun shareFileIntent(context: Context, file: File, mimeType: String): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    return Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}

// Mirrors SpinForge360-Mobile's Save-As pattern: MediaStore Downloads entry
// on Android 10+, direct file write on older versions.
fun saveFileToDownloads(context: Context, sourceFile: File, displayName: String, mimeType: String): Uri {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/ForgeScan/")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("Could not create Downloads entry.")
        resolver.openOutputStream(uri).use { out ->
            requireNotNull(out) { "Could not open Downloads entry for writing." }
            sourceFile.inputStream().use { it.copyTo(out) }
        }
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    } else {
        val downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ForgeScan")
        downloadsDir.mkdirs()
        val destFile = File(downloadsDir, displayName)
        sourceFile.inputStream().use { input -> destFile.outputStream().use { input.copyTo(it) } }
        return Uri.fromFile(destFile)
    }
}
