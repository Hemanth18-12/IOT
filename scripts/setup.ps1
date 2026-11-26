# Windows PowerShell Setup Script for SmartRoom IoT
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

Write-Host "=== SmartRoom IoT Windows Setup ===" -ForegroundColor Yellow

if (-not (Test-Path (Join-Path $BackendDir "node_modules"))) {
  Push-Location $BackendDir; npm install; Pop-Location
}
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
  Push-Location $FrontendDir; npm install; Pop-Location
}

$BackendEnv = Join-Path $BackendDir ".env"
if (-not (Test-Path $BackendEnv)) {
  Copy-Item (Join-Path $BackendDir ".env.example") $BackendEnv
  Write-Host "Created backend\.env from example. Update JWT_SECRET, ADMIN_PASSWORD, MQTT_PASSWORD, and SMTP settings."
}
$FrontendEnv = Join-Path $FrontendDir ".env"
if (-not (Test-Path $FrontendEnv)) {
  Copy-Item (Join-Path $FrontendDir ".env.example") $FrontendEnv
}

Push-Location $BackendDir
npm run build
npm run migration:run
npm run seed:admin
Pop-Location

Write-Host "Windows setup complete. Run .\scripts\setup-mqtt.ps1 if mqtt\passwords does not exist yet." -ForegroundColor Green
