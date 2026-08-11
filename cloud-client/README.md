# Sentja Cloud - Windows Desktop Client

Windows desktop application untuk Sentja Cloud dengan auto-update feature.

## Features

- ✅ **System Tray Integration** - Runs in background
- ✅ **Auto Device Registration** - Hardware-based authentication
- ✅ **File Sync** - Real-time file synchronization
- ✅ **Auto Updates** - Seamless updates via GitHub Releases
- ✅ **Offline Mode** - Works without internet connection
- ✅ **Security** - JWT authentication with refresh tokens

## Tech Stack

- **.NET 10** - Latest .NET framework
- **WPF** - Windows Presentation Foundation for UI
- **Squirrel.Windows** - Auto-update framework
- **System Tray** - Native Windows notifications

## Project Structure

```
cloud-client/
├── SentjaTray/              # Main WPF application
│   ├── Services/           # Update service, etc
│   ├── Resources/          # Icons, assets
│   └── *.xaml.cs          # UI components
├── SentjaCloudService/     # Background Windows Service
├── SentjaCfApi/            # API client library
├── SentjaShared/           # Shared utilities
├── SentjaMigration/        # File sync manager
└── scripts/                # Build & deployment scripts
```

## Development

### Prerequisites

- .NET 10 SDK
- Visual Studio 2022 (or Rider)
- NuGet CLI
- GitHub CLI (for publishing releases)

### Build & Run

```powershell
# Restore dependencies
dotnet restore

# Build
dotnet build

# Run
dotnet run --project SentjaTray/SentjaTray.csproj
```

## Build Installer

Build production installer with auto-update support:

```powershell
# Build version 1.0.0
.\build-installer.ps1 -Version "1.0.0"
```

Output:
- `Releases/Setup.exe` - Installer for first-time users
- `Releases/RELEASES` - Update manifest
- `Releases/*.nupkg` - Update packages

## Publish Release

Publish to GitHub Releases for auto-update:

```powershell
# Publish version 1.0.0
.\publish-release.ps1 -Version "1.0.0"
```

This will:
1. Create GitHub release with tag `v1.0.0`
2. Upload all installer files
3. Enable auto-update for existing users

## Auto-Update Flow

1. **App starts** → Check GitHub Releases for new version
2. **New version found** → Download update in background
3. **Download complete** → Notify user or auto-restart (configurable)
4. **Restart** → Apply update and launch new version

## Version Management

Version is defined in `SentjaTray/SentjaTray.csproj`:

```xml
<Version>1.0.0</Version>
<AssemblyVersion>1.0.0.0</AssemblyVersion>
<FileVersion>1.0.0.0</FileVersion>
```

Update this before building new releases.

## Configuration

Application settings stored in:
- `%PROGRAMDATA%\Sentja\config.json` - App configuration
- `%PROGRAMDATA%\Sentja\device_id.txt` - Device ID
- `%APPDATA%\Sentja\token.dat` - Authentication token

## Deployment Checklist

Before releasing new version:

- [ ] Update version in `SentjaTray.csproj`
- [ ] Test application locally
- [ ] Build installer: `.\build-installer.ps1 -Version "X.Y.Z"`
- [ ] Test installer on clean machine
- [ ] Publish release: `.\publish-release.ps1 -Version "X.Y.Z"`
- [ ] Verify auto-update on existing installation

## Troubleshooting

### Update Check Fails

- Verify GitHub repository is public
- Check internet connection
- Review logs in Event Viewer

### Installation Issues

- Run installer as Administrator
- Disable antivirus temporarily
- Check .NET 10 runtime is installed

### Sync Not Working

- Check API connection in system tray
- Verify device is registered
- Check sync folder permissions

## License

MIT License - Copyright (c) 2026 Sentja Group
