import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildClientConfig,
  buildManifestFromControl,
  compareVersions,
  defaultDesktopControlFile,
  isVersionOlder,
  mergeDesktopControlPolicy,
} from './desktopControl.ts'

test('compareVersions orders semver-like strings', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0)
  assert.ok(compareVersions('0.1.0', '0.2.0') < 0)
  assert.ok(compareVersions('1.0.0', '0.9.9') > 0)
})

test('buildClientConfig marks updateRequired below min or when forced', () => {
  const control = {
    ...defaultDesktopControlFile(),
    latestVersion: '0.2.0',
    minVersion: '0.1.5',
    forceUpdate: false,
  }
  assert.equal(buildClientConfig(control, '0.1.0').updateRequired, true)
  assert.equal(buildClientConfig(control, '0.1.5').updateRequired, false)

  const forced = { ...control, forceUpdate: true }
  assert.equal(buildClientConfig(forced, '0.1.9').updateRequired, true)
  assert.equal(buildClientConfig(forced, '0.2.0').updateRequired, false)
})

test('mergeDesktopControlPolicy applies env overrides', () => {
  const merged = mergeDesktopControlPolicy(defaultDesktopControlFile(), {
    DESKTOP_MIN_VERSION: '0.2.0',
    DESKTOP_DISABLED: '1',
    DESKTOP_DISABLED_MESSAGE: 'Maintenance',
  })
  assert.equal(merged.minVersion, '0.2.0')
  assert.equal(merged.disabled, true)
  assert.equal(merged.disabledMessage, 'Maintenance')
})

test('buildManifestFromControl uses release specs', () => {
  const control = defaultDesktopControlFile()
  control.latestVersion = '0.2.0'
  control.releases = [
    {
      version: '0.2.0',
      latest: true,
      windows: [
        {
          id: 'win-x64-installer',
          label: 'Windows (x64) — Installer',
          filename: 'Soumtok-Setup-0.2.0-win-x64.exe',
          available: true,
        },
      ],
    },
  ]
  const manifest = buildManifestFromControl(control)
  assert.equal(manifest.version, '0.2.0')
  assert.equal(manifest.releases[0]?.windows[0]?.available, true)
  assert.ok(isVersionOlder('0.1.0', '0.2.0'))
})
