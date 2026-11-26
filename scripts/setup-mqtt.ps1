# Windows PowerShell script to generate Mosquitto password file
param(
  [string]$MosquittoDir = "C:\Program Files\mosquitto"
)

$ErrorActionPreference = "Stop"
$PasswdExe = Join-Path $MosquittoDir "mosquitto_passwd.exe"
if (-not (Test-Path $PasswdExe)) {
  Write-Error "mosquitto_passwd.exe not found in $MosquittoDir. Pass -MosquittoDir if installed elsewhere."
}

$RootDir = Split-Path -Parent $PSScriptRoot
$PassFile = Join-Path $RootDir "mqtt\passwords"

$BackendPass = Read-Host -Prompt "Enter password for smartroom_backend" -AsSecureString
$DevicePass  = Read-Host -Prompt "Enter password for smartroom_device" -AsSecureString

$BPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($BackendPass))
$DPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($DevicePass))

& $PasswdExe -c -b $PassFile smartroom_backend $BPlain
& $PasswdExe -b $PassFile smartroom_device $DPlain

Write-Host "Generated $PassFile successfully." -ForegroundColor Green
