# Soumtok CLI installer (Windows)
$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:USERPROFILE "Soumtok"
if (-not (Test-Path (Join-Path $InstallDir "cli\bin\soumtok.mjs"))) {
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue }
  git clone --depth 1 https://github.com/trysoumtok/Soumtok.git $InstallDir
}
$env:SOUMTOK_CLI_ROOT = $InstallDir
& (Join-Path $InstallDir "scripts\install-cli.ps1")
