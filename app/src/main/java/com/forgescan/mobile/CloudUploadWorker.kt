package com.forgescan.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.File

private const val NotificationChannelId = "cloud_training"
private const val ProgressNotificationId = 4201
private const val ResultNotificationId = 4202

// Runs BackendClient.kt's upload+training call as a real foreground service,
// not a coroutine scoped to the Compose UI (MainActivity.kt's old
// runCloudUpload did that first) - a run this long (up to ~40 minutes) isn't
// guaranteed to survive app backgrounding otherwise, and this test device
// specifically (MIUI) is known for aggressively killing backgrounded apps to
// save battery. setForeground(), not setExpedited() - expedited work has a
// short system-imposed execution window, unsuitable here.
class CloudUploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val zipPath = inputData.getString(KeyZipPath) ?: return Result.failure(workDataOf(KeyError to "No scan zip provided."))
        val zipFile = File(zipPath)
        if (!zipFile.exists()) return Result.failure(workDataOf(KeyError to "Scan zip missing."))

        ensureNotificationChannel()
        setForeground(foregroundInfo("Uploading scan..."))

        return try {
            // onStage runs on OkHttp's blocking execute() call (not a suspend
            // context - same reason BackendClient.kt's onStage isn't suspend
            // either), so setForegroundAsync (fire-and-forget), not the
            // suspend setForeground, for these intermediate updates.
            val ply = uploadScanForSplat(applicationContext, zipFile) { stage ->
                setForegroundAsync(foregroundInfo(stage))
            }
            saveFileToDownloads(applicationContext, ply, ply.name, "application/octet-stream")
            notifyResult(success = true, message = "Your ForgeScan splat is ready - saved to Downloads/ForgeScan.")
            Result.success(workDataOf(KeyResultPath to ply.absolutePath))
        } catch (e: Exception) {
            notifyResult(success = false, message = "Cloud training failed: ${e.message ?: "Unknown error"}")
            Result.failure(workDataOf(KeyError to (e.message ?: "Unknown error")))
        }
    }

    private fun ensureNotificationChannel() {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        // Re-creating an existing channel with the same ID is a documented
        // no-op, so this doesn't need an "already created" guard.
        manager.createNotificationChannel(
            NotificationChannel(NotificationChannelId, "Cloud training", NotificationManager.IMPORTANCE_LOW),
        )
    }

    private fun foregroundInfo(status: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, NotificationChannelId)
            .setContentTitle("ForgeScan cloud training")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .build()
        // FOREGROUND_SERVICE_TYPE_DATA_SYNC requires API 29+; older versions
        // use the 2-arg ForegroundInfo constructor with no type at all.
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(ProgressNotificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(ProgressNotificationId, notification)
        }
    }

    private fun notifyResult(success: Boolean, message: String) {
        // POST_NOTIFICATIONS (API 33+) is a runtime-requestable permission
        // (see MainActivity.kt) - if it was never granted, the upload still
        // completed fine, this notification just silently doesn't show.
        val hasPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ActivityCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return

        val notification = NotificationCompat.Builder(applicationContext, NotificationChannelId)
            .setContentTitle(if (success) "Scan ready" else "Cloud training failed")
            .setContentText(message)
            .setSmallIcon(
                if (success) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error,
            )
            .setAutoCancel(true)
            .build()
        applicationContext.getSystemService(NotificationManager::class.java).notify(ResultNotificationId, notification)
    }

    companion object {
        const val KeyZipPath = "zipPath"
        const val KeyResultPath = "resultPath"
        const val KeyError = "error"
    }
}
