# Windows PowerShell Stop Script for SmartRoom IoT
$RootDir = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $RootDir ".run"

foreach ($svc in @("frontend", "backend", "mosquitto")) {
  $pidFile = Join-Path $RunDir "$svc.pid"
  if (Test-Path $pidFile) {
    $procId = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($procId) {
      Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped $svc (PID $procId)."
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}
