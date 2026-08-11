# ============================================================
# Sentja Cloud Tray App Installer (runs at user login)
# Run as Administrator
# ============================================================
#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\SentjaCloud"
)

$PublishDir = Join-Path $PSScriptRoot "..\SentjaTray\bin\Release\net10.0-windows\publish"
$ExePath    = Join-Path $InstallDir "SentjaTray.exe"

Write-Host "=== Sentja Cloud Tray App Installer ===" -ForegroundColor Cyan

# Build
Write-Host "[1/3] Building tray application..." -ForegroundColor Yellow
dotnet publish "$PSScriptRoot\..\SentjaTray\SentjaTray.csproj" `
    -c Release -r win-x64 --self-contained false -o $PublishDir
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed."; exit 1 }

# Copy to install dir
Write-Host "[2/3] Copying files to $InstallDir..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
Copy-Item "$PublishDir\*" $InstallDir -Recurse -Force

# Add to Run registry key (auto-start at Windows login)
Write-Host "[3/3] Registering auto-start..." -ForegroundColor Yellow
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $regPath -Name "SentjaCloudTray" -Value "`"$ExePath`""

Write-Host "`n✅ Tray app installed." -ForegroundColor Green
Write-Host "   Path      : $ExePath"
Write-Host "   Auto-start: Enabled (HKLM Run)"
Write-Host "`nThe tray icon will appear after next login or run manually: $ExePath"
