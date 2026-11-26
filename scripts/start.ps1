# Windows PowerShell Start Script for SmartRoom IoT
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $RootDir ".run"
$LogDir = Join-Path $RootDir "logs"
New-Item -ItemType Directory -Force -Path $RunDir, $LogDir | Out-Null

$BackendProc = Start-Process -FilePath "node" -ArgumentList "dist/main" -WorkingDirectory (Join-Path $RootDir "backend") -RedirectStandardOutput (Join-Path $LogDir "backend.log") -RedirectStandardError (Join-Path $LogDir "backend.err.log") -PassThru
$BackendProc.Id | Set-Content (Join-Path $RunDir "backend.pid")

$FrontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" -WorkingDirectory (Join-Path $RootDir "frontend") -RedirectStandardOutput (Join-Path $LogDir "frontend.log") -RedirectStandardError (Join-Path $LogDir "frontend.err.log") -PassThru
$FrontendProc.Id | Set-Content (Join-Path $RunDir "frontend.pid")

Write-Host "Started Backend (PID $($BackendProc.Id)) and Frontend (PID $($FrontendProc.Id))." -ForegroundColor Green
Write-Host "Open http://localhost:5173 (Ensure Mosquitto is running on port 1883)."
