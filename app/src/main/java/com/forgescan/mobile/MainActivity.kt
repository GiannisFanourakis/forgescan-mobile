package com.forgescan.mobile

import android.content.Intent
import android.net.Uri
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
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
    var activeRingId by remember { mutableStateOf<String?>(null) }
    var previewGlbFile by remember { mutableStateOf<File?>(null) }
    var previewMesh by remember { mutableStateOf<ForgeScanMesh?>(null) }
    // Which ring(s) previewMesh was actually carved from - GS export can only
    // reuse it as a seed cloud (GaussianSplatExporter.kt's meshSeedPoints)
    // for a request whose ring set matches this exactly; any other group has
    // no mesh in its own frame and must fall back to the sparse SfM cloud.
    var carvedRingIds by remember { mutableStateOf<List<String>>(emptyList()) }

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
            }.onSuccess { result ->
                project = result.updatedProject
                previewMesh = result.mesh
                carvedRingIds = result.carvedRingIds
                val glb = withContext(Dispatchers.IO) { exportMeshToGlb(context, result.mesh) }
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

    fun exportGsDataset(ringId: String) {
        val current = project ?: return
        val ring = current.rings.firstOrNull { it.ringId == ringId } ?: return
        val meshForSeed = if (carvedRingIds == listOf(ringId)) previewMesh else null
        scope.launch {
            busyMessage = "Exporting Gaussian-splat dataset..."
            runCatching {
                withContext(Dispatchers.IO) {
                    val datasetDir = File(exportsDir(context), "gs-dataset-$ringId")
                    exportGaussianSplatDataset(context, current, ring, datasetDir, meshForSeed)
                    val zip = File(exportsDir(context), "ForgeScan-gs-$ringId.zip")
                    zipDirectory(datasetDir, zip)
                    zip
                }
            }.onSuccess { zip ->
                withContext(Dispatchers.IO) { saveFileToDownloads(context, zip, zip.name, "application/zip") }
                statusMessage = "Saved ${zip.name} to Downloads/ForgeScan."
            }.onFailure {
                statusMessage = "GS dataset export failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
        }
    }

    fun exportFusedGsDataset(ringIds: List<String>) {
        val current = project ?: return
        val rings = ringIds.mapNotNull { id -> current.rings.firstOrNull { it.ringId == id } }
        if (rings.isEmpty()) return
        val groupName = ringIds.joinToString("-")
        val meshForSeed = if (carvedRingIds.toSet() == ringIds.toSet()) previewMesh else null
        scope.launch {
            busyMessage = "Exporting fused Gaussian-splat dataset..."
            runCatching {
                withContext(Dispatchers.IO) {
                    val datasetDir = File(exportsDir(context), "gs-dataset-$groupName")
                    exportFusedGaussianSplatDataset(context, current, rings, datasetDir, meshForSeed)
                    val zip = File(exportsDir(context), "ForgeScan-gs-$groupName.zip")
                    zipDirectory(datasetDir, zip)
                    zip
                }
            }.onSuccess { zip ->
                withContext(Dispatchers.IO) { saveFileToDownloads(context, zip, zip.name, "application/zip") }
                statusMessage = "Saved ${zip.name} to Downloads/ForgeScan."
            }.onFailure {
                statusMessage = "Fused GS dataset export failed: ${it.message ?: "Unknown error"}"
            }
            busyMessage = null
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
            screen == Screen.Preview && previewGlbFile != null -> MeshPreviewScreen(
                glbFile = previewGlbFile!!,
                rings = currentProject.rings,
                detectedRingGroups = currentProject.detectedRingGroups,
                busyMessage = busyMessage,
                statusMessage = statusMessage,
                onSaveGlb = ::saveGlb,
                onShareGlb = ::shareGlb,
                onExportObj = ::exportObj,
                onExportGsDataset = ::exportGsDataset,
                onExportFusedGsDataset = ::exportFusedGsDataset,
                onBack = { screen = Screen.Capture },
            )
            else -> RingCaptureScreen(
                project = currentProject,
                busyMessage = busyMessage,
                statusMessage = statusMessage,
                onCaptureVideo = onCaptureVideo,
                onImportVideo = onImportVideo,
                onAddRing = onAddRing,
                onRemoveRing = onRemoveRing,
                onProcess = ::runProcess,
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
