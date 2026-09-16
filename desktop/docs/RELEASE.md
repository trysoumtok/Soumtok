# Soumtok Desktop — Release checklist

## 1. Bump version

Edit `desktop/package.json` `"version"` (semver).

## 2. Build

```bash
cd desktop
npm install
npm run pack:win    # Windows NSIS
npm run pack:mac    # macOS DMG (on Mac)
npm run pack:linux  # Linux AppImage
npm run release:verify
```

Output: `desktop/release/`

## 3. Code signing (public release)

| Platform | Environment variables |
|----------|----------------------|
| Windows | `CSC_LINK` (or `WIN_CSC_LINK`), `CSC_KEY_PASSWORD` |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

Unsigned builds work for internal beta; Windows SmartScreen and macOS Gatekeeper will warn.

## 4. Auto-update hosting

1. Upload **every file** in `release/` to your CDN (including `latest.yml` and blockmap files).
2. Set `SOUMTOK_UPDATE_URL=https://your-cdn/desktop/` in `.env` before building, or rely on `build.publish.url` in `package.json`.
3. Packaged apps call `electron-updater` on startup (12s delay) and via **Settings → Check for updates**.

## 5. Smoke test the installer

- Sign in, open folder, agent round, Tab, Problems panel, extension host optional.

## 6. Remote control (updates, disable app, force upgrade)

Server-side control lives in `data/desktop-control.json` and env overrides.

| Control | Env | Effect |
|---------|-----|--------|
| Latest version | `DESKTOP_LATEST_VERSION` | Shown on `/download` and compared for force-update |
| Minimum version | `DESKTOP_MIN_VERSION` | Older desktop builds must update |
| Force update | `DESKTOP_FORCE_UPDATE=1` | Packaged app auto-downloads and requires restart |
| Disable app | `DESKTOP_DISABLED=1` | Desktop quits on launch with your message |
| Admin API | `DESKTOP_ADMIN_SECRET` | Bearer token for `PUT /api/admin/desktop/control` |

**After each release:**

1. Upload `release/` to CDN (`latest*.yml`, `releases.json`, installers).
2. Bump `latestVersion` in `data/desktop-control.json` (or admin API).
3. Set `available: true` on new platform builds in the `releases` array.

**Admin API example:**

```bash
curl -X PUT https://soumtok.com/api/admin/desktop/control \
  -H "Authorization: Bearer $DESKTOP_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"latestVersion":"0.2.0","forceUpdate":false,"disabled":false}'
```

**Disable desktop everywhere:**

```bash
curl -X PUT https://soumtok.com/api/admin/desktop/control \
  -H "Authorization: Bearer $DESKTOP_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"disabled":true,"disabledMessage":"Desktop maintenance — use Studio at soumtok.com"}'
```

Desktop apps poll `/api/desktop/config` on launch and every 6 hours.

## 7. Ship

Publish release notes with known limits from `desktop/README.md`.
