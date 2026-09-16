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

## 6. Ship

Publish release notes with known limits from `desktop/README.md`.
