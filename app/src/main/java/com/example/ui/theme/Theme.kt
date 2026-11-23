package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val StalzoneColorScheme = darkColorScheme(
    primary = ZoneAmber,
    onPrimary = ZoneVoid,
    secondary = ZoneToxic,
    onSecondary = ZoneVoid,
    tertiary = ZoneCrimson,
    background = ZoneVoid,
    onBackground = ZoneTextPrimary,
    surface = ZoneGunmetal,
    onSurface = ZoneTextPrimary,
    surfaceVariant = ZonePanel,
    onSurfaceVariant = ZoneTextMuted,
    outline = ZoneBorder,
    error = ZoneCrimson
)

@Composable
fun MyApplicationTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = StalzoneColorScheme,
        typography = Typography,
        content = content
    )
}
