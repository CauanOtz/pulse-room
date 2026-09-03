package com.pulseroom.android.call

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.pulseroom.android.MainActivity
import com.pulseroom.android.PulseApplication
import com.pulseroom.android.R

/** Started only by a visible activity after microphone permission, never on boot. */
class VoiceService : Service() {
    private val calls get() = (application as PulseApplication).calls
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_LEAVE) { calls.leave(); return START_NOT_STICKY }
        val channelId = intent?.getStringExtra("channelId") ?: run { stopSelf(); return START_NOT_STICKY }
        val name = intent.getStringExtra("channelName") ?: "Voice room"
        val canSpeak = intent.getBooleanExtra("canSpeak", false)
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("voice", "Active call", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val leave = PendingIntent.getService(this, 1, Intent(this, VoiceService::class.java).setAction(ACTION_LEAVE), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, "voice")
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("Pulse Room • $name")
            .setContentText("Call active — tap to return").setContentIntent(open).setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL).setSilent(true)
            .addAction(R.drawable.ic_notification, "Leave call", leave).build()
        try {
            ServiceCompat.startForeground(this, 17, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or
                if (canSpeak) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
            calls.connect(channelId, name, canSpeak)
        } catch (_: Exception) { calls.leave("Cannot start the call. Check microphone permission and try again."); stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() { calls.serviceDestroyed(); super.onDestroy() }
    companion object { const val ACTION_LEAVE = "com.pulseroom.android.LEAVE_CALL" }
}
