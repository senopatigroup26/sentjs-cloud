# Build and Package Sentja Cloud Client with Clowd.Squirrel
# Usage: .\build-installer.ps1 -Version "1.0.0"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Sentja Cloud Installer Builder v$Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Clean previous builds
Write-Host "[1/7] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path ".\Releases") {
    Remove-Item ".\Releases" -Recurse -Force
    Write-Host "      Removed old Releases folder" -ForegroundColor Gray
}
if (Test-Path ".\publish") {
    Remove-Item ".\publish" -Recurse -Force
    Write-Host "      Removed old publish folder" -ForegroundColor Gray
}

# Build the application
Write-Host ""
Write-Host "[2/7] Building Release version..." -ForegroundColor Yellow
dotnet publish SentjaTray\SentjaTray.csproj `
    -c Release `
    -r win-x64 `
    --self-contained false `
    -p:PublishSingleFile=false `
    -p:Version=$Version `
    -p:IncludeNativeLibrariesForSelfExtract=false `
    -o .\publish

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "      Build completed successfully" -ForegroundColor Green

# Create Releases directory
Write-Host ""
Write-Host "[3/7] Creating Releases directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".\Releases" -Force | Out-Null
Write-Host "      Directory created" -ForegroundColor Green

# Check for Squirrel
Write-Host ""
Write-Host "[4/7] Checking for Squirrel..." -ForegroundColor Yellow

$squirrelExe = $null

# Check in NuGet packages
$possiblePaths = @(
    "$env:USERPROFILE\.nuget\packages\clowd.squirrel\2.11.1\tools\Squirrel.exe",
    "$env:USERPROFILE\.nuget\packages\clowd.squirrel\2.11.0\tools\Squirrel.exe",
    ".\packages\Clowd.Squirrel.2.11.1\tools\Squirrel.exe"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $squirrelExe = $path
        Write-Host "      Found Squirrel at: $path" -ForegroundColor Green
        break
    }
}

if (-not $squirrelExe) {
    Write-Host "      Squirrel not found. Downloading..." -ForegroundColor Yellow
    
    # Download Clowd.Squirrel NuGet package
    $nugetUrl = "https://www.nuget.org/api/v2/package/Clowd.Squirrel/2.11.1"
    $nugetZip = ".\clowd.squirrel.2.11.1.nupkg.zip"
    $extractPath = ".\tools\Clowd.Squirrel"
    
    Invoke-WebRequest -Uri $nugetUrl -OutFile $nugetZip
    Expand-Archive -Path $nugetZip -DestinationPath $extractPath -Force
    Remove-Item $nugetZip
    
    $squirrelExe = "$extractPath\tools\Squirrel.exe"
    
    if (Test-Path $squirrelExe) {
        Write-Host "      Squirrel downloaded successfully" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Failed to download Squirrel!" -ForegroundColor Red
        Write-Host "Please install manually or use portable version" -ForegroundColor Yellow
        exit 1
    }
}

# Pack with Squirrel
Write-Host ""
Write-Host "[5/7] Creating installer with Clowd.Squirrel..." -ForegroundColor Yellow

$iconPath = (Resolve-Path ".\SentjaTray\Resources\logo.ico").Path
if (-not (Test-Path $iconPath)) {
    Write-Host "      Warning: Icon not found" -ForegroundColor Yellow
    $iconPath = $null
}

# Build squirrel command
$squirrelArgs = @(
    "pack"
    "--packId=SentjaCloud"
    "--packVersion=$Version"
    "--packDirectory=.\publish"
    "--releaseDir=.\Releases"
    "--packTitle=Sentja Cloud"
    "--packAuthors=Sentja Group"
    "--allowUnaware"
)

if ($iconPath) {
    $squirrelArgs += "--icon=$iconPath"
}

Write-Host "      Running Squirrel..." -ForegroundColor Gray
& $squirrelExe @squirrelArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Squirrel packaging failed!" -ForegroundColor Red
    Write-Host "Using portable version instead..." -ForegroundColor Yellow
    
    # Create portable ZIP as fallback
    $zipPath = ".\Releases\SentjaCloud-$Version-Portable.zip"
    Compress-Archive -Path ".\publish\*" -DestinationPath $zipPath -Force
    
    Write-Host ""
    Write-Host "Portable version created: $zipPath" -ForegroundColor Green
    exit 0
}

Write-Host "      Installer created successfully" -ForegroundColor Green

# Verify outputs
Write-Host ""
Write-Host "[6/7] Verifying outputs..." -ForegroundColor Yellow

$allFiles = Get-ChildItem ".\Releases" -File
foreach ($file in $allFiles) {
    $size = [math]::Round($file.Length / 1MB, 2)
    Write-Host "      $($file.Name): $size MB" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Build Completed Successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Create distribution ZIPs
Write-Host "[7/7] Creating distribution packages..." -ForegroundColor Yellow

$distDir = "D:\"
$installerZip = "$distDir\SentjaCloud-v$Version-Installer.zip"
$portableZip = "$distDir\SentjaCloud-v$Version-Portable.zip"

# Remove old ZIPs if exist
Remove-Item $installerZip -Force -ErrorAction SilentlyContinue
Remove-Item $portableZip -Force -ErrorAction SilentlyContinue

# Create Installer ZIP
$setupExe = Get-ChildItem ".\Releases\*Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($setupExe) {
    Compress-Archive -Path $setupExe.FullName -DestinationPath $installerZip -Force
    $installerSize = [math]::Round((Get-Item $installerZip).Length / 1MB, 2)
    Write-Host "      Installer ZIP: $installerSize MB" -ForegroundColor Green
}

# Create Portable ZIP
Compress-Archive -Path ".\publish\*" -DestinationPath $portableZip -Force
$portableSize = [math]::Round((Get-Item $portableZip).Length / 1MB, 2)
Write-Host "      Portable ZIP: $portableSize MB" -ForegroundColor Green

Write-Host ""
Write-Host "Distribution packages created:" -ForegroundColor Cyan
Write-Host "   Installer: $installerZip" -ForegroundColor White
Write-Host "   Portable:  $portableZip" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "   1. Test the installer" -ForegroundColor White
Write-Host "   2. Copy ZIP files to flashdisk" -ForegroundColor White
Write-Host "   3. Publish to GitHub Releases for auto-update" -ForegroundColor White
Write-Host ""
