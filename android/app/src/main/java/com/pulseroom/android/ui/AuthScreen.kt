package com.pulseroom.android.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.pulseroom.android.BuildConfig
import com.pulseroom.android.R
import com.pulseroom.android.data.InputRules

@Composable fun AuthScreen(state: AppState, onSubmit: (String, String, String, String, String) -> Unit) {
    var mode by rememberSaveable { mutableStateOf("login") }
    var username by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }
    // Secrets intentionally do not enter the saved-instance-state bundle.
    var password by remember { mutableStateOf("") }
    var recovery by remember { mutableStateOf("") }
    val valid = when (mode) {
        "register" -> InputRules.validRegistration(username.trim(), displayName, password)
        "recover" -> username.isNotBlank() && recovery.isNotBlank() && password.length in 12..128
        else -> username.isNotBlank() && password.isNotBlank()
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Image(painterResource(R.drawable.ic_pulse), "Pulse Room", Modifier.size(64.dp))
            Text("Your people.\nOne room away.", style = MaterialTheme.typography.headlineLarge)
            Text("Use your Pulse Room account from PC, or create one to join your friends.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = mode == "login", onClick = { mode = "login"; password = ""; recovery = "" }, label = { Text("Sign in") })
                FilterChip(selected = mode == "register", onClick = { mode = "register"; password = ""; recovery = "" }, label = { Text("Create account") })
            }
            if (mode == "recover") Text("Recover your account", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(username, { if (it.length <= 32) username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
            if (mode == "register") OutlinedTextField(displayName, { if (it.length <= 40) displayName = it }, label = { Text("Display name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (mode == "recover") OutlinedTextField(recovery, { recovery = it }, label = { Text("Recovery code") }, singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation())
            OutlinedTextField(password, { if (it.length <= 128) password = it }, label = { Text(if (mode == "recover") "New password" else "Password") },
                modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                supportingText = { if (mode != "login") Text("At least 12 characters. Keep your recovery code safe.") })
            Button(onClick = { onSubmit(mode, username, displayName, password, recovery); password = ""; recovery = "" }, enabled = valid && !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Text(if (state.busy) "Please wait…" else when (mode) { "register" -> "Create account"; "recover" -> "Reset password"; else -> "Sign in" })
            }
            TextButton(onClick = { mode = if (mode == "recover") "login" else "recover"; password = "" }) { Text(if (mode == "recover") "Back to sign in" else "Forgot password?") }
            Text("Pulse Room ${BuildConfig.VERSION_NAME} · Android", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
