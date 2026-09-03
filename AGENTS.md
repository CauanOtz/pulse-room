# Pulse Room

Windows desktop voice room (Electron + React + LiveKit) with a Fastify token
server deployed on Railway.

## Commits

- Never add a `Co-Authored-By:` trailer, and never add any other tool or
  assistant attribution to commit messages or pull request descriptions.
- Write the message as the author of the change would: a short imperative
  subject, then the reason for the change when it is not obvious.

## Releases

- The version lives only in `package.json`; the renderer and the end-to-end
  test read it at build time, so never hard-code a version string.
- Tag `vX.Y.Z` must match `package.json` exactly. Pushing the tag runs
  `.github/workflows/release.yml`, which verifies, builds the NSIS installer,
  and publishes the GitHub Release with `latest.yml` for automatic updates.
- Installer file names must not contain spaces. GitHub rewrites spaces in
  release asset names to dots, which breaks the update feed URL.
- Repository configuration the release build needs: variable `VITE_API_URL`
  and secret `VITE_ROOM_ACCESS_CODE`.

## Checks

- `npm run verify` runs the type check, the unit tests, and the Playwright
  Electron end-to-end test. Run it before tagging a release.

## Android

- The phone application lives in `android/` (Kotlin and Compose) and shares the
  account, server, channel and voice APIs with the desktop client.
- `.github/workflows/android.yml` runs the unit tests, lint and a debug build on
  every pull request, and the interface tests on an emulator.
- Tagging a release also publishes `Pulse-Room-Android-<version>.apk`, signed
  from the `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` secrets.
- The signing identity is permanent: an application signed with a different key
  cannot update an installed one, so every friend would have to uninstall first.
  It lives in `%LOCALAPPDATA%\PulseRoomSigning`, where the password is sealed to
  this Windows account. Keep a copy of the keystore and its password somewhere
  that survives the machine.
- `scripts/build-android.ps1` builds locally; `-InitializeSigning` creates the
  identity once and refuses to replace an existing one.
