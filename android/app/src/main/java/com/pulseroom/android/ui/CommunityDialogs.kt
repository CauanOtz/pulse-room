package com.pulseroom.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pulseroom.android.data.ChannelRequest
import com.pulseroom.android.data.CommunityDetail

@Composable fun TextEntryDialog(title: String, label: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var value by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = {
        OutlinedTextField(value, { if (it.length <= 100) value = it }, label = { Text(label) }, singleLine = true)
    }, confirmButton = { TextButton(onClick = { onConfirm(value.trim()) }, enabled = value.isNotBlank()) { Text("Continue") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } })
}

@Composable fun CreateChannelDialog(detail: CommunityDetail, onDismiss: () -> Unit, onConfirm: (ChannelRequest) -> Unit) {
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("voice") }
    var privateChannel by remember { mutableStateOf(false) }
    var members by remember { mutableStateOf(setOf<String>()) }
    var allowSpeak by remember { mutableStateOf(true) }
    var readOnly by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Create channel") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(name, { if (it.length <= 60) name = it }, label = { Text("Channel name") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(type == "voice", { type = "voice" }, label = { Text("Voice") })
                FilterChip(type == "text", { type = "text" }, label = { Text("Text") })
            }
            Row(verticalAlignment = Alignment.CenterVertically) { Text("Private channel", Modifier.weight(1f)); Switch(privateChannel, { privateChannel = it }) }
            if (type == "voice") Row(verticalAlignment = Alignment.CenterVertically) { Text("Members can speak", Modifier.weight(1f)); Switch(allowSpeak, { allowSpeak = it }) }
            else Row(verticalAlignment = Alignment.CenterVertically) { Text("Read-only for members", Modifier.weight(1f)); Switch(readOnly, { readOnly = it }) }
            if (privateChannel) {
                Text("Owners and admins always have access. Select other members:", style = MaterialTheme.typography.bodySmall)
                detail.members.filter { it.role == "member" }.forEach { member ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(member.id in members, { checked -> members = if (checked) members + member.id else members - member.id })
                        Text(member.displayName)
                    }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = { onConfirm(ChannelRequest(name.trim(), type, privateChannel, members.toList(), allowSpeak, true, readOnly)) }, enabled = name.isNotBlank()) { Text("Create") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } })
}
