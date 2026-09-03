# Releases and hardware verification

## One-time repository setup

1. Push the project to a private or public GitHub repository.
2. Enable GitHub Actions with permission to create releases.
3. Build the client with `VITE_API_URL` configured as a repository variable. Account sessions replace the old bundled `VITE_ROOM_ACCESS_CODE` secret. The backend also requires PostgreSQL (`DATABASE_URL`).
4. For public distribution, add a Windows code-signing certificate. Unsigned installers work but Windows SmartScreen may warn users.

## Hardware checklist

Run this checklist on a Windows computer before creating a version tag:

1. Join the same room from two computers on different networks.
2. Confirm both microphones are clear with noise suppression enabled.
3. Move each participant volume slider and confirm only that participant changes.
4. Share the entire monitor, not an application window.
5. Play a stereo left/right audio test and confirm both channels reach the remote computer.
6. Confirm the remote computer receives screen video and system audio simultaneously.
7. Confirm call voices do not return through the shared system audio.
8. Test 720p30, 1080p30, and 1080p60 while watching CPU usage and packet loss.
9. Stop sharing from both the Pulse Room button and the operating-system sharing control.
10. Leave and rejoin the room after changing microphone and speaker devices.

## Creating a release

Update the version without creating a tag automatically:

```powershell
npm version patch --no-git-tag-version
npm run verify
git add .
git commit -m "release: v0.1.1"
git tag v0.1.1
git push origin main --tags
```

Use `minor` or `major` in place of `patch` when appropriate. The GitHub workflow rejects a tag that does not match `package.json`.

## How automatic updates work

The release workflow sets the generic update feed to the repository's latest GitHub Release download URL. Electron Builder generates the installer, block map, and `latest.yml`. Pulse Room checks that feed five seconds after startup, downloads a newer signed package in the background, and offers restart-and-install in settings.
