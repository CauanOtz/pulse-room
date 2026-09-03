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

The microphone is captured at 48 kHz and requests browser-native echo cancellation, noise suppression, and automatic gain control. The signal then passes a high-pass filter at 90 Hz, a noise gate running in an AudioWorklet, the user's gain, and a dynamics compressor acting as a limiter, before the track is encoded as mono Opus.

Browser suppression removes steady broadband noise but leaves fans, keystrokes, and room tone between words, which is what the gate closes. Its strength is one slider: 0 leaves the gate open at -80 dBFS and 100 closes it at -30 dBFS. The worklet is loaded from a real asset file, because `addModule` rejects the inlined data URL a small asset would otherwise become.

A microphone counts as enabled only once its track is published. If the saved input device has disappeared, capture falls back to the system default, and if capture fails entirely the state reports a muted microphone with the reason, rather than a working one nobody can hear.

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
the room, and it carries its own volume, separate from the voice level of the
person sharing. A remote screen wins the default selection, because previewing
your own monitor on the monitor being captured feeds the capture back into
itself.

Screen capture travels as limited-range video. A decoder that renders it as full
range turns black into grey, so an optional filter maps the limited range back
onto the full one for viewers who see that.

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
