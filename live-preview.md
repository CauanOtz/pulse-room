# Live preview refinement

The room previously squeezed screen shares into a 128 px participant thumbnail.
The new broadcast card gives each live screen its own 16:9 preview, persistent
Live badge, broadcaster identity and visible Watch/Open action. Participant
avatars remain separate. The graphite surfaces and neutral accents match the
current call controls.

Broadcasters appear only in their live card rather than also repeating their
avatar in the participant area. The ordinary avatar returns when sharing ends.

Only explicitly watched screens render video. Returning from the player keeps
the received preview without adding a second decoder in the participant avatar.
The existing player, subscriptions and participant context menus are retained.

## Visual review

Evidence directory:
`C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-live/`

- `live-preview-comparison.png`: matched 1200 x 921 stage captures, published
  layout versus the local change, shown side by side. The video is a synthetic
  test stream rendered by the actual Stage component.
- `live-preview-multiple.png`, `live-preview-840.png` and
  `live-preview-600.png`: two screen offers and narrower windows. Review found
  an overlapping header; top alignment and spacing were corrected.
- `live-preview-compact.png` and `live-preview-compact-short.png`: the actual
  call dock remains below the card. Review found a clipped secondary name at
  short heights; that label is now hidden only in compact broadcast layouts.

## Multiple broadcasts and player revision

The player now reserves separate header, video and footer regions. Voice peers
are compact footer identities, and the current screen has no duplicate preview.
With multiple broadcasts, a side rail identifies On screen, Watching,
Connecting and Not watching. Only other received screens render small previews.
On narrow windows this rail becomes a horizontally scrollable row below the
video, outside the picture. Compact mode uses smaller call controls.

Selecting a stream preserves every other subscription. Stop watching is an
explicit action, separate from switching views and Back to the room. If the
active broadcaster leaves, the next available watched broadcast is selected
even if the old identity remains temporarily in the watching list.

Additional reviewed evidence:

- `live-player-before.png` and `live-player-after.png`: the old overlay strip
  versus the single-player layout without video obstruction.
- `live-player-mixed.png` and `live-room-mixed.png`: three broadcasters,
  two subscribed screens and one unopened offer.
- `live-player-mixed-840.png`, `live-player-mixed-600.png`,
  `live-player-mixed-compact.png` and `live-player-mixed-compact-short.png`:
  responsive navigation, long names and the short 260 px call card.

Review found excess dock height in compact playback and wrapped status labels.
The compact dock was reduced, status labels kept on one line, and screenshots
were captured with controls revealed after their idle fade. There is no
horizontal page overflow at the tested widths; the stream row itself scrolls.

## Validation and scope

- 28 stage/navigation unit tests passed, including mixed subscriptions,
  decoder checks and fallback when a broadcaster leaves.
- Three Electron flows passed: desktop screen sharing/fullscreen, workspace
  resizing and the broadcast preview/player flow. The player flow covers three
  live offers, two watched screens, independent stop/reopen, returning to the
  room and narrow/compact layouts. The actual call dock stays outside the video.
- Production build and TypeScript passed. The existing large bundle warning
  remains.
- `git diff --check` passed.
- Local UI and API responded with HTTP 200 on ports 5173 and 3101. Automatic
  approval review blocked starting the local LiveKit process without a detailed
  reason, so a real local voice session was not validated.

This change remains local and uncommitted. It is not included in the already
published v0.13.0 release; no additional tag or release was created for it.
