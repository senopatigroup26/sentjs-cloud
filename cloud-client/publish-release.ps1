# Publish Sentja Cloud Client to GitHub Releases
# Requires: GitHub CLI (gh) installed
# Usage: .\publish-release.ps1 -Version "1.0.0" -Token "ghp_..."

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$Token,
    
    [Parameter(Mandatory=$false)]
    [string]$Notes = "Auto-update release for Sentja Cloud Client"
)

$ErrorActionPreference = "Stop"

Write-Host "Publishing Sentja Cloud Client v$Version to GitHub..." -ForegroundColor Cyan

# Check if Releases folder exists
if (!(Test-Path ".\Releases")) {
    Write-Host "Releases folder not found! Run build-installer.ps1 first." -ForegroundColor Red
    exit 1
}

# Check if gh CLI is installed
try {
    $ghVersion = gh --version
    Write-Host "GitHub CLI found: $($ghVersion[0])" -ForegroundColor Green
} catch {
    Write-Host "GitHub CLI not found! Install from: https://cli.github.com/" -ForegroundColor Red
    exit 1
}

# Login to GitHub if token provided
if ($Token) {
    Write-Host "Authenticating with GitHub..." -ForegroundColor Yellow
    $Token | gh auth login --with-token
}

# Check if authenticated
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not authenticated with GitHub! Run 'gh auth login' first." -ForegroundColor Red
    exit 1
}

# Create release tag
$tag = "v$Version"
Write-Host "Creating release $tag..." -ForegroundColor Yellow

try {
    # Create GitHub release
    gh release create $tag `
        --repo senopatigroup26/sentjs-cloud `
        --title "Sentja Cloud Client v$Version" `
        --notes "$Notes" `
        .\Releases\*
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "Release published successfully!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Release URL: https://github.com/senopatigroup26/sentjs-cloud/releases/tag/$tag" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Users will now receive auto-update notifications!" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "Failed to create release: $_" -ForegroundColor Red
    exit 1
}
