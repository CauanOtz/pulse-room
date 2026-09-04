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
join step. Everything that acts on the call then sits in the sidebar, under the
channels: where you are and how to leave, a button to go live, and, beside the
person they belong to, the microphone, the speakers, and the settings. Each of
the two devices carries a caret that opens the short list of the ones attached,
so changing a microphone never means opening a dialog.

While a screen is live, the same share, settings, and leave actions also ride
inside the picture with the rest of the overlay, appearing on the first movement
of the mouse and stepping aside again. An empty channel floats nothing over
itself, because the sidebar already carries those actions.

## The room as tiles

A voice channel is shown the way it is populated: one tile per person, avatar in
the middle, name plate in the corner, a green ring while they speak. Somebody
sharing has their picture in the tile with a live badge, and clicking it makes
that screen the whole stage; clicking it again steps back to the room. While a
screen is focused, the same tiles continue as a strip under the picture, so the
room never disappears behind the thing being watched.

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

## Staying in the room

A call outlives the window it was started from. On Windows, closing the window
hides it into the tray and the room stays connected; only the tray menu, or an
update, actually quits. A second launch reveals the window already running
rather than starting a rival instance.

On Android the call belongs to a foreground service, so the room survives the
screen turning off or another application coming forward. What the phone drops
in the background is the picture of a screen share, never its sound: a phone in
a pocket is still in the conversation.

## The design system

The interface is Tailwind over shadcn-style primitives built on Radix. Colour
lives only in tokens, declared once for a black theme and once for a paper one,
so a component never names a colour and the whole application turns with a class
on the root element. The choice is remembered and applied before the first
paint.

Radix earns its place on behaviour rather than looks: a menu of sound devices
flips above the bar and scrolls inside the window instead of running off the
bottom of the screen, and a long device name truncates with its full name on
hover. Those were the visible faults of the hand-built menus it replaced.

There is no second stylesheet. The hand-written one the interface grew up with
is gone, and what remains in CSS is only what belongs to elements rather than
components: the reset, the scrollbars, and the shared look of a text field.

## Pictures

A profile picture and a room icon are small enough that a bucket would be more
machinery than they justify: a square avatar re-encoded to 256 pixels weighs
tens of kilobytes, so the whole household fits in a megabyte. They live in
PostgreSQL, inside the backup that already exists. Message attachments would be
a different order of magnitude and belong in object storage; nothing here
prevents that later.

Every picture is addressed by the SHA-256 of its own bytes. The same picture is
therefore stored once, an address can never come to mean something else, and a
client may cache it forever without an invalidation rule.

The rules that keep it safe:

- Clients crop and re-encode before uploading, so no image decoder ever runs on
  the service, and the re-encode drops the metadata a camera writes.
- Uploads arrive as raw bytes, not as a form: no multipart parser, no file
  names, no temporary files.
- What a file claims about itself is ignored. Only PNG and WebP are accepted,
  recognised from their own signatures, with the dimensions read from the header
  so a small file cannot claim to be an enormous canvas. SVG is refused: it is a
  document that can carry script.
- A picture is served with its stored type, `nosniff`, a content policy that
  permits nothing, and an inline disposition.
- Reading one requires a session, and the reader must be its owner, share a
  community with its owner, or belong to the room it decorates. An unguessable
  address is not on its own an access rule.
- Replacing or removing a picture drops the previous one once nothing points at
  it, so nothing lingers behind an address somebody once knew.

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
