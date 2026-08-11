# ⚡ Quick Setup - Sentja Cloud

## ✅ Yang Sudah Running:
- Backend API: Port 3000
- Admin Panel: Port 5173  
- Windows Tray App: PID aktif

## ❌ Yang Belum:
- Windows Service (untuk file sync)
- Migration engine

## 🚀 Cara Install Service:

```powershell
# 1. Build service
cd cloud-client
dotnet publish SentjaCloudService -c Release -r win-x64 --self-contained false

# 2. Install as Windows Service (butuh admin)
sc create SentjaCloudService binPath="D:\website\sentjs-cloud\cloud-client\SentjaCloudService\bin\Release\net10.0\publish\SentjaCloudService.exe" start=auto

# 3. Start service
sc start SentjaCloudService

# 4. Check status
sc query SentjaCloudService
```

## 📝 Catatan:
- Service ini yang handle file sync & migration
- Tanpa service, file tidak akan di-upload otomatis
- Tray app hanya untuk UI dan login

## 🎯 Untuk Testing Cepat Tanpa Service:
Migration status akan tetap "—" sampai service running atau manual upload via API.

**Status saat ini:** Sistem berjalan tapi file sync belum aktif.