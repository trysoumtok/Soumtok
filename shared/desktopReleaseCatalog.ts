export type ReleaseCatalogItem = {
  id: string
  label: string
  filename: string
}

export function desktopReleaseCatalog(version: string) {
  const v = version
  return {
    windows: [
      { id: 'win-x64-user', label: 'Windows (x64) (User)', filename: `Soumtok-Setup-${v}-win-x64-user.exe` },
      { id: 'win-x64-system', label: 'Windows (x64) (System)', filename: `Soumtok-Setup-${v}-win-x64-system.exe` },
      { id: 'win-arm64-user', label: 'Windows (ARM64) (User)', filename: `Soumtok-Setup-${v}-win-arm64-user.exe` },
      { id: 'win-arm64-system', label: 'Windows (ARM64) (System)', filename: `Soumtok-Setup-${v}-win-arm64-system.exe` },
      { id: 'win-x64-zip', label: 'Windows (x64) — Portable (.zip)', filename: `Soumtok-Setup-${v}-win-x64.zip` },
    ] satisfies ReleaseCatalogItem[],
    macos: [
      { id: 'mac-arm64', label: 'Mac (ARM64)', filename: `Soumtok-Setup-${v}-mac-arm64.dmg` },
      { id: 'mac-x64', label: 'Mac (x64)', filename: `Soumtok-Setup-${v}-mac-x64.dmg` },
      { id: 'mac-universal', label: 'Mac Universal', filename: `Soumtok-${v}-mac-universal.dmg` },
    ] satisfies ReleaseCatalogItem[],
    linux: [
      { id: 'linux-deb-x64', label: 'Linux .deb (x64)', filename: `Soumtok-Setup-${v}-linux-amd64.deb` },
      { id: 'linux-deb-arm64', label: 'Linux .deb (ARM64)', filename: `Soumtok-Setup-${v}-linux-arm64.deb` },
      { id: 'linux-appimage-x64', label: 'Linux AppImage (x64)', filename: `Soumtok-Setup-${v}-linux-x86_64.AppImage` },
      { id: 'linux-appimage-arm64', label: 'Linux AppImage (ARM64)', filename: `Soumtok-Setup-${v}-linux-arm64.AppImage` },
    ] satisfies ReleaseCatalogItem[],
  }
}
