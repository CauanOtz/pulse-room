package com.pulseroom.android.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.pulseroom.android.call.CallController
import com.pulseroom.android.call.CallState
import io.livekit.android.renderer.TextureViewRenderer
import kotlinx.coroutines.delay

@Composable fun StreamPlayer(call: CallState, controller: CallController, fullScreen: Boolean, onFullscreen: () -> Unit, modifier: Modifier = Modifier) {
    val selected = call.shares.firstOrNull { it.id == call.selectedShare }
    val track = selected?.track
    val room = call.room
    val context = LocalContext.current
    var controls by remember { mutableStateOf(true) }
    var interaction by remember { mutableIntStateOf(0) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(interaction, fullScreen, dragging) {
        if (fullScreen && !dragging) { delay(3_500); controls = false }
    }
    DisposableEffect(fullScreen) {
        val activity = context as? Activity
        val previous = activity?.requestedOrientation
        val insets = activity?.window?.let { WindowCompat.getInsetsController(it, it.decorView) }
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (fullScreen) {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            insets?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insets?.hide(WindowInsetsCompat.Type.systemBars())
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (fullScreen) {
                if (previous != null) activity.requestedOrientation = previous
                insets?.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }
    Box(modifier.background(Color.Black).pointerInput(Unit) { detectTapGestures { controls = true; interaction++ } }) {
        if (room != null && track != null) key(track) {
            // One renderer per track. Volume and speaking-state changes do not detach the video.
            AndroidView(
                factory = { viewContext -> TextureViewRenderer(viewContext).apply { room.initVideoRenderer(this); track.addRenderer(this) } },
                modifier = Modifier.fillMaxSize(),
                onRelease = { renderer -> track.removeRenderer(renderer); renderer.release() },
            )
        } else Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(Modifier.size(28.dp))
            Text("Loading stream…", Modifier.padding(top = 12.dp), color = Color.White)
        }
        if (controls || !fullScreen) {
            LazyRow(Modifier.align(Alignment.TopStart).fillMaxWidth().background(Color.Black.copy(alpha = 0.72f)).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(call.shares, key = { it.id }) { share ->
                    FilterChip(share.id == call.selectedShare, { controller.selectShare(share.id); controls = true; interaction++ }, label = { Text("${share.name}'s screen") })
                }
            }
            Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.82f)).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.VolumeUp, "Stream volume", tint = Color.White)
                Slider(call.streamVolume, { dragging = true; controller.setStreamVolume(it); interaction++ }, modifier = Modifier.weight(1f).padding(horizontal = 8.dp), valueRange = 0f..100f,
                    onValueChangeFinished = { dragging = false; interaction++ })
                Text("${call.streamVolume.toInt()}%", color = Color.White, style = MaterialTheme.typography.labelMedium)
                IconButton(onFullscreen) { Icon(if (fullScreen) Icons.Default.FullscreenExit else Icons.Default.Fullscreen, if (fullScreen) "Exit fullscreen" else "Fullscreen", tint = Color.White) }
            }
        }
    }
}
