# 📘 Sentja Cloud - User Guide

## 🎯 **PERBEDAAN ANTARA ADMIN DAN USER**

### 👨‍💼 **Admin Panel** (Web Dashboard)
- **URL:** `http://localhost:5173` (production: `https://admin.sentja.cloud`)
- **Untuk:** IT Admin / Superadmin perusahaan
- **Login:** `admin@sentja.internal` / `Admin@2026!`
- **Fungsi:**
  - Manage users (create, edit, deactivate)
  - Monitor devices (online status, policies)
  - View files (browse cloud storage)
  - Approve/deny permissions (USB, copy, export)
  - View audit logs (semua aktivitas user)

### 💻 **Windows Client** (Desktop App)
- **Untuk:** End-user biasa (karyawan)
- **Cara Install:** Double-click installer atau run PowerShell scripts
- **Login:** Setiap user punya akun sendiri (bukan admin)
- **Fungsi:**
  - Sync files ke cloud
  - Access files on-demand
  - Request permissions (USB, copy files)
  - View migration status

---

## 🔐 **CARA REGISTER USER BARU**

### **Option 1: Via Admin Panel** (Recommended)
1. Login ke admin panel sebagai admin
2. Go to **Users** page
3. Click **"Create User"**
4. Isi:
   - Email: `user@company.com`
   - Name: `John Doe`
   - Password: `userpass123`
   - Role: **user** (bukan admin!)
5. Save → User bisa login di Windows Client

### **Option 2: Via API Registration Endpoint**
Windows Client bisa menambahkan fitur "Register" di login window:

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@company.com",
  "name": "John Doe",
  "password": "userpass123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@company.com",
      "name": "John Doe",
      "role": "user"
    }
  }
}
```

---

## 📁 **HETZNER STORAGE STRUCTURE**

### **Per-Device Isolation**
Setiap device memiliki folder terpisah di Hetzner Storage Box:

```
/sentja/                           ← HETZNER_BASE_PATH
  ├── devices/
  │   ├── {device-id-1}/           ← Folder per device
  │   │   ├── Documents/
  │   │   ├── Pictures/
  │   │   └── Desktop/
  │   ├── {device-id-2}/
  │   │   ├── Documents/
  │   │   └── Downloads/
  │   └── {device-id-3}/
  │       └── Projects/
  └── shared/                      ← Optional: shared files
      └── company-docs/
```

### **Device ID Format**
- Setiap device registration menghasilkan unique `device_id`
- Device ID digunakan sebagai folder name di Hetzner
- Example: `/sentja/devices/abc123-def456-xyz789/Documents/file.pdf`

### **Backend Implementation**
```typescript
// Upload file with device isolation
await uploadBuffer('Documents/report.pdf', fileBuffer, deviceId);
// → Uploads to: /sentja/devices/{deviceId}/Documents/report.pdf

// Download file
await downloadBuffer('Documents/report.pdf', deviceId);
// → Downloads from: /sentja/devices/{deviceId}/Documents/report.pdf
```

---

## 🔄 **ALUR LENGKAP: USER REGISTRATION → FILE SYNC**

### **Step 1: Admin Creates User**
```
Admin Panel → Users → Create User
  ↓
Database: INSERT INTO users (email, name, role='user', password_hash)
  ↓
User can now login to Windows Client
```

### **Step 2: User Login & Device Registration**
```
Windows Client → Login with user credentials
  ↓
POST /api/auth/login
  ← Returns: access_token, refresh_token
  ↓
POST /api/devices/register (with token)
  → Send: machine_name, machine_id, os_version
  ← Returns: device_id, device_token
  ↓
Device ID stored locally: C:\ProgramData\Sentja\device.json
```

### **Step 3: File Sync to Hetzner**
```
User adds file to C:\SentjaCloud\Documents\report.pdf
  ↓
Windows Service detects file change (FileSystemWatcher)
  ↓
Calculate file hash (SHA256)
  ↓
POST /api/files/upload-prepare
  → Send: file_name, size_bytes, checksum, device_id
  ↓
Upload to Hetzner SFTP
  → Path: /sentja/devices/{device_id}/Documents/report.pdf
  ↓
POST /api/files/upload-complete
  → Update database: status='synced'
  ↓
Convert local file to placeholder (dehydrate)
```

### **Step 4: Admin Monitors**
```
Admin Panel → Devices
  → View: Device online status, last seen
Admin Panel → Files
  → View: All files per device
  → Download: Any file from any device
