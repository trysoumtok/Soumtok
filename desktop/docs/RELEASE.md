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

## 3. Code signing (required for public trust)

Without Authenticode signing, Windows shows **“Windows protected your PC”** / **“Unknown publisher”** on every download. That warning cannot be removed by UI changes — you need a code signing certificate.

| Platform | Environment variables |
|----------|----------------------|
| Windows | `WIN_CSC_LINK` (path to `.pfx`), `CSC_KEY_PASSWORD` |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

### Windows SmartScreen checklist

1. **Buy a code signing certificate** — Standard OV (~$200–400/yr) from DigiCert, Sectigo, SSL.com, etc. **EV** certificates build SmartScreen reputation faster (often immediate “Verified publisher: Soumtok”).
2. **Export as `.pfx`** and set before building:
   ```bash
   set WIN_CSC_LINK=E:\certs\soumtok-code-sign.pfx
   set CSC_KEY_PASSWORD=your-cert-password
   cd desktop
   npm run pack:win
   ```
3. **Sign every release** — `electron-builder` signs the `.exe` and NSIS installer when those env vars are set (`publisherName: Soumtok` is already in `package.json`).
4. **Use HTTPS downloads** — soumtok.com serves installers from `/api/desktop/download/` (already configured).
5. **Reputation builds over time** — Standard certs need enough signed downloads before SmartScreen stops warning. EV avoids the cold-start problem.

Unsigned builds are fine for internal beta only. Public users should never receive unsigned installers.

### macOS

Unsigned builds trigger Gatekeeper. Notarize with Apple after signing (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

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
