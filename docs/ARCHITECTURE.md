# Architecture

## Runtime boundaries

```text
Electron main process
  ScreenCaptureService       owns source selection and loopback permission
  UpdateService              owns update discovery, download, and install
          │
          │ typed, isolated IPC
          ▼
React renderer
  ConferenceController       coordinates user actions
          │
          ▼
  ConferenceGateway          application port
      ├── DemoConferenceGateway
      └── LiveKitConferenceGateway
              │
              ├── MicrophoneTrackFactory
              └── LiveKit SFU

Railway token server
  TokenService               issues short-lived, room-scoped credentials
```

## Patterns

- **Ports and adapters:** `ConferenceGateway` keeps React and use cases independent from LiveKit. Demo and production transports are interchangeable.
- **Facade/controller:** `ConferenceController` presents complete user actions such as joining, muting, and sharing instead of exposing transport details to components.
- **Factory:** `ConferenceGatewayFactory` selects demo or production infrastructure from the build environment.
- **Repository:** `SettingsRepository` isolates persistence and supports future migration from local storage to a server profile.
- **Strategy:** named screen quality presets encapsulate the bitrate, resolution, and frame-rate trade-off.
- **Observer:** gateways publish immutable snapshots through subscriptions compatible with React's `useSyncExternalStore`.
- **Service layer:** screen capture, microphone processing, token issuance, and updates each have a single runtime owner.

Patterns are applied only at volatile boundaries. Presentational components remain simple functions.

## Audio pipeline

The microphone is captured at 48 kHz and requests browser-native echo cancellation, noise suppression, and automatic gain control. A Web Audio gain node applies the user's chosen level and a dynamics compressor acts as a limiter before the track is encoded as mono Opus.

Screen audio is captured by Electron loopback and published separately as stereo Opus. It deliberately bypasses microphone processing to preserve music and game sound.

## Security decisions

- Renderer Node integration is disabled.
- Context isolation and the Electron sandbox are enabled.
- The preload bridge exposes a small typed API.
- New windows are denied.
- Only media and display-capture permissions are granted.
- Only full-screen source IDs are accepted.
- LiveKit secrets stay on the Railway token server.
- Room tokens expire after six hours and grant access to one room.

The shared access code is appropriate for a private alpha among friends. Replace it with user authentication and revocable invitations before making the application public.
