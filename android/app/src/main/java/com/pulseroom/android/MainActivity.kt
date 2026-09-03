package com.pulseroom.android

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import com.pulseroom.android.data.Channel
import com.pulseroom.android.data.InputRules
import com.pulseroom.android.ui.PulseRoot
import com.pulseroom.android.ui.PulseTheme
import com.pulseroom.android.ui.PulseViewModel

class MainActivity : ComponentActivity() {
    private val model: PulseViewModel by viewModels()
    private var pendingChannel: Channel? = null
    private val permissionRequest = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val channel = pendingChannel ?: return@registerForActivityResult
        pendingChannel = null
        val community = model.state.value.detail?.server ?: return@registerForActivityResult
        if (InputRules.canSpeak(channel, community) && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            model.reportError("Allow microphone access in Android settings to join a speaking channel.")
        } else model.joinVoice(channel)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        volumeControlStream = AudioManager.STREAM_VOICE_CALL
        setContent { PulseTheme { PulseRoot(model, ::requestJoin) } }
    }
    private fun requestJoin(channel: Channel) {
        if (pendingChannel != null) return
        val community = model.state.value.detail?.server ?: return
        val permissions = buildList {
            if (InputRules.canSpeak(channel, community)) add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 31) add(Manifest.permission.BLUETOOTH_CONNECT)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (permissions.isEmpty()) model.joinVoice(channel)
        else { pendingChannel = channel; permissionRequest.launch(permissions.toTypedArray()) }
    }
    override fun onStart() { super.onStart(); model.setForeground(true) }
    override fun onStop() { model.setForeground(false); super.onStop() }
}
