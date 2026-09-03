package com.pulseroom.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pulseroom.android.data.InputRules
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable fun ChatScreen(state: AppState, model: PulseViewModel) {
    val channel = state.textChannel ?: return
    val community = state.detail?.server ?: return
    var draft by rememberSaveable(channel.id) { mutableStateOf("") }
    val scroll = rememberLazyListState()
    Column(Modifier.fillMaxSize()) {
        Text("# ${channel.name}", Modifier.padding(horizontal = 20.dp, vertical = 12.dp), style = MaterialTheme.typography.titleLarge)
        if (state.messages.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("Start the conversation.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = scroll, reverseLayout = true, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(state.messages.asReversed(), key = { it.id }) { message ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Avatar(message.authorName)
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(message.authorName, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            Text(remember(message.createdAt) { runCatching { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(message.createdAt)) }.getOrDefault("") }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        SelectionContainer { Text(message.content, style = MaterialTheme.typography.bodyLarge) }
                    }
                }
            }
            if (state.hasOlderMessages) item { TextButton(model::loadOlder, enabled = !state.busy) { Text("Load earlier messages") } }
        }
        if (InputRules.canWrite(channel, community)) Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(draft, { if (it.length <= 2000) draft = it }, Modifier.weight(1f), placeholder = { Text("Message #${channel.name}") }, maxLines = 4, enabled = !state.busy)
            IconButton(onClick = { model.sendMessage(draft) { draft = "" } }, enabled = draft.isNotBlank() && !state.busy, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Filled.Send, "Send message", tint = Lavender) }
        } else Text("This channel is read-only.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
