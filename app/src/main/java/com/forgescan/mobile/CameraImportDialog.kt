package com.forgescan.mobile

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
internal fun CameraImportDialog(
    onDismiss: () -> Unit,
    onPhotos: () -> Unit,
    onVideo: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Import Captures") },
        text = { Text("Select the photos or video you just captured with the Camera app.") },
        confirmButton = {
            Button(
                onClick = {
                    onDismiss()
                    onPhotos()
                },
                colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color(0xFF04222C)),
            ) { Text("Select Photos") }
        },
        dismissButton = {
            OutlinedButton(
                onClick = {
                    onDismiss()
                    onVideo()
                },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AppSecondary),
            ) { Text("Select Video") }
        },
        containerColor = AppPanel,
        titleContentColor = AppText,
        textContentColor = AppMuted,
    )
}
