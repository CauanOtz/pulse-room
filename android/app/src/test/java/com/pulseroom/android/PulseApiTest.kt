package com.pulseroom.android

import com.pulseroom.android.data.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class PulseApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PulseApi
    @Before fun setUp() { server = MockWebServer(); server.start(); api = PulseApi(server.url("/").toString()) }
    @After fun tearDown() { server.shutdown() }
    @Test fun loginDoesNotSendExistingToken() = runTest {
        api.token = "old-token"
        server.enqueue(MockResponse().setBody("""{"token":"new-token","user":{"id":"u","username":"alex","displayName":"Alex"}}"""))
        assertEquals("new-token", api.login(" alex ", "password").token)
        val request = server.takeRequest()
        assertEquals("/api/auth/login", request.path)
        assertNull(request.getHeader("Authorization"))
        assertEquals("""{"username":"alex","password":"password"}""", request.body.readUtf8())
    }
    @Test fun roomTokenUsesSessionAndDoesNotSendEmptyJson() = runTest {
        api.token = "session-token"
        server.enqueue(MockResponse().setBody("""{"serverUrl":"wss://voice.example.com","token":"scoped-jwt"}"""))
        assertEquals("scoped-jwt", api.roomToken("channel-1").token)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/rooms/channel-1/token", request.path)
        assertEquals("Bearer session-token", request.getHeader("Authorization"))
        assertNull(request.getHeader("Content-Type"))
        assertEquals(0L, request.bodySize)
    }
    @Test fun unauthenticatedRequestsNeverReachServer() = runTest {
        try { api.servers(); fail("Expected authentication failure") }
        catch (error: ApiException) { assertEquals(401, error.status) }
        assertEquals(0, server.requestCount)
    }
    @Test fun forbiddenChannelIsNotReplacedByAnUnscopedRoom() = runTest {
        api.token = "session-token"
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Access denied"}"""))
        try { api.roomToken("private"); fail("Expected denied access") }
        catch (error: ApiException) { assertEquals(403, error.status); assertEquals("Access denied", error.message) }
        assertEquals(1, server.requestCount)
    }
    @Test fun rejectsIdentifiersThatEscapeTheRoute() = runTest {
        api.token = "token"
        try { api.messages("../auth/me"); fail("Expected identifier validation") }
        catch (_: IllegalArgumentException) { assertEquals(0, server.requestCount) }
    }
    @Test fun createPrivateChannelMatchesBackendContract() = runTest {
        api.token = "token"
        server.enqueue(MockResponse().setBody("""{"id":"channel-1"}"""))
        val input = ChannelRequest("Private", "voice", true, listOf("member-1"), false, true, false)
        api.createChannel("server-1", input)
        val request = server.takeRequest()
        val expected = """{"name":"Private","type":"voice","private":true,"memberIds":["member-1"],"allowSpeak":false,"allowShare":true,"readOnly":false}"""
        assertEquals(Json.parseToJsonElement(expected), Json.parseToJsonElement(request.body.readUtf8()))
    }
    @Test fun logoutUsesSessionAndNoJsonContentType() = runTest {
        api.token = "token"
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.logout()
        val request = server.takeRequest()
        assertEquals("/api/auth/logout", request.path)
        assertNull(request.getHeader("Content-Type"))
    }
    @Test fun messagesPaginateUsingAnId() = runTest {
        api.token = "token"
        server.enqueue(MockResponse().setBody("""{"messages":[]}"""))
        assertTrue(api.messages("channel-1", "message-2").isEmpty())
        assertEquals("/api/channels/channel-1/messages?before=message-2", server.takeRequest().path)
    }
    @Test fun errorsDoNotExposeHtmlResponseBodies() = runTest {
        api.token = "token"
        server.enqueue(MockResponse().setResponseCode(502).setBody("<html>upstream internal details</html>"))
        try { api.servers(); fail("Expected server failure") }
        catch (error: ApiException) { assertFalse(error.message!!.contains("internal details")) }
    }
    @Test fun detailPreservesPrivateChannelAndMembership() = runTest {
        api.token = "token"
        server.enqueue(MockResponse().setBody("""{"server":{"id":"s","name":"Us","role":"member"},"channels":[{"id":"c","serverId":"s","name":"Private","type":"voice","private":true,"memberIds":["u"],"allowSpeak":false,"allowShare":false,"readOnly":false}],"members":[]}"""))
        val detail = api.detail("s")
        assertTrue(detail.channels.single().isPrivate)
        assertFalse(InputRules.canSpeak(detail.channels.single(), detail.server))
    }
}
