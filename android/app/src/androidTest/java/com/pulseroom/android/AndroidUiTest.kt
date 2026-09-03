package com.pulseroom.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.pulseroom.android.data.*
import com.pulseroom.android.ui.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun loginRequiresCredentialsAndSubmitsValues() {
        var received = emptyList<String>()
        compose.setContent { PulseTheme { AuthScreen(AppState(loading = false)) { mode, user, _, password, _ -> received = listOf(mode, user, password) } } }
        compose.onAllNodesWithText("Sign in").onLast().assertIsNotEnabled()
        compose.onNodeWithText("Username").performTextInput("alex")
        compose.onNodeWithText("Password").performTextInput("long-password")
        compose.onAllNodesWithText("Sign in").onLast().performScrollTo().performClick()
        assertEquals(listOf("login", "alex", "long-password"), received)
    }
    @Test fun registrationShowsDisplayNameAndValidatesPasswordLength() {
        compose.setContent { PulseTheme { AuthScreen(AppState(loading = false)) { _, _, _, _, _ -> } } }
        compose.onNodeWithText("Create account").performClick()
        compose.onNodeWithText("Display name").assertExists()
        compose.onNodeWithText("Username").performTextInput("alex")
        compose.onNodeWithText("Display name").performTextInput("Alex")
        compose.onNodeWithText("Password").performTextInput("short")
        compose.onAllNodesWithText("Create account").onLast().assertIsNotEnabled()
    }
    @Test fun privateChannelIncludesOnlySelectedMembers() {
        val detail = CommunityDetail(Community("s", "Friends", "owner"), emptyList(), listOf(Member("u", "alex", "Alex", "member")))
        var created: ChannelRequest? = null
        compose.setContent { PulseTheme { CreateChannelDialog(detail, {}) { created = it } } }
        compose.onNodeWithText("Channel name").performTextInput("Our room")
        compose.onAllNodes(isToggleable()).onFirst().performClick()
        compose.onNodeWithText("Alex").assertExists()
        compose.onAllNodes(isToggleable()).onLast().performClick()
        compose.onNodeWithText("Create", useUnmergedTree = true).performClick()
        assertTrue(created!!.isPrivate)
        assertEquals(listOf("u"), created!!.memberIds)
    }
    @Test fun encryptedVaultSurvivesReopenAndCanBeCleared() {
        val context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        val vault = SessionVault(context)
        try {
            vault.save("instrumentation-only-session")
            assertEquals("instrumentation-only-session", SessionVault(context).read())
            val raw = context.getSharedPreferences("session", 0).getString("token", "")!!
            assertFalse(raw.contains("instrumentation-only-session"))
            vault.clear()
            assertNull(vault.read())
        } finally { vault.clear() }
    }
}
