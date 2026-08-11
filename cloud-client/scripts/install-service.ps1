# ============================================================
# Sentja Cloud Service Installer
# Run as Administrator
# ============================================================
#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\SentjaCloud",
    [string]$ApiBaseUrl = "https://api.yourdomain.com"
)

$ServiceName    = "SentjaCloudService"
$DisplayName    = "Sentja Cloud Sync Service"
$Description    = "Manages Sentja Cloud file synchronization, heartbeat, and endpoint policy."
$ExePath        = Join-Path $InstallDir "SentjaCloudService.exe"
$PublishDir     = Join-Path $PSScriptRoot "..\SentjaCloudService\bin\Release\net10.0\publish"

Write-Host "=== Sentja Cloud Service Installer ===" -ForegroundColor Cyan

# 1. Publish the service
Write-Host "`n[1/5] Building and publishing service..." -ForegroundColor Yellow
dotnet publish "$PSScriptRoot\..\SentjaCloudService\SentjaCloudService.csproj" `
    -c Release -r win-x64 --self-contained false -o $PublishDir
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed."; exit 1 }

# 2. Stop existing service if running
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "[2/5] Stopping existing service..." -ForegroundColor Yellow
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# 3. Copy files
Write-Host "[3/5] Installing to $InstallDir..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
Copy-Item "$PublishDir\*" $InstallDir -Recurse -Force

# 4. Update appsettings
Write-Host "[4/5] Configuring service..." -ForegroundColor Yellow
$settingsPath = Join-Path $InstallDir "appsettings.json"
if (Test-Path $settingsPath) {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
    $settings.Sentja.ApiBaseUrl = $ApiBaseUrl
    $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath
}

# Create data directory
$dataDir = "C:\ProgramData\Sentja"
if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

# 5. Register Windows Service
Write-Host "[5/5] Registering Windows Service..." -ForegroundColor Yellow
New-Service `
    -Name $ServiceName `
    -DisplayName $DisplayName `
    -Description $Description `
    -BinaryPathName "`"$ExePath`"" `
    -StartupType Automatic `
    | Out-Null

# Set service to restart on failure
sc.exe failure $ServiceName reset= 3600 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Start the service
Start-Service $ServiceName
Write-Host "`n✅ Service installed and started successfully." -ForegroundColor Green
Write-Host "   Service name : $ServiceName"
Write-Host "   Install path : $InstallDir"
Write-Host "   Status       : $((Get-Service $ServiceName).Status)"
