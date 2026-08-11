# Sentja Cloud - Installer Options

Ada 2 cara build installer untuk Sentja Cloud:

## 1. Inno Setup Installer (RECOMMENDED) ⭐

**Keuntungan:**
- ✅ Setup wizard dengan UI yang jelas
- ✅ Device registration saat install
- ✅ Progress bar dan status
- ✅ Desktop shortcut option
- ✅ Auto-start on Windows option
- ✅ Clean uninstall (shortcuts dihapus otomatis)
- ✅ Konfirmasi hapus data saat uninstall

**Requirements:**
- Download dan install [Inno Setup 6](https://jrsoftware.org/isdl.php)
- Install ke default location: `C:\Program Files (x86)\Inno Setup 6\`

**Build Command:**
```powershell
.\build-installer-inno.ps1 -Version "1.0.0"
```

**Output:**
```
.\InnoSetup-Output\SentjaCloudSetup-1.0.0.exe
```

**Install Flow:**
1. User double-click Setup.exe
2. Welcome screen
3. License agreement
4. **Device Registration** - input email/password
5. Choose install location
6. Select options (desktop shortcut, auto-start)
7. Install files dengan progress bar
8. Finish - option to launch app

---

## 2. Squirrel Installer (Alternative)

**Keuntungan:**
- ✅ Auto-update support
- ✅ Smaller file size
- ✅ Simple and fast

**Kekurangan:**
- ❌ No setup UI (silent install)
- ❌ No device registration wizard
- ❌ Shortcuts tidak terhapus saat uninstall
- ❌ User tidak tahu install progress

**Build Command:**
```powershell
.\build-installer.ps1 -Version "1.0.0"
```

**Output:**
```
.\Releases\SentjaCloudSetup.exe
D:\SentjaCloud-v1.0.0-Installer.zip
D:\SentjaCloud-v1.0.0-Portable.zip
```

---

## Comparison

| Feature | Inno Setup | Squirrel |
|---------|-----------|----------|
| Setup UI | ✅ Full wizard | ❌ Silent |
| Device Registration | ✅ During install | ❌ After install |
| Progress Indicator | ✅ Yes | ❌ No |
| Desktop Shortcut | ✅ User choice | ✅ Auto-created |
| Auto-start Option | ✅ User choice | ❌ Manual setup |
| Clean Uninstall | ✅ Complete | ⚠️ Leaves shortcuts |
| Auto-update | ❌ No | ✅ Yes |
| File Size | ~14 MB | ~13.5 MB |

---

## Recommendation

**For Production Distribution:** Use **Inno Setup**

Why?
1. User experience lebih baik dengan setup wizard
2. Device registration terintegrasi
3. User bisa pilih options (shortcuts, auto-start)
4. Uninstall lebih bersih
5. Lebih profesional

**For Development/Testing:** Use **Squirrel**

Why?
1. Faster build
2. Auto-update untuk testing
3. Simpler process

---

## Build Scripts Available

1. **build-installer-inno.ps1** - Build dengan Inno Setup (RECOMMENDED)
2. **build-installer.ps1** - Build dengan Squirrel + ZIP
3. **clean-install.ps1** - Clean old config before install
4. **clean-uninstall.ps1** - Complete uninstall dengan data removal
5. **publish-release.ps1** - Publish ke GitHub Releases

---

## Installation Guide for Users

### Using Inno Setup Installer:
1. Double-click `SentjaCloudSetup-1.0.0.exe`
2. Follow setup wizard
3. Enter Sentja Cloud credentials when prompted
4. Choose installation options
5. Click Finish to launch app

### Using Squirrel Installer:
1. Extract `SentjaCloud-v1.0.0-Installer.zip`
2. Run `SentjaCloudSetup.exe` (no UI, silent install)
3. Wait ~10 seconds
4. Check system tray for Sentja Cloud icon
5. Right-click → Login manually

### Using Portable Version:
1. Extract `SentjaCloud-v1.0.0-Portable.zip`
2. Run `SentjaTray.exe`
3. Login when prompted
4. No installation required

---

## Troubleshooting

### Inno Setup not found
Download from: https://jrsoftware.org/isdl.php
Install to: `C:\Program Files (x86)\Inno Setup 6\`

### Device registration fails during install
Check:
1. Internet connection
2. Backend API is running: https://api-cloud.sentjagroup.tech
3. Credentials are correct

### Shortcuts not removed after uninstall (Squirrel)
This is a known issue with Squirrel installer.
Solution: Use Inno Setup installer instead, or manually delete shortcuts.

---

## For Developers

### Adding new install steps to Inno Setup:
Edit `installer.iss` file, section `[Code]`

### Customizing UI:
Edit `installer.iss` file, sections:
- `[Setup]` - General settings
- `[Tasks]` - User options
- `[Files]` - Files to install
- `[Icons]` - Shortcuts
- `[Code]` - Custom Pascal script

### Testing installer:
```powershell
# Build
.\build-installer-inno.ps1 -Version "1.0.0-test"

# Install
.\InnoSetup-Output\SentjaCloudSetup-1.0.0-test.exe /SILENT

# Uninstall
C:\Program Files\Sentja Cloud\unins000.exe /SILENT
```
