# Soumtok CLI — Windows install (PowerShell)
$ErrorActionPreference = "Stop"
$RepoRoot = if ($env:SOUMTOK_CLI_ROOT) { $env:SOUMTOK_CLI_ROOT } else { (git rev-parse --show-toplevel 2>$null) }
if (-not $RepoRoot) {
  Write-Host "Clone https://github.com/trysoumtok/Soumtok and re-run, or set SOUMTOK_CLI_ROOT to the repo path." -ForegroundColor Yellow
  exit 1
}
$Bin = Join-Path $RepoRoot "cli\bin\soumtok.mjs"
if (-not (Test-Path $Bin)) {
  Write-Host "Missing $Bin — update your Soumtok checkout." -ForegroundColor Red
  exit 1
}
$ShimDir = Join-Path $env:USERPROFILE ".local\bin"
New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
$Shim = Join-Path $ShimDir "soumtok.cmd"
@"
@echo off
node "$Bin" %*
"@ | Set-Content -Encoding ASCII $Shim
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$ShimDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$ShimDir", "User")
  $env:Path = "$env:Path;$ShimDir"
}
Write-Host "Soumtok CLI installed. Open a new terminal and run: soumtok login" -ForegroundColor Green
