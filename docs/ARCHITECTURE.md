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
- **Registry:** `ParticipantStreamRegistry` keeps one long-lived `MediaStream` per participant and kind, so snapshot rebuilds never hand a new stream to a media element.

Patterns are applied only at volatile boundaries. Presentational components remain simple functions.

## Audio pipeline

The microphone is captured at 48 kHz and requests browser-native echo cancellation, noise suppression, and automatic gain control. A Web Audio gain node applies the user's chosen level and a dynamics compressor acts as a limiter before the track is encoded as mono Opus.

Screen audio is captured by Electron loopback and published separately as stereo Opus. It deliberately bypasses microphone processing to preserve music and game sound.

## Stable playback

Media elements restart whenever their `srcObject` is reassigned, which viewers
see as a flickering screen share and hear as short gaps in the audio. Three
rules keep playback continuous:

- The gateway reuses one `MediaStream` per participant and kind, and mutates its
  track list in place.
- `MediaOutput` reassigns `srcObject` only when the stream itself changes;
  volume and output device live in their own effects.
- Adaptive stream is disabled, because it pauses tracks whose elements were not
  attached through the LiveKit API, and screen shares publish a single quality
  layer so the sender never hops between resolutions.

## The live stage

Every participant may publish a screen at the same time. The stage lists each
live screen and the viewer chooses which one to watch, in normal size or full
screen. Only the selected screen plays, so its audio is the only screen audio in
the room. A remote screen wins the default selection, because previewing your
own monitor on the monitor being captured feeds the capture back into itself.

## Security decisions

- Renderer Node integration is disabled.
- Context isolation and the Electron sandbox are enabled.
- The preload bridge exposes a small typed API.
- New windows are denied.
- Only media, display-capture, and fullscreen permissions are granted.
- Only full-screen source IDs are accepted.
- LiveKit secrets stay on the Railway token server.
- Room tokens expire after six hours and grant access to one room.

The shared access code is appropriate for a private alpha among friends. Replace it with user authentication and revocable invitations before making the application public.
