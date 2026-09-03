package com.pulseroom.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Existing Pulse Room surfaces; Roboto follows Android accessibility and font scaling.
val Rail = Color(0xFF11151E)
val Slate = Color(0xFF171D29)
val Raised = Color(0xFF252E3E)
val Lavender = Color(0xFF9AABFF)
val Ink = Color(0xFFEDF0F7)
val Speaking = Color(0xFF65D5A3)

@Composable fun PulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = Lavender, onPrimary = Rail, background = Rail,
            surface = Slate, surfaceVariant = Raised, onSurface = Ink, onBackground = Ink,
            onSurfaceVariant = Color(0xFFA5AEC0), outline = Color(0xFF43506A), error = Color(0xFFFFA3AE)),
        typography = Typography(
            headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 38.sp),
            titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 23.sp, lineHeight = 29.sp),
            titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 23.sp),
            bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp, lineHeight = 24.sp),
            bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 21.sp),
        ), content = content,
    )
}
