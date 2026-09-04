package com.pulseroom.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import android.content.ClipData
import android.os.PersistableBundle
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import kotlinx.coroutines.launch
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pulseroom.android.BuildConfig
import com.pulseroom.android.call.CallState
import com.pulseroom.android.call.VoiceMember
import com.pulseroom.android.data.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PulseRoot(model: PulseViewModel, onJoin: (Channel) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val call by model.calls.state.collectAsStateWithLifecycle()
    var serverMenu by remember { mutableStateOf(false) }
    var dialog by rememberSaveable { mutableStateOf<String?>(null) }
    var fullScreen by rememberSaveable { mutableStateOf(false) }
    var memberVolume by remember { mutableStateOf<VoiceMember?>(null) }
    var audioSettings by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error, call.error) {
        val error = state.error ?: call.error
        if (error != null) { snackbar.showSnackbar(error); model.clearError(); model.calls.clearError() }
    }
    LaunchedEffect(call.selectedShare) { if (call.selectedShare == null) fullScreen = false }
    BackHandler(enabled = fullScreen || state.textChannel != null) {
        if (fullScreen) fullScreen = false else model.showChannels()
    }
    Surface(Modifier.fillMaxSize(), color = Rail) {
        if (fullScreen && call.selectedShare != null) {
            StreamPlayer(call, model.calls, fullScreen = true, onFullscreen = { fullScreen = false }, modifier = Modifier.fillMaxSize())
        } else Scaffold(
            containerColor = Rail,
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                if (state.account != null) TopAppBar(
                    title = {
                        Column(Modifier.clickable { serverMenu = true }) {
                            Text(state.detail?.server?.name ?: "Pulse Room", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("Switch server", style = MaterialTheme.typography.labelSmall, color = Lavender)
                            DropdownMenu(serverMenu, { serverMenu = false }) {
                                state.servers.forEach { server -> DropdownMenuItem(text = { Text(server.name) }, onClick = { serverMenu = false; model.selectServer(server.id) }) }
                                HorizontalDivider()
                                DropdownMenuItem(text = { Text("Join with an invite") }, onClick = { serverMenu = false; dialog = "join" })
                                DropdownMenuItem(text = { Text("Create server") }, onClick = { serverMenu = false; dialog = "server" })
                            }
                        }
                    },
                    navigationIcon = {
                        if (state.textChannel != null) IconButton(onClick = model::showChannels) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Channels") }
                    },
                    actions = { IconButton(onClick = { dialog = "account" }) { Icon(Icons.Default.AccountCircle, "Your account") } },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Slate),
                )
            },
            bottomBar = {
                if (call.channelId != null) CallBar(call, model, onOpen = model::showChannels, onSettings = { audioSettings = true })
            },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
                if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (!state.online) Row(Modifier.fillMaxWidth().background(Raised).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Connection interrupted", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = model::refresh) { Text("Retry") }
                }
                when {
                    state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    state.account == null -> AuthScreen(state, model::authenticate)
                    state.detail == null -> EmptyServers(onJoin = { dialog = "join" }, onCreate = { dialog = "server" }, onRefresh = model::refresh)
                    state.textChannel != null -> ChatScreen(state, model)
                    else -> ChannelScreen(state, call, onJoin, model::selectText, onCreate = { dialog = "channel" }, onInvite = model::invite,
                        onFullscreen = { fullScreen = true }, model = model, onMember = { memberVolume = it })
                }
            }
        }
    }
    if (dialog == "server" || dialog == "join") TextEntryDialog(
        title = if (dialog == "server") "Create a server" else "Join your people",
        label = if (dialog == "server") "Server name" else "Invite code",
        onDismiss = { dialog = null }, onConfirm = { value -> if (dialog == "server") model.createServer(value) else model.joinServer(value); dialog = null },
    )
    if (dialog == "channel") state.detail?.let { detail -> CreateChannelDialog(detail, { dialog = null }) { model.createChannel(it); dialog = null } }
    if (dialog == "account") AlertDialog(onDismissRequest = { dialog = null }, title = { Text("Your account") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("${state.account?.displayName} (@${state.account?.username})")
            Text("Pulse Room ${BuildConfig.VERSION_NAME}")
            Text("Same account and servers on Android and Windows. Manage existing roles and channel permissions from the desktop app.", style = MaterialTheme.typography.bodyMedium)
        } }, confirmButton = { TextButton(onClick = { dialog = null }) { Text("Done") } },
        dismissButton = { TextButton(onClick = { model.logout(); dialog = null }) { Text("Sign out", color = MaterialTheme.colorScheme.error) } })
    val code = state.recoveryCode ?: state.inviteCode
    if (code != null) {
        val clipboard = LocalClipboard.current
        val clipboardScope = rememberCoroutineScope()
        AlertDialog(onDismissRequest = {}, title = { Text(if (state.recoveryCode != null) "Save your recovery code" else "Invite ready") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (state.recoveryCode != null) "Keep this privately. It is the only way to reset your password. It will not be saved on this device." else "Share this code with your friends. It expires in 24 hours and allows 10 joins.")
                Text(code, style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = { clipboardScope.launch {
                    val clip = ClipData.newPlainText("Pulse Room code", code)
                    clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
                    clipboard.setClipEntry(ClipEntry(clip))
                } }) { Text("Copy code") }
            } }, confirmButton = { TextButton(onClick = model::clearCodes) { Text("I saved it") } })
    }
    memberVolume?.let { member ->
        AlertDialog(onDismissRequest = { memberVolume = null }, title = { Text(member.name) },
            text = { Column { Text("Voice volume · ${(call.voiceVolumes[member.id] ?: 100f).toInt()}%")
                Slider(call.voiceVolumes[member.id] ?: 100f, { model.calls.setVoiceVolume(member.id, it) }, valueRange = 0f..200f)
                Text(if (member.muted) "Microphone muted" else "Microphone on", style = MaterialTheme.typography.bodySmall)
            } }, confirmButton = { TextButton(onClick = { memberVolume = null }) { Text("Done") } })
    }
    if (audioSettings) AlertDialog(onDismissRequest = { audioSettings = false }, title = { Text("Call audio") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Output device", style = MaterialTheme.typography.titleMedium)
            call.routes.forEach { route -> Row(Modifier.fillMaxWidth().clickable { model.calls.selectRoute(route) }.heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(call.route == route, onClick = { model.calls.selectRoute(route) }); Text(route)
            } }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Noise suppression", Modifier.weight(1f))
                Switch(call.noiseSuppression, model.calls::setNoiseSuppression, enabled = call.canSpeak && !call.muted)
            }
            Text("Your microphone", style = MaterialTheme.typography.titleMedium)
            Text(microphoneReport(call), style = MaterialTheme.typography.bodySmall)
            Text("Echo cancellation and automatic microphone level are enabled. A headset gives the best call and stream sound.", style = MaterialTheme.typography.bodySmall)
        } }, confirmButton = { TextButton(onClick = { audioSettings = false }) { Text("Done") } })
}