Admin Panel → Audit Logs
  → Track: FILE_UPLOADED, FILE_DOWNLOADED, etc.
```

---

## 🛠️ **TESTING THE SYSTEM**

### **Test 1: Admin Panel**
```bash
# 1. Open browser
http://localhost:5173

# 2. Login
Email: admin@sentja.internal
Password: Admin@2026!

# 3. Verify
✓ Dashboard shows 1 user, 0 devices
✓ Users page accessible
✓ Create new user works
```

### **Test 2: Windows Client Login (as admin - for testing only)**
```bash
# 1. Run tray app (PID 20088 is running now)

# 2. Login
Email: admin@sentja.internal
Password: Admin@2026!

# 3. Expected result
✓ Device registered in database
✓ Admin panel → Devices shows 1 device
✓ System tray icon shows "Connected"
```

### **Test 3: Create Real User & Login**
```bash
# 1. Admin Panel → Users → Create User
Email: john@company.com
Name: John Doe
Password: john123
Role: user

# 2. Logout from Windows Client (right-click tray → Logout)

# 3. Login as john
Email: john@company.com
Password: john123

# 4. Expected result
✓ New device registered for John
✓ Admin panel shows 2 devices
✓ John's files go to /sentja/devices/{john-device-id}/
```

### **Test 4: File Sync**
```bash
# 1. Create file
echo "test" > C:\SentjaCloud\Documents\test.txt

# 2. Check migration status
Right-click tray → Migration Status

# 3. Verify in Admin Panel
Admin Panel → Files → Should see test.txt

# 4. Verify in Hetzner
# Files should be at: /sentja/devices/{device-id}/Documents/test.txt
```

---

## ⚠️ **COMMON ISSUES & FIXES**

### **Issue 1: "No such host" error**
**Cause:** Cached config file with wrong API URL

**Fix:**
```powershell
Remove-Item "C:\ProgramData\Sentja\config.json" -Force
# Restart tray app
```

### **Issue 2: JSON parsing error in login**
**Cause:** API response format mismatch

**Fix:** Already fixed in latest build
- Added `[JsonPropertyName]` attributes
- Response now properly parses `access_token` → `AccessToken`

### **Issue 3: HETZNER_SFTP_PASSWORD empty**
**Cause:** .env file not configured

**Fix:**
```env
# Edit server/.env
HETZNER_SFTP_HOST=u123456.your-storagebox.de
HETZNER_SFTP_USER=u123456
HETZNER_SFTP_PASSWORD=your-actual-password
```

### **Issue 4: Admin login di Windows Client**
**Cause:** Misunderstanding - admin seharusnya login di web, bukan client

**Solution:**
- **Admin** → Use web dashboard (http://localhost:5173)
- **Regular user** → Use Windows Client
- Admin bisa login ke client untuk testing, tapi production seharusnya terpisah

---

## 📊 **DATABASE SCHEMA UNTUK REFERENCE**

### **users**
- `id` (UUID)
- `email` (unique)
- `name`
- `role` ('user' | 'admin' | 'superadmin')
- `password_hash`

### **devices**
- `id` (UUID)
- `user_id` → FK to users
- `machine_name`
- `machine_id`
- `status` ('online' | 'offline')
- `last_seen_at`

### **files**
- `id` (UUID)
- `device_id` → FK to devices
- `user_id` → FK to users
- `file_name`
- `local_path`
- `remote_path` → Path di Hetzner (includes device_id in path)
- `size_bytes`
- `checksum`
- `status` ('pending' | 'syncing' | 'synced' | 'error')

---

## 🚀 **PRODUCTION DEPLOYMENT CHECKLIST**

### **Backend (VPS)**
- [ ] Deploy Node.js backend dengan PM2
- [ ] Setup Nginx reverse proxy
- [ ] SSL certificate (Let's Encrypt)
- [ ] Configure Hetzner Storage Box
- [ ] Update .env dengan production values
- [ ] Run migrations: `npm run migrate`
- [ ] Create superadmin: `npm run seed`

### **Admin Panel**
- [ ] Build: `npm run build`
- [ ] Deploy static files ke Nginx/CDN
- [ ] Update API URL ke production

### **Windows Client**
- [ ] Update ApiBaseUrl ke production URL
- [ ] Code signing certificate untuk .exe
- [ ] Build MSI installer
- [ ] Test on clean Windows machine
- [ ] Deploy via Group Policy or SCCM

---

**Version:** 1.0.0  
**Last Updated:** August 10, 2026  
**Support:** support@sentja.cloud