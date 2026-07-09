package com.forgescan.mobile

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
internal fun RingCaptureScreen(
    project: ForgeScanProject,
    busyMessage: String?,
    statusMessage: String?,
    onCaptureVideo: (ringId: String) -> Unit,
    onImportVideo: (ringId: String) -> Unit,
    onAddRing: (ringId: String, label: String) -> Unit,
    onRemoveRing: (ringId: String) -> Unit,
    onProcess: () -> Unit,
) {
    Page(title = project.title, subtitle = "Fill each ring with a steady turntable video pass.") {
        project.rings.forEach { ring ->
            Panel {
                Text(ring.label, style = MaterialTheme.typography.titleMedium)
                Text("${ring.frames.size} frames", color = AppMuted, style = MaterialTheme.typography.bodySmall)
                // Video is the primary path, not just one option among equals:
                // the backend's registration pairing (registration.py's
                // build_pair_list) assumes frames are evenly spread across
                // the ring's rotation to size its matching window correctly -
                // true by construction for frames extracted from a video shot
                // at constant rotation speed, but not guaranteed at all for
                // arbitrary picked photos (uneven spacing silently weakens
                // registration and was confirmed to produce a holier,
                // fragmented mesh on a real capture).
                Text(
                    "Record one steady, constant-speed rotation per ring - even spacing between frames is what makes registration reliable.",
                    color = AppMuted,
                    style = MaterialTheme.typography.bodySmall,
                )
                ActionButton(text = "Capture Video", onClick = { onCaptureVideo(ring.ringId) }, enabled = busyMessage == null)
                ActionButton(
                    text = "Import Video",
                    onClick = { onImportVideo(ring.ringId) },
                    enabled = busyMessage == null,
                    secondary = true,
                )
                // GS export lives on the Preview screen, not here - Process
                // (which detects ring groups) always lands the user on
                // Preview on success, so that's where the export options
                // are actually relevant, not a screen they'd have to
                // navigate back to find.
                //
                // Always available, even as the only ring - "Add Ring"
                // below is unconditional too, so there's no risk of getting
                // stuck without a way back to zero rings, and there's no
                // reason removing the last one should need a workaround
                // (add a second ring, then remove the first) to fix a
                // mistaken capture.
                ActionButton(
                    text = "Remove Ring",
                    onClick = { onRemoveRing(ring.ringId) },
                    enabled = busyMessage == null,
                    secondary = true,
                )
            }
        }

        Panel {
            // Ring identity used to double as an elevation assumption
            // ("Upright" -> 10deg, "Tilted" -> 60deg, etc. -
            // TurntableGeometry.kt's RingElevationDegrees) before this
            // session's SfM work started measuring the real elevation from
            // the footage instead. The name doesn't drive anything
            // functional anymore, so there's no reason to make the user
            // pick one - a plain auto-numbered ring is exactly as
            // meaningful as a hand-picked name now.
            val existingIds = project.rings.map { it.ringId }.toSet()
            ActionButton(
                text = "Add Ring",
                onClick = {
                    var n = existingIds.size + 1
                    while ("ring-$n" in existingIds) n++
                    onAddRing("ring-$n", "Ring $n")
                },
                enabled = busyMessage == null,
                secondary = true,
            )
        }

        val canProcess = project.rings.any { it.frames.isNotEmpty() }
        ActionButton(text = "Process", onClick = onProcess, enabled = busyMessage == null && canProcess)

        busyMessage?.let { Text(it, color = AppSecondary) }
        statusMessage?.let { Text(it, color = AppMuted) }
    }
}
