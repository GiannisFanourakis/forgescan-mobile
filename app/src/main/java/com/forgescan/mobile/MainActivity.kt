package com.forgescan.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.widget.Toast
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
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val PhotoPickLimit = 120
private enum class Screen { Capture, Preview }

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
    var showCameraImportPrompt by remember { mutableStateOf(false) }
    var activeRingId by remember { mutableStateOf<String?>(null) }
    var previewGlbFile by remember { mutableStateOf<File?>(null) }
    var previewMesh by remember { mutableStateOf<ForgeScanMesh?>(null) }
    val photoPickLimit = remember { safePhotoPickLimit() }

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

    fun importImagesToRing(ringId: String, uris: List<Uri>) {
        val current = project ?: return
        scope.launch {
            val startedAt = System.currentTimeMillis()
            busyMessage = previewProgressMessage("Importing photos", 0, uris.size, startedAt)
            runCatching {
                withContext(Dispatchers.IO) {
                    importImagesIntoRing(context, current, ringId, uris) { completed, total ->
                        withContext(Dispatchers.Main) {
                            busyMessage = previewProgressMessage("Importing photos", completed, total, startedAt)
                        }
                    }
                }
            }.onSuccess {
                persist(it)
                statusMessage = "Imported ${uris.size} photos into ring."
            }.onFailure {
                statusMessage = "Image import failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
        }
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

    fun runProcess() {
        val current = project ?: return
        scope.launch {
            var currentStage = "Starting..."
            var stageStartedAt = System.currentTimeMillis()
            busyMessage = currentStage
            runCatching {
                withContext(Dispatchers.IO) {
                    runReconstructionPipeline(
                        context,
                        current,
                        onStatus = { message ->
                            withContext(Dispatchers.Main) {
                                currentStage = message
                                stageStartedAt = System.currentTimeMillis()
                                busyMessage = message
                            }
                        },
                        onProgress = { completed, total ->
                            withContext(Dispatchers.Main) {
                                busyMessage = previewProgressMessage(currentStage, completed, total, stageStartedAt)
                            }
                        },
                    )
                }
            }.onSuccess { mesh ->
                previewMesh = mesh
                val glb = withContext(Dispatchers.IO) { exportMeshToGlb(context, mesh) }
                previewGlbFile = glb
                statusMessage = "Reconstruction complete."
                screen = Screen.Preview
            }.onFailure {
                statusMessage = "Processing failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
        }
    }

    fun saveGlb() {
        val glb = previewGlbFile ?: return
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { saveFileToDownloads(context, glb, glb.name, "model/gltf-binary") }
            }.onSuccess {
                statusMessage = "Saved ${glb.name} to Downloads/ForgeScan."
            }.onFailure {
                statusMessage = "Save failed: ${it.message ?: "Unknown error"}"
            }
        }
    }

    fun shareGlb() {
        val glb = previewGlbFile ?: return
        runCatching {
            context.startActivity(Intent.createChooser(shareFileIntent(context, glb, "model/gltf-binary"), "Share ForgeScan GLB"))
        }.onFailure {
            statusMessage = "Share failed: ${it.message ?: "Unknown error"}"
        }
    }

    fun exportObj() {
        val mesh = previewMesh ?: return
        scope.launch {
            busyMessage = "Writing OBJ..."
            runCatching {
                withContext(Dispatchers.IO) { exportMeshToObjZip(context, mesh) }
            }.onSuccess { zip ->
                withContext(Dispatchers.IO) { saveFileToDownloads(context, zip, zip.name, "application/zip") }
                statusMessage = "Saved ${zip.name} to Downloads/ForgeScan."
            }.onFailure {
                statusMessage = "OBJ export failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(photoPickLimit)) { uris ->
        val ringId = activeRingId
        if (ringId == null || uris.isEmpty()) statusMessage = "No photos selected." else importImagesToRing(ringId, uris)
    }
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val ringId = activeRingId
        if (ringId == null || uri == null) statusMessage = "No video selected." else importVideoToRing(ringId, uri)
    }
    val cameraApp = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        showCameraImportPrompt = true
        statusMessage = "Camera closed. Select the captures to import."
    }

    val onCapture: (String) -> Unit = { ringId ->
        activeRingId = ringId
        runCatching {
            statusMessage = "Use Camera, then return to ForgeScan to import the captures."
            cameraApp.launch(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
        }.onFailure {
            Toast.makeText(context, "No Camera app is available.", Toast.LENGTH_SHORT).show()
        }
    }
    val onImportPhotos: (String) -> Unit = { ringId ->
        activeRingId = ringId
        runCatching {
            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }.onFailure {
            statusMessage = "Could not open photo picker: ${it.message ?: "Unknown error"}"
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
        if (showCameraImportPrompt) {
            CameraImportDialog(
                onDismiss = { showCameraImportPrompt = false },
                onPhotos = { activeRingId?.let(onImportPhotos) },
                onVideo = { activeRingId?.let(onImportVideo) },
            )
        }
        val currentProject = project
        when {
            currentProject == null -> Text("Loading...", color = MaterialTheme.colorScheme.onBackground)
            screen == Screen.Preview && previewGlbFile != null -> MeshPreviewScreen(
                glbFile = previewGlbFile!!,
                busyMessage = busyMessage,
                statusMessage = statusMessage,
                onSaveGlb = ::saveGlb,
                onShareGlb = ::shareGlb,
                onExportObj = ::exportObj,
                onBack = { screen = Screen.Capture },
            )
            else -> RingCaptureScreen(
                project = currentProject,
                busyMessage = busyMessage,
                statusMessage = statusMessage,
                onCapture = onCapture,
                onImportPhotos = onImportPhotos,
                onImportVideo = onImportVideo,
                onAddRing = onAddRing,
                onRemoveRing = onRemoveRing,
                onProcess = ::runProcess,
            )
        }
    }
}

private fun safePhotoPickLimit(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        minOf(PhotoPickLimit, MediaStore.getPickImagesMaxLimit()).coerceAtLeast(2)
    } else {
        PhotoPickLimit
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
