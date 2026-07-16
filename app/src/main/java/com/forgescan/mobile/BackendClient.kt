package com.forgescan.mobile

import android.content.Context
import android.net.Uri
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody

class BackendUploadException(message: String) : Exception(message)

// Builds the exact zip layout pipeline.py's _mask_and_flatten_rings expects:
// <ringId>/<filename>.jpg directly, with NO nested frames/ folder - confirmed
// against a real successful upload this session. pipeline.py reads jpgs via
// ring_dir.glob("*.jpg") straight from each ring folder, even though this
// app's own on-device storage nests frames one level deeper under
// rings/<ringId>/frames/ - this flattens that one level, it doesn't mirror
// the on-device layout as-is.
internal fun buildScanZip(context: Context, project: ForgeScanProject): File {
    val zipFile = File(exportsDir(context), "cloud-scan-${project.projectId}.zip")
    ZipOutputStream(zipFile.outputStream()).use { zip ->
        project.rings.filter { it.frames.isNotEmpty() }.forEach { ring ->
            ring.frames.forEach { frame ->
                val sourceFile = File(Uri.parse(frame.uri).path ?: return@forEach)
                if (!sourceFile.exists()) return@forEach
                zip.putNextEntry(ZipEntry("${ring.ringId}/${sourceFile.name}"))
                sourceFile.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
    }
    return zipFile
}

// Long call timeouts: this is a single synchronous HTTP request that blocks
// for the backend's ENTIRE masking -> registration -> GS training run
// (process_scan_splat_endpoint has no job queue/status endpoint to poll yet -
// see the approved plan's "deliberately deferred" section). 60 minutes gives
// margin over the backend's own 5400s/90min function timeout... actually
// under it - matched intentionally so the client fails with a clear timeout
// message instead of hanging past what the server would ever still be doing.
private val cloudHttpClient = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(10, TimeUnit.MINUTES)
    .readTimeout(60, TimeUnit.MINUTES)
    .callTimeout(60, TimeUnit.MINUTES)
    .build()

// Uploads a scan zip and returns the trained Gaussian-splat .ply. onStage
// reports coarse status only ("uploading" / "waiting on cloud training") -
// no percentage, since the backend doesn't report mid-job progress.
internal fun uploadScanForSplat(context: Context, zipFile: File, onStage: (String) -> Unit): File {
    val endpointUrl = BuildConfig.BACKEND_SPLAT_ENDPOINT_URL
    val apiKey = BuildConfig.BACKEND_API_KEY
    if (endpointUrl.isBlank() || apiKey.isBlank()) {
        throw BackendUploadException("Cloud backend isn't configured (missing backend.properties).")
    }

    onStage("Uploading scan...")
    val request = Request.Builder()
        .url(endpointUrl)
        .header("X-API-Key", apiKey)
        .post(zipFile.asRequestBody("application/zip".toMediaType()))
        .build()

    onStage("Training on cloud - this can take up to ~40 minutes...")
    cloudHttpClient.newCall(request).execute().use { response ->
        if (!response.isSuccessful) {
            throw BackendUploadException("Cloud training failed: HTTP ${response.code}")
        }
        val body = response.body ?: throw BackendUploadException("Cloud training returned an empty response.")
        val outputFile = File(exportsDir(context), "cloud-splat-${System.currentTimeMillis()}.ply")
        body.byteStream().use { input -> outputFile.outputStream().use { output -> input.copyTo(output) } }
        return outputFile
    }
}
