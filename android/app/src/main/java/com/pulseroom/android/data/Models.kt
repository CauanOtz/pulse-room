package com.pulseroom.android.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class Account(val id: String, val username: String, val displayName: String)
@Serializable data class Session(val token: String, val user: Account, val recoveryCode: String? = null)
@Serializable data class Community(val id: String, val name: String, val role: String) {
    val canManage: Boolean get() = role == "owner" || role == "admin"
}
@Serializable data class Member(val id: String, val username: String, val displayName: String, val role: String)
@Serializable data class Channel(
    val id: String, val serverId: String, val name: String, val type: String,
    @SerialName("private") val isPrivate: Boolean = false,
    val memberIds: List<String> = emptyList(),
    val allowSpeak: Boolean = true, val allowShare: Boolean = true, val readOnly: Boolean = false,
)
@Serializable data class CommunityDetail(val server: Community, val channels: List<Channel>, val members: List<Member>)
@Serializable data class Message(
    val id: String, val channelId: String, val authorId: String, val authorName: String,
    val content: String, val createdAt: String,
)
@Serializable data class Occupant(val identity: String, val name: String)
@Serializable data class Occupancy(val roomId: String, val occupants: List<Occupant>)
@Serializable data class RoomToken(val serverUrl: String, val token: String)
@Serializable data class ServersResponse(val servers: List<Community>)
@Serializable data class MessagesResponse(val messages: List<Message>)
@Serializable data class PresenceResponse(val rooms: List<Occupancy>)
@Serializable data class UserResponse(val user: Account)
@Serializable data class JoinResponse(val serverId: String)
@Serializable data class CodeResponse(val code: String)
@Serializable data class RecoveryResponse(val recoveryCode: String)
@Serializable data class IdResponse(val id: String)
@Serializable data class LoginRequest(val username: String, val password: String)
@Serializable data class RegisterRequest(val username: String, val displayName: String, val password: String)
@Serializable data class RecoverRequest(val username: String, val recoveryCode: String, val password: String)
@Serializable data class NameRequest(val name: String)
@Serializable data class CodeRequest(val code: String)
@Serializable data class MessageRequest(val content: String)
@Serializable data class InviteRequest(val maxUses: Int = 10, val hours: Int = 24)
@Serializable data class ChannelRequest(
    val name: String, val type: String,
    @SerialName("private") val isPrivate: Boolean = false,
    val memberIds: List<String> = emptyList(),
    val allowSpeak: Boolean = true, val allowShare: Boolean = true, val readOnly: Boolean = false,
)

object InputRules {
    fun validRegistration(username: String, displayName: String, password: String): Boolean =
        username.matches(Regex("[a-zA-Z0-9_]{3,32}")) && displayName.trim().length in 1..40 && password.length in 12..128
    fun canWrite(channel: Channel, community: Community): Boolean =
        channel.type == "text" && (!channel.readOnly || community.canManage)
    fun canSpeak(channel: Channel, community: Community): Boolean =
        channel.type == "voice" && (channel.allowSpeak || community.canManage)
}
