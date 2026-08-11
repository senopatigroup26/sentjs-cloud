# Clean Install Helper - Sentja Cloud
# Removes old config and app data before installing new version

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sentja Cloud - Clean Install Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if app is running
$processes = Get-Process | Where-Object { $_.ProcessName -like "*Sentja*" }
if ($processes) {
    Write-Host "WARNING: Sentja Cloud is currently running!" -ForegroundColor Yellow
    Write-Host "Processes found:" -ForegroundColor Yellow
    $processes | ForEach-Object { Write-Host "  - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Gray }
    Write-Host ""
    
    $killProc = Read-Host "Stop these processes? (yes/no)"
    if ($killProc -eq 'yes') {
        $processes | ForEach-Object { 
            Write-Host "  Stopping $($_.ProcessName)..." -ForegroundColor Yellow
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        Write-Host "  Processes stopped." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Please exit Sentja Cloud manually, then run this script again." -ForegroundColor Yellow
        exit
    }
}

Write-Host ""
Write-Host "This will remove:" -ForegroundColor Yellow
Write-Host "  - Old config file (C:\ProgramData\Sentja\config.json)" -ForegroundColor White
Write-Host "  - Database file (C:\ProgramData\Sentja\sentja.db)" -ForegroundColor White
Write-Host "  - Cache files (C:\ProgramData\Sentja\Cache\)" -ForegroundColor White
Write-Host "  - Token data (C:\Users\$env:USERNAME\AppData\Roaming\Sentja\)" -ForegroundColor White
Write-Host ""
Write-Host "This will KEEP:" -ForegroundColor Green
Write-Host "  - Your sync folder (C:\SentjaCloud\)" -ForegroundColor White
Write-Host "  - Installed application files" -ForegroundColor White
Write-Host ""

$confirmation = Read-Host "Continue? (yes/no)"
if ($confirmation -ne 'yes') {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "Cleaning old data..." -ForegroundColor Cyan

$pathsToClean = @(
    "C:\ProgramData\Sentja",
    "$env:APPDATA\Sentja"
)

$cleaned = 0
foreach ($path in $pathsToClean) {
    if (Test-Path $path) {
        try {
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "  Removed: $path" -ForegroundColor Green
            $cleaned++
        } catch {
            Write-Host "  Failed to remove: $path" -ForegroundColor Red
            Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Not found: $path (already clean)" -ForegroundColor Gray
    }
}

Write-Host ""
if ($cleaned -gt 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Cleanup completed!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Install/run new version from ZIP" -ForegroundColor White
    Write-Host "  2. App will create fresh config with production URL" -ForegroundColor White
    Write-Host "  3. Login with: owner@sge.com / password" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "No old data found - system is clean!" -ForegroundColor Green
    Write-Host ""
}
