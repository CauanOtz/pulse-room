# Pulse Room

Pulse Room is a Windows desktop voice room built for small groups that want to share an entire monitor with stereo system audio. Voice and screen audio use separate WebRTC tracks so microphone processing never damages game, film, or music audio.

## What works today

- Electron desktop shell with an isolated preload bridge and restricted permissions.
- Full-monitor selection using Electron `desktopCapturer`.
- Windows system audio capture using Chromium loopback audio.
- LiveKit voice rooms with adaptive streaming and dynacast.
- Processed microphone track with echo cancellation, browser noise suppression, an adjustable noise gate, automatic gain control, manual gain, and a limiter.
- Stereo screen audio at up to 128 kbps, separate from the microphone.
- 720p30, 1080p30, and 1080p60 screen quality strategies.
- The room drawn as participant tiles, with live screens among them, each with its own audio level and full screen.
- Stream quality changed mid-broadcast from the caret beside the share button.
- A voice panel in the sidebar carrying go live, disconnect, mute, deafen, device pickers, and settings.
- Per-participant volume and local mute from a right click in the sidebar, boosted up to 200%, plus a live microphone meter and selectable input/output devices.
- Voice channels in the sidebar that join on a click and show who is in each one, arrival and departure cues, and a demo adapter that runs without cloud credentials.
- A small Fastify token service suitable for Railway.
- Calls that survive the window: closing it leaves Pulse Room in the Windows tray.
- SemVer application versions, NSIS installer generation, and automatic updates from GitHub Releases.
- Individual accounts, encrypted desktop sessions, password recovery codes and session revocation.
- Private servers with expiring, limited-use invitations; owner, administrator and member roles.
- Text and voice channel creation, editing and deletion, private channel membership, speaking/sharing/posting permissions.
- Persistent text chat with history pagination and author/administrator deletion.
- Server-scoped presence, authenticated voice tokens and continuous live permission enforcement.

## Local development

Requirements:

- Windows 10 version 2004 or newer.
- Node.js 24.
- PostgreSQL for accounts, permissions and message persistence.
- A LiveKit Cloud project or self-hosted LiveKit deployment for real multi-user calls.

Install and run the desktop app in demo mode:

```powershell
npm install
npm run dev
```

Demo mode exercises the interface and local screen capture. Set `VITE_API_URL` to enable the account-based application. The shared room access code is no longer used or accepted.

## Real calls

1. Copy `.env.example` to `.env.local`.
2. Add PostgreSQL and set `DATABASE_URL` plus the LiveKit URL, API key and API secret on Railway. Use the private database network. Migrations run transactionally at startup; the service refuses to start without a database.
3. Deploy this repository to Railway. `railway.json` builds and starts only the token service.
4. Set these values before building the desktop app:

```powershell
$env:VITE_API_URL = 'https://your-api.up.railway.app'
npm run package:windows
```

Never include `LIVEKIT_API_SECRET` in the desktop build. It belongs only on Railway.

Each person creates their own account and saves their recovery code. Create separate servers for friends and family, then share each server's invitation only with its intended members. There is no public server directory. Server owners/admins manage invites and channels from the server heading; only the owner can assign administrators, transfer ownership or delete the server.

See [docs/COMMUNITIES.md](docs/COMMUNITIES.md) for deployment, permissions, backups and migration limitations. **Old anonymous desktop clients cannot join after deploying the account-based backend. Coordinate the backend rollout with the new installer.**

To use a self-hosted server without deleting the LiveKit Cloud configuration,
set `SELF_HOSTED_LIVEKIT_URL`, `SELF_HOSTED_LIVEKIT_API_KEY`, and
`SELF_HOSTED_LIVEKIT_API_SECRET` on Railway. Removing those three variables
switches the token service back to LiveKit Cloud.

## Verification

```powershell
npm run verify
```

This command runs strict TypeScript checking, unit tests, API integration tests, a production build, and a Playwright test that launches the real Electron process through the secured preload bridge.

Windows system audio is a physical device integration and cannot be validated in a headless CI runner. Before publishing a release, complete the short hardware checklist in [docs/RELEASES.md](docs/RELEASES.md).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the boundaries and patterns used by the application. The design favors explicit ports and adapters over framework coupling.

## Versioning and updates

Releases use semantic versioning:

- Patch: fixes with no user-facing contract change, such as `0.1.1`.
- Minor: backward-compatible features, such as `0.2.0`.
- Major: incompatible changes, such as `1.0.0`.

The tag must exactly match the version in `package.json`. Pushing a tag such as `v0.1.1` starts the Windows release workflow. It tests the application, builds the installer, publishes `latest.yml`, and creates a GitHub Release. Installed clients then discover the release automatically.
