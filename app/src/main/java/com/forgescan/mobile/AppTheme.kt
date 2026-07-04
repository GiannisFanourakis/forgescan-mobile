package com.forgescan.mobile

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

internal val AppBackground = Color(0xFF0A0E12)
internal val AppSurface = Color(0xFF11161C)
internal val AppPanel = Color(0xFF161C24)
internal val AppPrimary = Color(0xFF4DD2FF)
internal val AppSecondary = Color(0xFFFFB84D)
internal val AppText = Color(0xFFF0F4F8)
internal val AppMuted = Color(0xFFA0AAB6)

@Composable
internal fun ForgeScanTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = AppPrimary,
            onPrimary = Color(0xFF04222C),
            secondary = AppSecondary,
            background = AppBackground,
            onBackground = AppText,
            surface = AppPanel,
            onSurface = AppText,
        ),
        content = content,
    )
}
