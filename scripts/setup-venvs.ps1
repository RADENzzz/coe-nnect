# scripts/setup-venvs.ps1
#
# One-time setup for the Python services.
# Creates .venv in each package and installs requirements.
#
# Usage: pnpm setup:venvs
#
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Setup-Venv($pkgName, $requirementsPath) {
  $pkgDir = Join-Path $root "packages\$pkgName"
  $venvDir = Join-Path $pkgDir ".venv"
  $reqFile = Join-Path $pkgDir $requirementsPath

  if (-not (Test-Path $pkgDir)) {
    Write-Host "⚠ Skipping $pkgName (folder not found)" -ForegroundColor Yellow
    return
  }
  if (-not (Test-Path $reqFile)) {
    Write-Host "⚠ Skipping $pkgName (no $requirementsPath)" -ForegroundColor Yellow
    return
  }

  if (-not (Test-Path $venvDir)) {
    Write-Host "▸ Creating venv for $pkgName…" -ForegroundColor Cyan
    python -m venv $venvDir
  }

  $pythonExe = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path $pythonExe)) {
    Write-Host "✗ venv python not found at $pythonExe" -ForegroundColor Red
    return
  }

  Write-Host "▸ Installing deps for $pkgName…" -ForegroundColor Cyan
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install -r $reqFile
  Write-Host "✓ $pkgName ready" -ForegroundColor Green
}

Setup-Venv "solver-service"    "requirements.txt"
Setup-Venv "prospectus-parser" "requirements.txt"

Write-Host "`n✓ All Python venvs ready. Now run: pnpm dev" -ForegroundColor Green