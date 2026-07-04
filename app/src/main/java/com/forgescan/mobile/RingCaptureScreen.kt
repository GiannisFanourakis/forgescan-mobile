package com.forgescan.mobile

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

private val RingPresets = listOf("Upright" to "upright", "Tilted" to "tilted", "Underside" to "underside")

@Composable
internal fun RingCaptureScreen(
    project: ForgeScanProject,
    busyMessage: String?,
    statusMessage: String?,
    onCapture: (ringId: String) -> Unit,
    onImportPhotos: (ringId: String) -> Unit,
    onImportVideo: (ringId: String) -> Unit,
    onAddRing: (ringId: String, label: String) -> Unit,
    onRemoveRing: (ringId: String) -> Unit,
    onProcess: () -> Unit,
) {
    Page(title = project.title, subtitle = "Fill each ring by capturing or importing a turntable pass.") {
        project.rings.forEach { ring ->
            Panel {
                Text(ring.label, style = MaterialTheme.typography.titleMedium)
                Text("${ring.frames.size} frames", color = AppMuted, style = MaterialTheme.typography.bodySmall)
                ActionButton(text = "Capture", onClick = { onCapture(ring.ringId) }, enabled = busyMessage == null)
                MenuActionButton(
                    text = "Import",
                    options = listOf(
                        "Import Photos" to { onImportPhotos(ring.ringId) },
                        "Import Video" to { onImportVideo(ring.ringId) },
                    ),
                    enabled = busyMessage == null,
                    secondary = true,
                )
                if (project.rings.size > 1) {
                    ActionButton(
                        text = "Remove Ring",
                        onClick = { onRemoveRing(ring.ringId) },
                        enabled = busyMessage == null,
                        secondary = true,
                    )
                }
            }
        }

        Panel {
            Text("Add Ring", style = MaterialTheme.typography.titleMedium)
            val existingIds = project.rings.map { it.ringId }.toSet()
            RingPresets.filter { (_, id) -> id !in existingIds }.forEach { (label, id) ->
                ActionButton(
                    text = "Add $label",
                    onClick = { onAddRing(id, label) },
                    enabled = busyMessage == null,
                    secondary = true,
                )
            }
            var customLabel by remember { mutableStateOf("") }
            OutlinedTextField(
                value = customLabel,
                onValueChange = { customLabel = it },
                label = { Text("Custom ring name") },
                modifier = Modifier.fillMaxWidth(),
            )
            ActionButton(
                text = "Add Custom Ring",
                onClick = {
                    val label = customLabel.trim()
                    if (label.isNotEmpty()) {
                        val slug = label.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')
                            .ifEmpty { "ring-${existingIds.size + 1}" }
                        onAddRing(slug, label)
                        customLabel = ""
                    }
                },
                enabled = busyMessage == null && customLabel.isNotBlank(),
            )
        }

        val canProcess = project.rings.any { it.frames.isNotEmpty() }
        ActionButton(text = "Process", onClick = onProcess, enabled = busyMessage == null && canProcess)

        busyMessage?.let { Text(it, color = AppSecondary) }
        statusMessage?.let { Text(it, color = AppMuted) }
    }
}