@Composable private fun EmptyServers(onJoin: () -> Unit, onCreate: () -> Unit, onRefresh: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Icon(Icons.Default.Forum, null, Modifier.size(48.dp), tint = Lavender)
        Text("Make yourself at home", style = MaterialTheme.typography.headlineLarge)
        Text("Join your friends' server with an invite, or create a separate place for your group.")
        Button(onJoin, Modifier.fillMaxWidth()) { Text("Join with an invite") }
        OutlinedButton(onCreate, Modifier.fillMaxWidth()) { Text("Create server") }
        TextButton(onRefresh) { Text("Refresh servers") }
    }
}

@Composable private fun ChannelScreen(state: AppState, call: CallState, onJoin: (Channel) -> Unit, onText: (Channel) -> Unit,
    onCreate: () -> Unit, onInvite: () -> Unit, onFullscreen: () -> Unit, model: PulseViewModel, onMember: (VoiceMember) -> Unit) {
    val detail = state.detail ?: return
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp)) {
        if (call.shares.isNotEmpty()) item("stream") {
            StreamPlayer(call, model.calls, false, onFullscreen, Modifier.fillMaxWidth().height(260.dp))
        }
        item("intro") {
            Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("Drop into a room", style = MaterialTheme.typography.titleLarge); Text("${detail.members.size} members", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (detail.server.canManage) {
                    IconButton(onClick = onInvite) { Icon(Icons.Default.PersonAdd, "Create invite") }
                    IconButton(onClick = onCreate) { Icon(Icons.Default.Add, "Create channel") }
                }
            }
        }
        items(detail.channels.filter { it.type == "voice" }, key = { it.id }) { channel ->
            val joined = call.channelId == channel.id
            val occupants = state.presence.firstOrNull { it.roomId == channel.id }?.occupants.orEmpty()
            Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(16.dp))
                .background(if (joined) Raised else Slate).fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { if (!joined) onJoin(channel) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (channel.isPrivate) Icons.Default.Lock else Icons.Default.Headphones, null, tint = if (joined) Speaking else Lavender)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(channel.name, fontWeight = FontWeight.SemiBold)
                        Text(if (joined) call.status else if (occupants.isEmpty()) "Quiet for now · tap to join" else "${occupants.size} in call · tap to join", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (joined) Icon(Icons.Default.Check, "Connected", tint = Speaking)
                }
                if (joined) call.members.forEach { member -> MemberRow(member, { if (!member.local) onMember(member) }) }
                else occupants.forEach { occupant -> Row(Modifier.padding(start = 52.dp, end = 16.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(occupant.name, false, 28); Text(occupant.name, Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodyMedium)
                } }
            }
        }
        item("text-heading") { Text("Text channels", Modifier.padding(start = 20.dp, top = 24.dp, bottom = 8.dp), style = MaterialTheme.typography.titleMedium) }
        items(detail.channels.filter { it.type == "text" }, key = { it.id }) { channel ->
            Row(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { onText(channel) }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (channel.isPrivate) Icons.Default.Lock else Icons.Default.Tag, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(channel.name, Modifier.padding(start = 12.dp), fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable private fun MemberRow(member: VoiceMember, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = !member.local, onClick = onClick).padding(start = 48.dp, end = 16.dp, top = 4.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(member.name, member.speaking && !member.muted, 34)
        Text(member.name + if (member.local) " (you)" else "", Modifier.weight(1f).padding(horizontal = 10.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (member.muted) Icon(Icons.Default.MicOff, "Microphone muted", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable fun Avatar(name: String, speaking: Boolean = false, size: Int = 36) {
    Box(Modifier.size(size.dp).border(if (speaking) 2.dp else 0.dp, if (speaking) Speaking else Raised, CircleShape).padding(3.dp).clip(CircleShape).background(Raised), contentAlignment = Alignment.Center) {
        Text(name.take(1).uppercase(), color = Lavender, fontWeight = FontWeight.Bold)
    }
}

@Composable private fun CallBar(call: CallState, model: PulseViewModel, onOpen: () -> Unit, onSettings: () -> Unit) {
    Surface(color = Slate, tonalElevation = 0.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth().clickable(onClick = onOpen), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.GraphicEq, null, Modifier.size(18.dp), tint = Speaking)
                Text("${call.status} · ${call.channelName}", Modifier.weight(1f).padding(start = 8.dp), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconButton(onSettings) { Icon(Icons.Default.Tune, "Audio settings") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                if (call.canSpeak) {
                    FilledTonalIconButton(onClick = model.calls::toggleMute, enabled = call.status == "Connected") { Icon(if (call.muted) Icons.Default.MicOff else Icons.Default.Mic, if (call.muted) "Unmute" else "Mute") }
                } else {
                    // A button that does nothing reads as a broken microphone.
                    AssistChip(onClick = onSettings, label = { Text("Listen only") },
                        leadingIcon = { Icon(Icons.Default.MicOff, null, Modifier.size(18.dp)) })
                }
                FilledTonalIconButton(onClick = model.calls::toggleDeafen) { Icon(if (call.deafened) Icons.Default.HeadsetOff else Icons.Default.Headphones, if (call.deafened) "Undeafen" else "Deafen") }
                Button(onClick = { model.calls.leave() }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Icon(Icons.Default.CallEnd, null); Text("Leave", Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

/**
 * Says whether the room is actually hearing this phone. Android can hand an
 * application a microphone that only ever delivers silence, and without this the
 * only symptom is friends saying they cannot hear you.
 */
internal fun microphoneReport(call: CallState): String = when {
    !call.canSpeak -> "This channel is listen only: an administrator can allow speaking in the channel settings."
    call.status != "Connected" -> "Waiting for the call to connect."
    call.muted -> "Muted. Tap the microphone in the call bar to speak."
    call.heardSinceUnmute -> "Working: the room has heard you since you unmuted."
    else -> "Say something. If this line does not change, Android is giving Pulse Room no sound. Check the microphone permission for Pulse Room, and on Xiaomi also Autostart and battery restrictions."
}
