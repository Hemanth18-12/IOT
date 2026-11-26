# Windows PowerShell Status Script for SmartRoom IoT
$RootDir = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $RootDir ".run"

foreach ($svc in @("mosquitto", "backend", "frontend")) {
  $pidFile = Join-Path $RunDir "$svc.pid"
  if (Test-Path $pidFile) {
    $procId = Get-Content $pidFile
    $running = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
    Write-Host "$svc : $(if ($running) { "running (PID $procId)" } else { "stopped" })"
  } else {
    Write-Host "$svc : stopped"
  }
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 3
  Write-Host "API Health: $($health | ConvertTo-Json -Compress)"
} catch {
  Write-Host "API Health: unreachable"
}
