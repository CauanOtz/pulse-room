# Private communities

## Boundaries and patterns

- `AccountService`: password verification, opaque sessions and one-time recovery codes.
- `CommunityService`: relational repository operations and authorization policy. Mutations lock the community and run in a transaction, so role checks and writes are one unit of work.
- `Database`: a small query/transaction port backed by a bounded PostgreSQL pool; tests use actual PostgreSQL via PGlite (WASM).
- `VoiceAccessService`: reconciles LiveKit participants with current sessions, memberships and channel permissions.
- `CommunityClient`: authenticated HTTP adapter. UI controls are conveniences, never authorization boundaries.
- `SessionVault`: Electron adapter using Windows DPAPI through `safeStorage`. Passwords are never persisted. If encryption is unavailable, the token stays in memory only.

## Permission model

| Operation                                  | Owner  | Administrator | Member                      |
| ------------------------------------------ | ------ | ------------- | --------------------------- |
| View server / public channels              | Yes    | Yes           | Yes                         |
| View private channels                      | Always | Always        | Explicit channel allow-list |
| Speak / share / send messages              | Always | Always        | Per-channel permission      |
| Create/edit/delete channels, rename server | Yes    | Yes           | No                          |
| Create/revoke invitations                  | Yes    | Yes           | No                          |
| Remove regular members                     | Yes    | Yes           | Self only                   |
| Remove administrators / change roles       | Yes    | No            | No                          |
| Transfer ownership / delete server         | Yes    | No            | No                          |
| Delete messages                            | All    | All           | Own messages                |

Invites expire after 1–168 hours and permit 1–100 uses. Codes contain 256 random bits and only their hashes are stored. Joining consumes a use atomically; attempting to reuse a valid invite when already a member does not consume another use. Removing a member is not a ban: a new valid invite can grant access again. Private channel grants are deleted when a member leaves.

Passwords use salted scrypt with N=32768, r=8, p=3 (OWASP's 32 MiB profile), with bounded hashing concurrency and IP rate limiting. Passwords are 12–128 characters. Sessions are random 256-bit opaque tokens with a 30-day absolute lifetime, stored as hashes in PostgreSQL. Logout invalidates the current session; password changes invalidate other sessions; recovery invalidates all sessions and rotates the recovery code. There is no email delivery or email recovery service. Losing both the password and the recovery code requires operator intervention.

## Live voice authorization

Clients request a token for a channel UUID. The API resolves membership and channel access, names the LiveKit room `channel_<uuid>`, and takes the participant name/identity from the authenticated account. The token limits publish sources separately to microphone and screen video/audio. Arbitrary data publishing is disabled. Presence is filtered to the caller's accessible voice channels in the requested server.

LiveKit self-hosted does not invalidate previously issued tokens on removal. Tokens therefore have a 60-second initial join lifetime. Every 10 seconds, the backend checks current participants against sessions and memberships and removes unauthorized participants / updates publish permissions. **Revocation is not instantaneous**: in normal operation it takes up to one reconciliation interval, plus network time. A failed admin connection can delay enforcement; monitor the `Voice access reconciliation failed` log. Existing anonymous rooms are closed by this reconciler after rollout. A client can keep talking in a voice channel while viewing a text channel; switching servers disconnects the previous voice room.

## Persistence and deployment

1. Create a PostgreSQL database with a persistent volume. Connect the backend using its private `DATABASE_URL`; do not place that URL in renderer variables.
2. Keep the three configured `SELF_HOSTED_LIVEKIT_*` variables on Railway. `APP_INVITE_SECRET` may be removed; it is ignored for authorization.
3. Run `npm run verify`. Build the installer with `VITE_API_URL` only; `VITE_ROOM_ACCESS_CODE` is obsolete and must not be bundled.
4. Publish the installer and coordinate the backend cutover. Old clients cannot authenticate afterward. Users must update, create accounts, save recovery codes, create servers and issue invitations.
5. On startup the backend runs additive schema migrations under a PostgreSQL advisory lock. `/health` checks database connectivity. The service fails closed without a configured/available database.
6. Enable Railway database-volume backups or schedule encrypted `pg_dump` backups outside the database volume. Test restoration into a separate database. A single volume is not a backup. Database provisioning and backup retention can incur extra Railway charges; no fixed monthly total is promised.

Do not downgrade to the old anonymous API while private community data is in use. Prefer rolling forward or disabling new joins during a rollback. No production accounts or private servers are automatically created by deployment.

## Limits and validation

The small-group defaults cap ownership at 10 servers, server membership at 100 people, channels at 50 per server and messages at 2,000 characters. Chat history uses indexed, 50-message pagination. The first implementation refreshes chat and room presence every 3 seconds and membership lists every 5 seconds; it does not use WebSockets for text. It does not support attachments, custom permission roles, bans or message edits.

Automated checks cover registration/login/recovery/logout, sessions, server isolation and ID guessing, private channels, publish grants, role hierarchy, invite expiry/revocation/concurrent redemption, text history and active voice revocation. The Electron workflow uses an isolated temporary user-data directory, local API and test database, exercises two separate servers and multiple accounts, and verifies encrypted session restoration. Existing audio and screen-capture tests remain in the verification suite. Hardware quality across two real computers must still be checked after rollout; automated API tests cannot establish perceived audio quality.
