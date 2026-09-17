# Safe local disk cleanup for Soumtok dev + common Windows caches.
$ErrorActionPreference = 'SilentlyContinue'
$freed = 0

function Remove-Tree($path) {
  if (-not (Test-Path $path)) { return 0 }
  $size = (Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
  return [int64]$size
}

Write-Host "Disk before:"
Get-PSDrive C | Select-Object @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}}

$targets = @(
  "$env:LOCALAPPDATA\npm-cache",
  "$env:USERPROFILE\.npm\_cacache",
  "$env:USERPROFILE\Soumtok\node_modules",
  "$env:USERPROFILE\Soumtok\desktop\node_modules",
  "$env:USERPROFILE\Soumtok\dist",
  "E:\soumtok\node_modules\.vite",
  "E:\soumtok\dist",
  "E:\soumtok\desktop\node_modules",
  "E:\soumtok\desktop\out",
  "E:\soumtok\desktop\dist",
  "$env:LOCALAPPDATA\Temp\*",
  "$env:TEMP\*"
)

foreach ($t in $targets) {
  if ($t -like '*\*') {
    Get-ChildItem (Split-Path $t -Parent) -Filter (Split-Path $t -Leaf) -ErrorAction SilentlyContinue |
      ForEach-Object { $freed += Remove-Tree $_.FullName; if ($freed) { Write-Host "Removed $($_.FullName)" } }
  } else {
    $n = Remove-Tree $t
    if ($n) { Write-Host "Removed $t ($([math]::Round($n/1MB,1)) MB)"; $freed += $n }
  }
}

npm cache clean --force 2>$null | Out-Null

Write-Host ""
Write-Host ("Freed about {0:N1} GB" -f ($freed / 1GB))
Write-Host "Disk after:"
Get-PSDrive C | Select-Object @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}}
Write-Host ""
Write-Host "Kept: your Soumtok source + CLI. Re-run npm install where needed."
Write-Host "Big win: delete duplicate clone if you use E:\soumtok -> Remove-Item `$env:USERPROFILE\Soumtok -Recurse -Force"
Write-Host "Then: `$env:SOUMTOK_CLI_ROOT='E:\soumtok'; E:\soumtok\scripts\install-cli.ps1"
