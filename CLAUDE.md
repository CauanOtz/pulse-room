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
- Repository configuration the release build needs: variable `VITE_API_URL`.
  Individual account sessions replace the old `VITE_ROOM_ACCESS_CODE` secret.
  The backend requires PostgreSQL through its private `DATABASE_URL`.

## Checks

- `npm run verify` runs the type check, the unit tests, and the Playwright
  Electron end-to-end test. Run it before tagging a release.
