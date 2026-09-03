package com.pulseroom.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : IOException(message)

/** REST adapter: no LiveKit credentials or shared access codes belong in a client. */
class PulseApi(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).callTimeout(25, TimeUnit.SECONDS)
        .followRedirects(false).build(),
) {
    internal val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    @Volatile var token: String? = null

    internal suspend fun request(method: String, path: String, body: String? = null, authenticated: Boolean = true): String =
        withContext(Dispatchers.IO) {
            val request = Request.Builder().url(baseUrl.trimEnd('/') + path)
            if (authenticated) {
                request.header("Authorization", "Bearer ${token ?: throw ApiException(401, "Sign in to continue.")}")
            }
            request.header("Accept", "application/json")
            // Fastify rejects a JSON content type with an empty body.
            val payload = body?.toRequestBody("application/json; charset=utf-8".toMediaType())
                ?: if (method == "POST" || method == "PATCH") ByteArray(0).toRequestBody(null) else null
            client.newCall(request.method(method, payload).build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val message = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                    throw ApiException(response.code, message ?: "Server unavailable (${response.code}). Try again.")
                }
                text
            }
        }

    private fun id(value: String): String {
        require(value.matches(Regex("[a-zA-Z0-9_-]+"))) { "Invalid identifier" }
        return value
    }
    suspend fun login(username: String, password: String): Session = json.decodeFromString(
        request("POST", "/api/auth/login", json.encodeToString(LoginRequest(username.trim(), password)), false))
    suspend fun register(username: String, displayName: String, password: String): Session = json.decodeFromString(
        request("POST", "/api/auth/register", json.encodeToString(RegisterRequest(username.trim(), displayName.trim(), password)), false))
    suspend fun recover(username: String, code: String, password: String): RecoveryResponse = json.decodeFromString(
        request("POST", "/api/auth/recover", json.encodeToString(RecoverRequest(username.trim(), code.trim(), password)), false))
    suspend fun me(): Account = json.decodeFromString<UserResponse>(request("GET", "/api/auth/me")).user
    suspend fun logout() { request("POST", "/api/auth/logout") }
    suspend fun servers(): List<Community> = json.decodeFromString<ServersResponse>(request("GET", "/api/servers")).servers
    suspend fun detail(serverId: String): CommunityDetail = json.decodeFromString(request("GET", "/api/servers/${id(serverId)}"))
    suspend fun createServer(name: String): Community = json.decodeFromString(request("POST", "/api/servers", json.encodeToString(NameRequest(name.trim()))))
    suspend fun joinServer(code: String): String = json.decodeFromString<JoinResponse>(request("POST", "/api/invites/join", json.encodeToString(CodeRequest(code.trim())))).serverId
    suspend fun invite(serverId: String): String = json.decodeFromString<CodeResponse>(request("POST", "/api/servers/${id(serverId)}/invites", json.encodeToString(InviteRequest()))).code
    suspend fun createChannel(serverId: String, input: ChannelRequest): String = json.decodeFromString<IdResponse>(request("POST", "/api/servers/${id(serverId)}/channels", json.encodeToString(input))).id
    suspend fun messages(channelId: String, before: String? = null): List<Message> = json.decodeFromString<MessagesResponse>(
        request("GET", "/api/channels/${id(channelId)}/messages" + (before?.let { "?before=${id(it)}" } ?: ""))).messages
    suspend fun sendMessage(channelId: String, content: String) { request("POST", "/api/channels/${id(channelId)}/messages", json.encodeToString(MessageRequest(content.trim()))) }
    suspend fun presence(serverId: String): List<Occupancy> = json.decodeFromString<PresenceResponse>(request("GET", "/api/presence?serverId=${id(serverId)}")).rooms
    suspend fun roomToken(channelId: String): RoomToken = json.decodeFromString(request("POST", "/api/rooms/${id(channelId)}/token"))
}
