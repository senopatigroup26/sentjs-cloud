# Build Sentja Cloud with Inno Setup
# Professional installer with setup wizard and device registration
# Usage: .\build-installer-inno.ps1 -Version "1.0.0"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Sentja Cloud Installer Builder (Inno Setup)" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for Inno Setup
$innoSetupPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $innoSetupPath)) {
    Write-Host "ERROR: Inno Setup not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Inno Setup 6:" -ForegroundColor Yellow
    Write-Host "  Download: https://jrsoftware.org/isdl.php" -ForegroundColor White
    Write-Host "  Install to default location: C:\Program Files (x86)\Inno Setup 6\" -ForegroundColor White
    Write-Host ""
    Write-Host "OR use Squirrel installer:" -ForegroundColor Yellow
    Write-Host "  .\build-installer.ps1 -Version '$Version'" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "[1/5] Inno Setup found: $innoSetupPath" -ForegroundColor Green
Write-Host ""

# Clean previous builds
Write-Host "[2/5] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path ".\publish") {
    Remove-Item ".\publish" -Recurse -Force
    Write-Host "      Removed old publish folder" -ForegroundColor Gray
}
if (Test-Path ".\InnoSetup-Output") {
    Remove-Item ".\InnoSetup-Output" -Recurse -Force
    Write-Host "      Removed old InnoSetup-Output folder" -ForegroundColor Gray
}

# Build the application
Write-Host ""
Write-Host "[3/5] Building Release version..." -ForegroundColor Yellow
dotnet publish SentjaTray\SentjaTray.csproj `
    -c Release `
    -r win-x64 `
    --self-contained false `
    -p:PublishSingleFile=false `
    -p:Version=$Version `
    -o .\publish

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "      Build completed successfully" -ForegroundColor Green

# Update version in ISS file
Write-Host ""
Write-Host "[4/5] Creating installer with Inno Setup..." -ForegroundColor Yellow

$issContent = Get-Content ".\installer.iss" -Raw
$issContent = $issContent -replace '#define MyAppVersion ".*"', "#define MyAppVersion `"$Version`""
$issContent | Out-File ".\installer.iss" -Encoding UTF8 -Force

Write-Host "      Running Inno Setup compiler..." -ForegroundColor Gray

# Compile with Inno Setup
& $innoSetupPath ".\installer.iss" /Q

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Inno Setup compilation failed!" -ForegroundColor Red
    exit 1
}

Write-Host "      Installer created successfully" -ForegroundColor Green

# Verify output
Write-Host ""
Write-Host "[5/5] Verifying outputs..." -ForegroundColor Yellow

$setupFile = Get-ChildItem ".\InnoSetup-Output\SentjaCloudSetup-$Version.exe" -ErrorAction SilentlyContinue

if ($setupFile) {
    $setupSize = [math]::Round($setupFile.Length / 1MB, 2)
    Write-Host "      Setup.exe: $setupSize MB" -ForegroundColor Green
} else {
    Write-Host "      Setup.exe not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Build Completed Successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installer location:" -ForegroundColor Cyan
Write-Host "   $($setupFile.FullName)" -ForegroundColor White
Write-Host ""
Write-Host "Features:" -ForegroundColor Cyan
Write-Host "   - Setup wizard with UI" -ForegroundColor Green
Write-Host "   - Device registration (device name only)" -ForegroundColor Green
Write-Host "   - Desktop shortcut option" -ForegroundColor Green
Write-Host "   - Auto-start option" -ForegroundColor Green
Write-Host "   - Clean uninstall (removes shortcuts)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "   1. Test the installer" -ForegroundColor White
Write-Host "   2. Distribute to users" -ForegroundColor White
Write-Host ""
