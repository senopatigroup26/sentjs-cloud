# ============================================================
# Sentja Cloud Service Uninstaller
# Run as Administrator
# ============================================================
#Requires -RunAsAdministrator

param(
    [string]$InstallDir    = "C:\Program Files\SentjaCloud",
    [switch]$RemoveData    = $false
)

$ServiceName = "SentjaCloudService"

Write-Host "=== Sentja Cloud Service Uninstaller ===" -ForegroundColor Cyan

$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "[1/3] Stopping service..." -ForegroundColor Yellow
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Write-Host "      Service removed."
} else {
    Write-Host "[1/3] Service not found, skipping." -ForegroundColor DarkGray
}

Write-Host "[2/3] Removing install directory: $InstallDir" -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "      Done."
} else {
    Write-Host "      Directory not found, skipping." -ForegroundColor DarkGray
}

if ($RemoveData) {
    Write-Host "[3/3] Removing app data (C:\ProgramData\Sentja)..." -ForegroundColor Yellow
    $dataDir = "C:\ProgramData\Sentja"
    if (Test-Path $dataDir) {
        Remove-Item $dataDir -Recurse -Force
        Write-Host "      Done."
    }
} else {
    Write-Host "[3/3] App data kept at C:\ProgramData\Sentja (use -RemoveData to delete)." -ForegroundColor DarkGray
}

Write-Host "`n✅ Uninstall complete." -ForegroundColor Green
