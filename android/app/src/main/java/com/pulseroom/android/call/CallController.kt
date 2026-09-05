package com.pulseroom.android.call

import android.content.Context
import android.content.Intent
import com.pulseroom.android.data.PulseApi
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.LocalAudioTrack
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.RemoteAudioTrack
import io.livekit.android.room.track.RemoteTrackPublication
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

data class VoiceMember(val id: String, val name: String, val muted: Boolean, val speaking: Boolean, val local: Boolean)
data class ScreenShare(val id: String, val ownerId: String, val name: String, val track: VideoTrack?)
data class CallState(
    val channelId: String? = null, val channelName: String = "", val status: String = "Disconnected",
    val room: Room? = null, val members: List<VoiceMember> = emptyList(), val shares: List<ScreenShare> = emptyList(),
    val selectedShare: String? = null, val muted: Boolean = true, val deafened: Boolean = false,
    val canSpeak: Boolean = false, val heardSinceUnmute: Boolean = false,
    val streamVolume: Float = 50f, val voiceVolumes: Map<String, Float> = emptyMap(),
    val routes: List<String> = emptyList(), val route: String? = null,
    val noiseSuppression: Boolean = true, val error: String? = null,
)

/** Single owner for media resources. UI recomposition never recreates a room or audio track. */
class CallController(private val context: Context, private val api: PulseApi) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutable = MutableStateFlow(CallState())
    val state = mutable.asStateFlow()
    private var room: Room? = null
    private var connection: Job? = null
    private var events: Job? = null
    private var micChange: Job? = null
    private var generation = 0
    private var visible = true
    private var requestedMute = false

    fun connect(channelId: String, name: String, canSpeak: Boolean) {
        if (mutable.value.channelId == channelId && room != null) return
        disposeRoom()
        val current = generation
        requestedMute = false
        mutable.value = CallState(channelId = channelId, channelName = name, status = "Connecting", canSpeak = canSpeak)
        connection = scope.launch {
            try {
                val credentials = api.roomToken(channelId)
                if (current != generation) return@launch
                // Adaptive stream would decide what to receive from the size and
                // visibility of the view holding it, which this application has
                // already decided for itself: it subscribes to the one screen
                // being watched and drops the picture when the screen goes away.
                // Two opinions on one track deadlock, because a renderer that is
                // sent no frames never reports a size worth sending frames to.
                val activeRoom = LiveKit.create(context, RoomOptions(
                    adaptiveStream = false, dynacast = true,
                    audioTrackCaptureDefaults = LocalAudioTrackOptions(noiseSuppression = true, echoCancellation = true, autoGainControl = true),
                ))
                room = activeRoom
                activeRoom.audioSwitchHandler?.loggingEnabled = false
                activeRoom.audioSwitchHandler?.registerAudioDeviceChangeListener { devices, selected ->
                    scope.launch {
                        if (room === activeRoom) mutable.value = mutable.value.copy(routes = devices.map { it.name }, route = selected?.name)
                    }
                }
                events = scope.launch {
                    activeRoom.events.collect { event ->
                        if (room !== activeRoom) return@collect
                        when (event) {
                            is RoomEvent.Disconnected -> leave("Call ended. You can join again.")
                            is RoomEvent.Reconnecting -> mutable.value = mutable.value.copy(status = "Reconnecting")
                            is RoomEvent.Reconnected -> { mutable.value = mutable.value.copy(status = "Connected"); refresh() }
                            else -> refresh()
                        }
                    }
                }
                withTimeout(30_000) { activeRoom.connect(credentials.serverUrl, credentials.token, ConnectOptions(autoSubscribe = false)) }
                if (current != generation) return@launch
                if (canSpeak) {
                    try { activeRoom.localParticipant.setMicrophoneEnabled(true) }
                    catch (error: Exception) {
                        if (error is CancellationException) throw error
                        mutable.value = mutable.value.copy(error = "Microphone could not start. Tap Unmute to retry.")
                    }
                }
                mutable.value = mutable.value.copy(room = activeRoom, status = "Connected")
                refresh()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (current == generation) leave(error.message ?: "Could not join the call. Try again.")
            }
        }
    }

    private fun refresh() {
        val activeRoom = room ?: return
        val snapshot = mutable.value
        val participants = activeRoom.remoteParticipants.values.toList()
        val shares = participants.flatMap { participant ->
            participant.trackPublications.values.filter { it.source == Track.Source.SCREEN_SHARE && !it.muted }.map {
                ScreenShare(it.sid, participant.identity?.value.orEmpty(), participant.name ?: "Member", it.track as? VideoTrack)
            }
        }
        val selected = snapshot.selectedShare?.takeIf { id -> shares.any { it.id == id } } ?: shares.firstOrNull()?.id
        val local = activeRoom.localParticipant
        val allMembers = listOf(local) + participants
        val muted = local.getTrackPublication(Track.Source.MICROPHONE)?.let { it.muted } ?: true
        mutable.value = snapshot.copy(
            shares = shares, selectedShare = selected,
            members = allMembers.map { participant ->
                val publication = participant.getTrackPublication(Track.Source.MICROPHONE)
                VoiceMember(participant.identity?.value.orEmpty(), participant.name ?: "You",
                    publication == null || publication.muted, participant.isSpeaking, participant === local)
            },
            muted = muted,
            // The room reports who it hears. A microphone the system feeds with
            // silence never appears there, which is the only way to tell the
            // difference between a quiet person and a dead input.
            heardSinceUnmute = !muted && (snapshot.heardSinceUnmute || local.isSpeaking),
        )
        applySubscriptions()
    }

    private fun applySubscriptions() {
        val snapshot = mutable.value
        val selected = snapshot.shares.firstOrNull { it.id == snapshot.selectedShare }
        room?.remoteParticipants?.values?.forEach { participant ->
            val identity = participant.identity?.value.orEmpty()
            participant.trackPublications.values.forEach { publication ->
                val remote = publication as? RemoteTrackPublication ?: return@forEach
                val isVideo = remote.source == Track.Source.SCREEN_SHARE
                val isStreamAudio = remote.source == Track.Source.SCREEN_SHARE_AUDIO
                val chosen = selected?.ownerId == identity
                val subscribe = when (remote.source) {
                    Track.Source.MICROPHONE -> AudioPolicy.subscribes(RemoteSource.VOICE, true, visible)
                    Track.Source.SCREEN_SHARE ->
                        AudioPolicy.subscribes(RemoteSource.SCREEN_VIDEO, remote.sid == selected?.id, visible)
                    Track.Source.SCREEN_SHARE_AUDIO ->
                        AudioPolicy.subscribes(RemoteSource.SCREEN_AUDIO, chosen, visible)
                    else -> false
                }
                if (remote.isDesired != subscribe) remote.setSubscribed(subscribe)
                if (!isVideo) (remote.track as? RemoteAudioTrack)?.setVolume(AudioPolicy.receivedGain(
                    snapshot.deafened, isStreamAudio, chosen,
                    if (isStreamAudio) snapshot.streamVolume else snapshot.voiceVolumes[identity] ?: 100f,
                ))
            }
        }
    }

    fun selectShare(id: String) { mutable.value = mutable.value.copy(selectedShare = id); applySubscriptions() }
    fun setVisible(value: Boolean) { visible = value; applySubscriptions() }
    fun setStreamVolume(value: Float) { mutable.value = mutable.value.copy(streamVolume = value.coerceIn(0f, 100f)); applySubscriptions() }
    fun setVoiceVolume(identity: String, value: Float) {
        mutable.value = mutable.value.copy(voiceVolumes = mutable.value.voiceVolumes + (identity to value.coerceIn(0f, 200f)))
        applySubscriptions()
    }
    fun selectRoute(name: String) {
        val handler = room?.audioSwitchHandler ?: return
        handler.selectDevice(handler.availableAudioDevices.firstOrNull { it.name == name })
    }
    fun toggleMute() {
        if (!mutable.value.canSpeak || micChange?.isActive == true) return
        requestedMute = !mutable.value.muted
        if (!requestedMute) mutable.value = mutable.value.copy(deafened = false)
        updateMicrophone()
        applySubscriptions()
    }
    fun toggleDeafen() {
        mutable.value = mutable.value.copy(deafened = !mutable.value.deafened)
        updateMicrophone()
        applySubscriptions()
    }
    private fun updateMicrophone() {
        micChange?.cancel()
        val activeRoom = room ?: return
        val enabled = mutable.value.canSpeak && !requestedMute && !mutable.value.deafened
        micChange = scope.launch {
            try {
                activeRoom.localParticipant.setMicrophoneEnabled(enabled)
                if (room === activeRoom) refresh()
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) { mutable.value = mutable.value.copy(error = "Could not change the microphone. Try again.") }
        }
    }
    fun setNoiseSuppression(enabled: Boolean) {
        val track = room?.localParticipant?.getTrackPublication(Track.Source.MICROPHONE)?.track as? LocalAudioTrack ?: return
        val result = track.applyOptions(track.options.copy(noiseSuppression = enabled))
        mutable.value = if (result.isSuccess) mutable.value.copy(noiseSuppression = enabled)
        else mutable.value.copy(error = "Could not change noise suppression.")
    }
    fun clearError() { mutable.value = mutable.value.copy(error = null) }
    fun leave(error: String? = null) {
        disposeRoom()
        mutable.value = CallState(error = error)
        context.stopService(Intent(context, VoiceService::class.java))
    }
    fun serviceDestroyed() { disposeRoom(); mutable.value = CallState(error = mutable.value.error) }
    private fun disposeRoom() {
        generation++
        connection?.cancel(); connection = null
        events?.cancel(); events = null
        micChange?.cancel(); micChange = null
        val previous = room
        room = null
        previous?.disconnect()
        previous?.release()
    }
}
