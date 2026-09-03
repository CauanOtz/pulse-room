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
  PresenceClient             who is in the channels this client did not join
      ├── DemoConferenceGateway
      └── LiveKitConferenceGateway
              │
              ├── MicrophoneTrackFactory
              └── LiveKit SFU

Railway token server
  TokenService               issues short-lived, room-scoped credentials
  PresenceSource             reports the roster of every room, briefly cached
```

## Patterns

- **Ports and adapters:** `ConferenceGateway` keeps React and use cases independent from LiveKit. Demo and production transports are interchangeable.
- **Facade/controller:** `ConferenceController` presents complete user actions such as joining, muting, and sharing instead of exposing transport details to components.
- **Factory:** `ConferenceGatewayFactory` selects demo or production infrastructure from the build environment.
- **Repository:** `SettingsRepository` isolates persistence and supports future migration from local storage to a server profile.
- **Strategy:** named screen quality presets encapsulate the resolution, frame rate, bitrate ceiling, and the encoder's content hint. The ceiling is not a target: a preset hinted for detail spends its budget keeping text sharp, while one hinted for motion can send far less than a lower preset does.
- **Observer:** gateways publish immutable snapshots through subscriptions compatible with React's `useSyncExternalStore`.
- **Service layer:** screen capture, microphone processing, token issuance, and updates each have a single runtime owner.
- **Registry:** `ParticipantStreamRegistry` keeps one `MediaStream` per participant and kind for as long as its tracks last, so snapshot rebuilds never hand a new stream to a media element, and a republished track always arrives as a new one.

Patterns are applied only at volatile boundaries. Presentational components remain simple functions.

## Audio pipeline

The microphone is captured at 48 kHz and requests browser-native echo cancellation, noise suppression, and automatic gain control. The signal then passes a high-pass filter at 90 Hz, a noise gate running in an AudioWorklet, the user's gain, and a dynamics compressor acting as a limiter, before the track is encoded as mono Opus.

Browser suppression removes steady broadband noise but leaves fans, keystrokes, and room tone between words, which is what the gate closes. Its strength is one slider: 0 leaves the gate open at -80 dBFS and 100 closes it at -30 dBFS. The worklet is loaded from a real asset file, because `addModule` rejects the inlined data URL a small asset would otherwise become.

The stage controls float over the picture and fade out while nobody reaches for
them, so a full-screen broadcast is not framed by a permanent bar.

A microphone counts as enabled only once its track is published. If the saved input device has disappeared, capture falls back to the system default. If the processing graph cannot be built at all, which happens on sound cards that refuse a 48 kHz context, the plain microphone is published instead, because being heard matters more than being filtered. Only a machine with no usable microphone ends in a reported failure, and the settings dialog shows the live input level next to the gate threshold so a speaker can tell the difference.

Screen audio is captured by Electron loopback and published separately as stereo Opus. It deliberately bypasses microphone processing to preserve music and game sound.

## Playback levels

Playback volume belongs to this client. LiveKit reports the volume of the audio
elements it attached itself, and this client renders its own, so asking the SDK
returns the level of a set of elements that does not exist. The gateway holds a
level per participant instead, at full volume until somebody moves the slider,
along with a local mute that silences one person for this listener only.

A media element cannot be turned up past the level of its own recording, and
both a quiet friend and a quiet game often need more than that. All incoming
sound therefore plays through one shared Web Audio graph, whose gain node allows
up to 200%, with the element kept muted and attached so the track keeps
flowing. Where that graph cannot be built, playback falls back to the element
and its 100% ceiling. Screen audio starts at half, leaving room to push up.

People are reached where they are listed: a right click on someone in the
sidebar opens their volume and local mute, and the roster shows a ring while
they speak and a mark when they are muted.

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
- Gain and the noise gate are applied to the running audio graph. Republishing
  the microphone for a settings change would drop the speaker out of the room
  for a moment and hand listeners a stream whose track had been replaced.

## Seeing the other channels

A LiveKit client only ever sees the room it joined, so a friend waiting in
another voice channel would be invisible. The service answers `/api/presence`
behind the same access code, listing the rooms and who is in them, and the
application asks every few seconds. The channel this client joined is still
described from the live call, which knows far more than a roster does.

An empty room is torn down moments after the last person leaves, so asking who
is inside a room that was listed a moment earlier can answer that the room does
not exist. Each room is therefore read on its own: one that vanishes reports an
empty roster instead of failing the whole request.

## Room cues

Arrivals, departures, muting, and a screen going live each have a short
synthesised cue, decided by one pure function over the room's state. A change of
connection speaks for everything that arrived with it, so joining a busy room is
one sound rather than one per person and one more for the microphone opening.

## Where the controls live

Clicking a voice channel is the whole act of joining it, so there is no separate
join step. Microphone and deafen sit with the person they belong to, in the
profile strip of the sidebar, and the rest of the call controls ride inside the
picture with the rest of the overlay, appearing on the first movement of the
mouse and stepping aside again.

## The live stage

Every participant may publish a screen at the same time. The stage lists each
live screen and the viewer chooses which one to watch, in normal size or full
screen, choosing between them from thumbnails of the live pictures rather than
a list of names. Only the selected screen plays, so its audio is the only screen audio in
the room, and it carries its own volume, separate from the voice level of the
person sharing. A remote screen wins the default selection, because previewing
your own monitor on the monitor being captured feeds the capture back into
itself.

Screen capture travels as limited-range video. A decoder that renders it as full
range turns black into grey, so an optional filter maps the limited range back
onto the full one for viewers who see that.

## Visual density

The interface follows one scale rather than a set of one-off values: rows are
28 to 32 pixels tall, radii are 4 pixels for anything inside a panel and 8 for
the panels themselves, and a shadow appears only on something that floats above
the page. Call controls are round and carry an icon alone, because a label under
every icon is what made the old dock twice the height it needed.

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
