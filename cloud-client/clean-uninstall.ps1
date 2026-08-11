# Clean Uninstall - Sentja Cloud
# Removes application and all user data

Write-Host "Sentja Cloud - Clean Uninstall" -ForegroundColor Cyan
Write-Host "This will remove the application and ALL user data." -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Continue? (yes/no)"
if ($confirmation -ne 'yes') {
    Write-Host "Uninstall cancelled." -ForegroundColor Yellow
    exit
}

# 1. Run Squirrel uninstaller
Write-Host ""
Write-Host "Step 1: Uninstalling application..." -ForegroundColor Cyan
$appPath = "$env:LOCALAPPDATA\SentjaCloud"
if (Test-Path "$appPath\Update.exe") {
    & "$appPath\Update.exe" --uninstall
    Write-Host "Application uninstalled." -ForegroundColor Green
} else {
    Write-Host "Application not found or already uninstalled." -ForegroundColor Yellow
}

# Wait for uninstaller to complete
Start-Sleep -Seconds 3

# 2. Remove user data
Write-Host ""
Write-Host "Step 2: Removing user data..." -ForegroundColor Cyan

$userDataPaths = @(
    "$env:APPDATA\Sentja",
    "$env:PROGRAMDATA\Sentja",
    "$env:LOCALAPPDATA\SentjaCloud"
)

foreach ($path in $userDataPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force
        Write-Host "Removed: $path" -ForegroundColor Green
    }
}

# 3. Ask about sync folder
Write-Host ""
Write-Host "Step 3: Sync folder..." -ForegroundColor Cyan
$defaultSyncPath = "$env:USERPROFILE\Documents\Sentja Cloud"
if (Test-Path $defaultSyncPath) {
    Write-Host "Found sync folder: $defaultSyncPath" -ForegroundColor Yellow
    $removeSyncFolder = Read-Host "Remove sync folder? (yes/no)"
    if ($removeSyncFolder -eq 'yes') {
        Remove-Item -Path $defaultSyncPath -Recurse -Force
        Write-Host "Sync folder removed." -ForegroundColor Green
    } else {
        Write-Host "Sync folder kept." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Clean uninstall completed!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
