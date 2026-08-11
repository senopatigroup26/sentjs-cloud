# Build and Package Sentja Cloud Client
# Usage: .\build-installer.ps1 -Version "1.0.0"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

Write-Host "Building Sentja Cloud Client v$Version..." -ForegroundColor Cyan

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path ".\Releases") {
    Remove-Item ".\Releases" -Recurse -Force
}
if (Test-Path ".\publish") {
    Remove-Item ".\publish" -Recurse -Force
}

# Build the application
Write-Host "Building application..." -ForegroundColor Yellow
dotnet publish SentjaTray\SentjaTray.csproj `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=false `
    -p:Version=$Version `
    -o .\publish

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Create NuSpec file for Squirrel
Write-Host "Creating NuSpec file..." -ForegroundColor Yellow
$nuspecContent = @"
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">
  <metadata>
    <id>SentjaCloud</id>
    <version>$Version</version>
    <title>Sentja Cloud</title>
    <authors>Sentja Group</authors>
    <owners>Sentja Group</owners>
    <description>Sentja Cloud Desktop Client - Sync your files seamlessly</description>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <projectUrl>https://github.com/senopatigroup26/sentjs-cloud</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/senopatigroup26/sentjs-cloud/main/cloud-client/SentjaTray/Resources/logo.ico</iconUrl>
    <copyright>Copyright 2026 Sentja Group</copyright>
  </metadata>
  <files>
    <file src="publish\**" target="lib\net45" />
  </files>
</package>
"@

$nuspecContent | Out-File -FilePath ".\SentjaCloud.nuspec" -Encoding UTF8

# Install Squirrel tools if not present
$squirrelPath = "$env:USERPROFILE\.nuget\packages\squirrel.windows\2.0.1\tools"
if (!(Test-Path "$squirrelPath\Squirrel.exe")) {
    Write-Host "Installing Squirrel tools..." -ForegroundColor Yellow
    dotnet tool install --global Squirrel.Windows --version 2.0.1
}

# Create NuGet package
Write-Host "Creating NuGet package..." -ForegroundColor Yellow
nuget pack SentjaCloud.nuspec -OutputDirectory .

# Create Squirrel release
Write-Host "Creating Squirrel release..." -ForegroundColor Yellow
$nugetPackage = "SentjaCloud.$Version.nupkg"

if (!(Test-Path $nugetPackage)) {
    Write-Host "NuGet package not found: $nugetPackage" -ForegroundColor Red
    exit 1
}

# Use Squirrel to create installer
& "$squirrelPath\Squirrel.exe" `
    --releasify $nugetPackage `
    --releaseDir .\Releases `
    --setupIcon .\SentjaTray\Resources\logo.ico `
    --icon .\SentjaTray\Resources\logo.ico `
    --no-msi

if ($LASTEXITCODE -ne 0) {
    Write-Host "Squirrel packaging failed!" -ForegroundColor Red
    exit 1
}

# Cleanup
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item $nugetPackage -Force
Remove-Item ".\SentjaCloud.nuspec" -Force

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installer location: .\Releases\Setup.exe" -ForegroundColor Cyan
Write-Host "Updates location: .\Releases\" -ForegroundColor Cyan
Write-Host ""
Write-Host "To publish updates:" -ForegroundColor Yellow
Write-Host "1. Upload all files in .\Releases\ to GitHub Releases" -ForegroundColor Yellow
Write-Host "2. Tag the release with v$Version" -ForegroundColor Yellow
Write-Host ""
