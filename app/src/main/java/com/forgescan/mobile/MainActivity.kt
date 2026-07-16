package com.forgescan.mobile

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class Screen { Capture, SplatPreview }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ForgeScanTheme { ForgeScanApp() } }
    }
}

@Composable
private fun ForgeScanApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var project by remember { mutableStateOf<ForgeScanProject?>(null) }
    var screen by remember { mutableStateOf(Screen.Capture) }
    var busyMessage by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var activeRingId by remember { mutableStateOf<String?>(null) }
    // Set once runCloudUpload()'s WorkInfo Flow observes SUCCEEDED - lets the
    // Capture screen offer "View Splat" (SplatViewerScreen.kt) for the file
    // that specific run just produced, without needing to re-scan Downloads.
    var cloudSplatFile by remember { mutableStateOf<File?>(null) }
    // CloudUploadWorker.kt's progress/completion notifications need this on
    // API 33+ - requested when the cloud upload starts (runCloudUpload()),
    // not blocking either way: if denied, the upload still runs to
    // completion, it just won't show a notification.
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    LaunchedEffect(Unit) {
        val loaded = withContext(Dispatchers.IO) { loadMostRecentProject(context) }
        project = if (loaded != null) {
            loaded
        } else {
            val fresh = createForgeScanProject(title = "ForgeScan Project")
            withContext(Dispatchers.IO) { saveProject(context, fresh) }
            fresh
        }
    }

    fun persist(next: ForgeScanProject) {
        project = next
        scope.launch { withContext(Dispatchers.IO) { saveProject(context, next) } }
    }

    fun importVideoToRing(ringId: String, uri: Uri) {
        val current = project ?: return
        scope.launch {
            val startedAt = System.currentTimeMillis()
            busyMessage = previewProgressMessage("Extracting video frames", 0, 120, startedAt)
            runCatching {
                withContext(Dispatchers.IO) {
                    importVideoIntoRing(context, current, ringId, uri) { completed, total ->
                        withContext(Dispatchers.Main) {
                            busyMessage = previewProgressMessage("Extracting video frames", completed, total, startedAt)
                        }
                    }
                }
            }.onSuccess {
                persist(it)
                statusMessage = "Extracted frames into ring."
            }.onFailure {
                statusMessage = "Video import failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
        }
    }

    // Enqueues CloudUploadWorker.kt rather than calling BackendClient.kt
    // directly from this Activity-scoped coroutine - a run this long (up to
    // ~40 minutes) needs to survive app backgrounding, which a plain
    // coroutine can't guarantee (confirmed a real risk on this device
    // specifically: MIUI is known for aggressively killing backgrounded
    // apps). WorkManager's own WorkInfo Flow keeps this screen's
    // busyMessage/statusMessage updated while the app IS in the foreground;
    // if it isn't, the worker's own notification (CloudUploadWorker.kt)
    // carries the status instead. Stays on the Capture screen rather than
    // navigating away immediately - SplatViewerScreen.kt is opened
    // explicitly via the "View Splat" button once cloudSplatFile is set.
    fun runCloudUpload() {
        val current = project ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        scope.launch {
            busyMessage = "Preparing upload..."
            val zip = try {
                withContext(Dispatchers.IO) { buildScanZip(context, current) }
            } catch (e: Exception) {
                statusMessage = "Cloud upload failed: ${e.message ?: "Unknown error"}"
                busyMessage = null
                return@launch
            }

            val request = OneTimeWorkRequestBuilder<CloudUploadWorker>()
                .setInputData(workDataOf(CloudUploadWorker.KeyZipPath to zip.absolutePath))
                .build()
            val workManager = WorkManager.getInstance(context)
            workManager.enqueue(request)
            workManager.getWorkInfoByIdFlow(request.id).collect { info ->
                when (info?.state) {
                    WorkInfo.State.ENQUEUED, WorkInfo.State.RUNNING -> {
                        busyMessage = "Cloud training in progress - see notification for status."
                    }
                    WorkInfo.State.SUCCEEDED -> {
                        statusMessage = "Cloud training complete. Check Downloads/ForgeScan."
                        cloudSplatFile = info.outputData.getString(CloudUploadWorker.KeyResultPath)?.let(::File)
                        busyMessage = null
                    }
                    WorkInfo.State.FAILED -> {
                        statusMessage = "Cloud upload failed: " +
                            (info.outputData.getString(CloudUploadWorker.KeyError) ?: "Unknown error")
                        busyMessage = null
                    }
                    WorkInfo.State.CANCELLED -> {
                        statusMessage = "Cloud upload cancelled."
                        busyMessage = null
                    }
                    else -> Unit
                }
            }
        }
    }

    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val ringId = activeRingId
        if (ringId == null || uri == null) statusMessage = "No video selected." else importVideoToRing(ringId, uri)
    }
    // No EXTRA_OUTPUT: camera apps don't reliably hand back a usable Uri
    // through the activity result across devices/vendors, so recording
    // and importing stay two explicit steps - the user records here, then
    // taps Import Video to select what they just recorded, same reliable
    // pattern this app already used for the (now-removed) still-photo path.
    val cameraApp = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        statusMessage = "Camera closed. Use Import Video to select the recording."
    }

    val onCaptureVideo: (String) -> Unit = { ringId ->
        activeRingId = ringId
        runCatching {
            cameraApp.launch(Intent(MediaStore.ACTION_VIDEO_CAPTURE))
        }.onFailure {
            statusMessage = "No Camera app is available."
        }
    }
    val onImportVideo: (String) -> Unit = { ringId ->
        activeRingId = ringId
        runCatching {
            videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
        }.onFailure {
            statusMessage = "Could not open video picker: ${it.message ?: "Unknown error"}"
        }
    }
    val onAddRing: (String, String) -> Unit = { ringId, label ->
        project?.let { persist(it.addRing(ringId, label)) }
    }
    val onRemoveRing: (String) -> Unit = { ringId ->
        project?.let { persist(it.removeRing(ringId)) }
    }

    Surface(modifier = Modifier.fillMaxSize().systemBarsPadding(), color = MaterialTheme.colorScheme.background) {
        val currentProject = project
        when {
            currentProject == null -> Text("Loading...", color = MaterialTheme.colorScheme.onBackground)
            screen == Screen.SplatPreview && cloudSplatFile != null -> SplatViewerScreen(
                plyFile = cloudSplatFile!!,
                onBack = { screen = Screen.Capture },
            )
            else -> RingCaptureScreen(
                project = currentProject,
                busyMessage = busyMessage,
                statusMessage = statusMessage,
                cloudSplatFile = cloudSplatFile,
                onCaptureVideo = onCaptureVideo,
                onImportVideo = onImportVideo,
                onAddRing = onAddRing,
                onRemoveRing = onRemoveRing,
                onCloudUpload = ::runCloudUpload,
                onViewSplat = { screen = Screen.SplatPreview },
            )
        }
    }
}

internal fun previewProgressMessage(action: String, completed: Int, total: Int, startedAtMillis: Long): String {
    val safeTotal = total.coerceAtLeast(1)
    val done = completed.coerceIn(0, safeTotal)
    val percent = done * 100 / safeTotal
    val eta = when {
        done == 0 -> "estimating ETA"
        done >= safeTotal -> "finishing"
        else -> {
            val elapsedMs = (System.currentTimeMillis() - startedAtMillis).coerceAtLeast(0L)
            val remainingMs = elapsedMs * (safeTotal - done) / done
            "ETA ${formatRemainingTime(remainingMs)}"
        }
    }
    return "$action: $done/$safeTotal ($percent%) - $eta"
}

private fun formatRemainingTime(milliseconds: Long): String {
    if (milliseconds < 1_000L) return "<1s"
    val totalSeconds = (milliseconds + 999L) / 1_000L
    val minutes = totalSeconds / 60L
    val seconds = totalSeconds % 60L
    return if (minutes == 0L) "${seconds}s" else "${minutes}m ${seconds}s"
}
