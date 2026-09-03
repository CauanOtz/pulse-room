package com.pulseroom.android.ui

import android.app.Application
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pulseroom.android.PulseApplication
import com.pulseroom.android.call.VoiceService
import com.pulseroom.android.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AppState(
    val loading: Boolean = true, val busy: Boolean = false, val account: Account? = null,
    val servers: List<Community> = emptyList(), val detail: CommunityDetail? = null,
    val textChannel: Channel? = null, val messages: List<Message> = emptyList(),
    val presence: List<Occupancy> = emptyList(), val error: String? = null,
    val recoveryCode: String? = null, val inviteCode: String? = null,
    val online: Boolean = true, val hasOlderMessages: Boolean = false,
)

class PulseViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as PulseApplication
    private val api = app.api
    val calls = app.calls
    private val mutable = MutableStateFlow(AppState())
    val state = mutable.asStateFlow()
    private var polling: Job? = null
    private var foreground = false
    private var navigation = 0

    init { restore() }
    fun restore() = action {
        mutable.value = mutable.value.copy(loading = true)
        try {
            api.token = withContext(Dispatchers.IO) { app.vault.read() }
            if (api.token != null) {
                mutable.value = mutable.value.copy(account = api.me())
                loadServers()
            }
        } finally { mutable.value = mutable.value.copy(loading = false) }
    }
    fun authenticate(mode: String, username: String, displayName: String, password: String, code: String) = action {
        if (mode == "recover") {
            val response = api.recover(username, code, password)
            mutable.value = mutable.value.copy(recoveryCode = response.recoveryCode)
            return@action
        }
        val session = if (mode == "register") api.register(username, displayName, password) else api.login(username, password)
        withContext(Dispatchers.IO) { app.vault.save(session.token) }
        api.token = session.token
        mutable.value = AppState(loading = false, busy = true, account = session.user, recoveryCode = session.recoveryCode)
        loadServers()
        startPolling()
    }
    fun logout() = action {
        calls.leave()
        // Revoke the server session before discarding the local token. A failed logout can be retried.
        api.logout()
        resetSession()
    }
    private suspend fun resetSession() {
        navigation++
        polling?.cancel()
        calls.leave()
        withContext(Dispatchers.IO) { app.vault.clear() }
        api.token = null
        mutable.value = AppState(loading = false)
    }
    fun setForeground(value: Boolean) {
        foreground = value
        calls.setVisible(value)
        if (value) startPolling() else { polling?.cancel(); polling = null }
    }
    private fun startPolling() {
        if (!foreground || polling?.isActive == true) return
        polling = viewModelScope.launch {
            var tick = 0
            while (true) {
                delay(8_000)
                if (mutable.value.account != null && !mutable.value.busy) {
                    try {
                        refreshCurrent(tick++ % 3 == 0)
                        mutable.value = mutable.value.copy(online = true)
                    } catch (error: CancellationException) { throw error }
                    catch (error: ApiException) {
                        if (error.status == 401) { resetSession(); mutable.value = mutable.value.copy(error = "Your session ended. Sign in again.") }
                        else mutable.value = mutable.value.copy(online = false)
                    } catch (_: Exception) { mutable.value = mutable.value.copy(online = false) }
                }
            }
        }
    }
    private suspend fun loadServers(preferred: String? = null) {
        val servers = api.servers()
        mutable.value = mutable.value.copy(servers = servers)
        val id = preferred ?: mutable.value.detail?.server?.id ?: servers.firstOrNull()?.id
        if (id != null && servers.any { it.id == id }) selectServerInternal(id)
        else mutable.value = mutable.value.copy(detail = null, textChannel = null, messages = emptyList(), presence = emptyList())
    }
    fun selectServer(id: String) = action { selectServerInternal(id) }
    private suspend fun selectServerInternal(id: String) {
        navigation++
        if (mutable.value.detail?.server?.id != id) calls.leave()
        val detail = api.detail(id)
        mutable.value = mutable.value.copy(detail = detail, textChannel = null, messages = emptyList(), presence = emptyList())
        refreshCurrent(false)
    }
    fun refresh() = action { loadServers(); refreshCurrent(true) }
    private suspend fun refreshCurrent(includeDetail: Boolean) {
        val id = mutable.value.detail?.server?.id ?: return
        val epoch = navigation
        if (includeDetail) {
            val detail = try { api.detail(id) } catch (error: ApiException) {
                if (error.status == 403 || error.status == 404) {
                    calls.leave(); mutable.value = mutable.value.copy(detail = null, textChannel = null, messages = emptyList())
                    loadServers(); return
                }
                throw error
            }
            if (epoch != navigation) return
            val text = mutable.value.textChannel?.let { old -> detail.channels.firstOrNull { it.id == old.id } }
            mutable.value = mutable.value.copy(detail = detail, textChannel = text, messages = if (text == null) emptyList() else mutable.value.messages)
            val voiceId = calls.state.value.channelId
            if (voiceId != null && detail.channels.none { it.id == voiceId }) calls.leave()
        }
        val presence = api.presence(id)
        if (epoch != navigation) return
        mutable.value = mutable.value.copy(presence = presence)
        val textId = mutable.value.textChannel?.id ?: return
        val messages = api.messages(textId)
        if (epoch == navigation && mutable.value.textChannel?.id == textId) {
            val previous = mutable.value.messages
            val merged = (previous + messages).associateBy { it.id }.values.sortedBy { it.createdAt }.takeLast(500)
            mutable.value = mutable.value.copy(messages = merged)
        }
    }
    fun selectText(channel: Channel) = action {
        navigation++
        mutable.value = mutable.value.copy(textChannel = channel, messages = emptyList())
        val messages = api.messages(channel.id)
        mutable.value = mutable.value.copy(messages = messages, hasOlderMessages = messages.size == 50)
    }
    fun showChannels() { navigation++; mutable.value = mutable.value.copy(textChannel = null, messages = emptyList()) }
    fun loadOlder() = action {
        val snapshot = mutable.value
        val channel = snapshot.textChannel ?: return@action
        val first = snapshot.messages.firstOrNull() ?: return@action
        val epoch = navigation
        val older = api.messages(channel.id, first.id)
        if (epoch == navigation) mutable.value = mutable.value.copy(messages = (older + mutable.value.messages).distinctBy { it.id }, hasOlderMessages = older.size == 50)
    }
    fun sendMessage(content: String, onSent: () -> Unit) = action {
        val channel = mutable.value.textChannel ?: return@action
        val epoch = navigation
        api.sendMessage(channel.id, content)
        onSent()
        val messages = api.messages(channel.id)
        if (epoch == navigation) mutable.value = mutable.value.copy(messages = messages)
    }
    fun createServer(name: String) = action { loadServers(api.createServer(name).id) }
    fun joinServer(code: String) = action { loadServers(api.joinServer(code)) }
    fun invite() = action { mutable.value.detail?.let { mutable.value = mutable.value.copy(inviteCode = api.invite(it.server.id)) } }
    fun createChannel(request: ChannelRequest) = action {
        val serverId = mutable.value.detail?.server?.id ?: return@action
        api.createChannel(serverId, request)
        refreshCurrent(true)
    }
    fun joinVoice(channel: Channel) {
        val detail = mutable.value.detail ?: return
        if (detail.channels.none { it.id == channel.id && it.type == "voice" }) return
        try {
            ContextCompat.startForegroundService(app, Intent(app, VoiceService::class.java)
                .putExtra("channelId", channel.id).putExtra("channelName", channel.name)
                .putExtra("canSpeak", InputRules.canSpeak(channel, detail.server)))
        } catch (_: Exception) { mutable.value = mutable.value.copy(error = "Keep Pulse Room open and allow the microphone before joining.") }
    }
    fun clearError() { mutable.value = mutable.value.copy(error = null) }
    fun clearCodes() { mutable.value = mutable.value.copy(recoveryCode = null, inviteCode = null) }
    fun reportError(message: String) { mutable.value = mutable.value.copy(error = message) }
    private fun action(block: suspend () -> Unit) {
        if (mutable.value.busy) return
        viewModelScope.launch {
            mutable.value = mutable.value.copy(busy = true, error = null)
            try { block(); mutable.value = mutable.value.copy(online = true) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (error is ApiException && error.status == 401 && mutable.value.account != null) resetSession()
                mutable.value = mutable.value.copy(error = error.message ?: "Could not reach Pulse Room. Try again.")
            } finally { mutable.value = mutable.value.copy(busy = false, loading = false) }
        }
    }
}
