# Sentja Cloud Enterprise — Spesifikasi Teknis Lengkap

**Versi:** 1.0.0  
**Tanggal:** 2026-08-10  
**Status:** Draft  
**Penulis:** Tim Arsitektur Sentja

---

## Daftar Isi

1. [System Overview](#1-system-overview)
2. [Database Schema (PostgreSQL)](#2-database-schema-postgresql)
3. [REST API Endpoints](#3-rest-api-endpoints)
4. [Windows Client Architecture](#4-windows-client-architecture)
5. [Folder Structure Proyek](#5-folder-structure-proyek)
6. [Implementation Phases](#6-implementation-phases)
7. [Security Considerations](#7-security-considerations)

---

## 1. System Overview

### 1.1 Deskripsi Sistem

Sentja Cloud Enterprise adalah solusi enterprise cloud drive terintegrasi dengan endpoint security yang memungkinkan organisasi menyimpan seluruh file kerja di cloud (Hetzner Storage Box) sambil memberikan pengalaman akses file seperti drive lokal di Windows Explorer — mirip dengan mekanisme OneDrive. Sistem ini dilengkapi dengan lapisan keamanan untuk mengontrol perpindahan data (export, copy, USB) melalui approval workflow yang dikelola admin.


### 1.2 Diagram Arsitektur (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SENTJA CLOUD ENTERPRISE                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│       WINDOWS ENDPOINT           │      │         WEB ADMIN PANEL          │
│                                  │      │         (Browser-Based)          │
│  ┌─────────────────────────┐    │      │                                  │
│  │   Windows Explorer      │    │      │  ┌──────────────────────────┐   │
│  │   (Placeholder Files)   │    │      │  │  User & Device Mgmt      │   │
│  └────────────┬────────────┘    │      │  │  Migration Config        │   │
│               │ CfAPI           │      │  │  Permission Approval     │   │
│  ┌────────────▼────────────┐    │      │  │  USB Policy              │   │
│  │   SentjaCfApi           │    │      │  │  Audit Log Viewer        │   │
│  │   (CF Provider)         │    │      │  └──────────┬───────────────┘   │
│  └────────────┬────────────┘    │      └─────────────┼────────────────────┘
│               │                 │                    │
│  ┌────────────▼────────────┐    │                    │ HTTPS REST API
│  │   SentjaCloudService    │◄───┼────────────────────┤
│  │   (Windows Service)     │    │      ┌─────────────▼────────────────────┐
│  │   - Sync Engine         │    │      │         BACKEND API              │
│  │   - Cache Manager       │    │      │      (Node.js + TypeScript)      │
│  │   - Upload Queue        │    │      │                                  │
│  │   - Permission Check    │    │      │  ┌───────────┐  ┌─────────────┐ │
│  └────────────┬────────────┘    │      │  │  Auth &   │  │  File Mgmt  │ │
│               │                 │      │  │  JWT      │  │  Service    │ │
│  ┌────────────▼────────────┐    │      │  └───────────┘  └─────────────┘ │
│  │   SentjaMigration       │    │      │  ┌───────────┐  ┌─────────────┐ │
│  │   - Scan Engine         │    │      │  │ Permission │  │  Audit Log  │ │
│  │   - Hash Engine         │    │      │  │ Manager   │  │  Service    │ │
│  │   - Upload Engine       │    │      │  └───────────┘  └─────────────┘ │
│  │   - Verify Engine       │    │      │                                  │
│  │   - Dehydrate Engine    │    │      │  ┌──────────────────────────────┐│
│  └────────────┬────────────┘    │      │  │       PostgreSQL DB          ││
│               │                 │      │  └──────────────────────────────┘│
│  ┌────────────▼────────────┐    │      │                │                  │
│  │   SentjaDriver          │    │      └────────────────┼──────────────────┘
│  │   (Minifilter Driver)   │    │                       │ SFTP
│  │   - USB Block           │    │      ┌────────────────▼──────────────────┐
│  │   - Copy Intercept      │    │      │        HETZNER STORAGE BOX        │
│  └─────────────────────────┘    │      │          (File Storage)           │
└──────────────────────────────────┘      └───────────────────────────────────┘
```


### 1.3 Data Flow Utama

#### 1.3.1 Alur Akses File (Download-on-Demand)

```
User double-click file di Explorer
        │
        ▼
Windows CfAPI → memanggil CF_CALLBACK_TYPE_FETCH_DATA
        │
        ▼
SentjaCfApi (CF Provider) menerima callback
        │
        ▼
Cek: apakah file ada di local cache?
   ├── Ya → hydrate dari cache lokal → file terbuka
   └── Tidak → request ke SentjaCloudService
                    │
                    ▼
             Cek permission di backend API
             GET /api/permissions/check?device_id=&file_id=
                    │
                    ▼
             Download dari Hetzner Storage Box via SFTP (streaming)
                    │
                    ▼
             SentjaCfApi melaporkan kemajuan ke CfAPI (progress reporting)
                    │
                    ▼
             File di-hydrate → Windows membuka aplikasi default
                    │
                    ▼
             Cache entry dicatat di local DB (SQLite)
```

#### 1.3.2 Alur Upload / Save Back

```
User save/modify file di local
        │
        ▼
File change terdeteksi oleh FileSystemWatcher
        │
        ▼
SentjaCloudService enqueue upload job
        │
        ▼
Hitung SHA-256 checksum file baru
        │
        ▼
Upload ke Hetzner Storage Box via SFTP
        │
        ▼
Notify backend: POST /api/files/upload-complete
  { device_id, remote_path, checksum_sha256, size }
        │
        ▼
Backend update record di tabel files
        │
        ▼
Audit log dicatat: action = FILE_UPLOADED
        │
        ▼
File status di-update: SYNCED
```

#### 1.3.3 Alur Migration Engine

```
Admin set migration config via Web Admin Panel
POST /api/migration/config
  { device_id, folders: ["C:\Users\...\Documents", ...] }
        │
        ▼
SentjaCloudService menerima config (polling/webhook)
        │
        ▼
[PHASE 1: SCAN]
Rekursif scan semua folder target
  → catat setiap file: path, size, last_modified
  → simpan di migration_jobs
        │
        ▼
[PHASE 2: HASH]
Hitung SHA-256 untuk setiap file
  → update migration_jobs.files[].checksum
        │
        ▼
[PHASE 3: UPLOAD]
Upload file ke Hetzner Storage Box
  → path remote = /{org_id}/{device_id}/{relative_path}
  → update status: UPLOADING → UPLOADED
  → progress dilaporkan ke backend
        │
        ▼
[PHASE 4: VERIFY]
Re-download hash dari Hetzner, bandingkan dengan checksum lokal
  → MATCH → status: VERIFIED
  → MISMATCH → re-upload, max 3 retries → jika gagal: ERROR
        │
        ▼
[PHASE 5: DEHYDRATE]
Hanya jika VERIFIED:
  → Hapus konten lokal (bukan file — jadikan placeholder CfAPI)
  → File tetap terlihat di Explorer, status: OFFLINE
  → local disk space dibebaskan
```

#### 1.3.4 Alur Permission & USB Check

```
User mencoba copy file ke USB / eksternal
        │
        ▼
SentjaDriver (minifilter) intercept IRP_MJ_CREATE ke USB drive
        │
        ▼
Kirim event ke SentjaCloudService (via IOCTL / named pipe)
        │
        ▼
SentjaCloudService cek USB policy:
  GET /api/devices/:id → usb_policy
  ├── BLOCK → driver diberi instruksi BLOCK → copy gagal
  ├── ALLOW → driver diberi instruksi ALLOW → copy diizinkan
  └── REQUIRE_PERMISSION →
            │
            ▼
        Cek apakah ada permission aktif:
        GET /api/permissions/check?device_id=&action=usb&file_id=
            ├── GRANTED → ALLOW
            └── NOT GRANTED →
                      │
                      ▼
                  POST /api/permissions/request
                  { device_id, action: "usb", file_id, reason }
                      │
                      ▼
                  Notif ke admin di Web Panel
                  Admin approve/deny
                      │
                      ├── APPROVE → SentjaCloudService polling deteksi
                      │            → driver ALLOW, copy jalan
                      └── DENY → driver BLOCK → notif ke user
```

### 1.4 Component Interaction

| Komponen | Berinteraksi Dengan | Protokol |
|---|---|---|
| SentjaCfApi | Windows CfAPI | Win32 API (CfApi.dll) |
| SentjaCfApi | SentjaCloudService | Named Pipe / COM |
| SentjaCloudService | Backend API | HTTPS REST |
| SentjaCloudService | Hetzner Storage Box | SFTP (SSH.NET) |
| SentjaCloudService | SentjaDriver | IOCTL / Named Pipe |
| SentjaDriver | Windows Kernel | Filter Manager API |
| Backend API | PostgreSQL | TCP (pg driver) |
| Backend API | Hetzner Storage Box | SFTP (ssh2 npm) |
| Web Admin Panel | Backend API | HTTPS REST |

---


## 2. Database Schema (PostgreSQL)

Semua tabel menggunakan UUID v4 sebagai primary key. Timestamps menggunakan `TIMESTAMPTZ` (timezone-aware). Semua tabel memiliki kolom `created_at` dan `updated_at` yang dikelola otomatis via trigger.

### 2.1 Tabel `users`

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('superadmin', 'admin', 'user')),
    password_hash   VARCHAR(255) NOT NULL,      -- bcrypt hash
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);
```

**Catatan:**
- `role = superadmin` hanya dapat dibuat via CLI/seeding, tidak lewat API publik.
- `password_hash` menggunakan bcrypt dengan cost factor minimal 12.
- `is_active = FALSE` digunakan untuk soft-disable akun tanpa menghapus history.


### 2.2 Tabel `devices`

```sql
CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    machine_name    VARCHAR(255) NOT NULL,       -- hostname Windows
    machine_id      VARCHAR(255) NOT NULL UNIQUE, -- Windows MachineGuid dari registry
    os_version      VARCHAR(100),                -- e.g. "Windows 11 Pro 23H2"
    client_version  VARCHAR(50),                 -- versi SentjaCloudService
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'suspended', 'decommissioned')),
    last_seen_at    TIMESTAMPTZ,
    last_ip         INET,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id    ON devices(user_id);
CREATE INDEX idx_devices_machine_id ON devices(machine_id);
CREATE INDEX idx_devices_status     ON devices(status);
```

**Catatan:**
- `machine_id` diambil dari `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` pada saat device registration.
- `status = pending` artinya device belum disetujui admin; client tidak bisa sync.
- `status = suspended` artinya device dinonaktifkan sementara; semua operasi diblokir.


### 2.3 Tabel `files`

```sql
CREATE TABLE files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    remote_path         TEXT NOT NULL,           -- path di Hetzner: /{org}/{device_id}/path/to/file.docx
    local_path          TEXT NOT NULL,           -- path asli di endpoint: C:\Users\...\Documents\file.docx
    file_name           VARCHAR(500) NOT NULL,
    file_extension      VARCHAR(50),
    checksum_sha256     CHAR(64),                -- SHA-256 hex digest, NULL jika belum diupload
    size_bytes          BIGINT,
    mime_type           VARCHAR(200),
    status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending',           -- terdaftar, belum diupload
                            'uploading',         -- sedang diupload
                            'uploaded',          -- sudah di Hetzner, belum diverifikasi
                            'synced',            -- verified, placeholder aktif
                            'cached',            -- konten ada di local cache
                            'dehydrated',        -- placeholder, konten sudah dihapus lokal
                            'error'              -- gagal, perlu perhatian
                        )),
    last_accessed_at    TIMESTAMPTZ,
    last_modified_at    TIMESTAMPTZ,
    dehydrated_at       TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_device_id        ON files(device_id);
CREATE INDEX idx_files_status           ON files(status);
CREATE INDEX idx_files_remote_path      ON files(device_id, remote_path);
CREATE INDEX idx_files_checksum         ON files(checksum_sha256);
```

**Catatan:**
- `remote_path` bersifat unik per `device_id` — satu file di satu device punya satu record.
- `checksum_sha256` di-set setelah fase HASH di migration engine.
- Perubahan `status` selalu disertai entry di `audit_logs`.


### 2.4 Tabel `migration_configs`

```sql
CREATE TABLE migration_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    folders         JSONB NOT NULL DEFAULT '[]',
                    -- Array of: { "local_path": "C:\\Users\\...", "include_extensions": ["*"], "exclude_patterns": [] }
    schedule        JSONB,
                    -- { "type": "immediate" | "scheduled", "run_at": "2026-08-11T00:00:00Z" }
    status          VARCHAR(50) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
    notes           TEXT,
    activated_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_configs_device_id ON migration_configs(device_id);
CREATE INDEX idx_migration_configs_status    ON migration_configs(status);
```

**Catatan:**
- Setiap `device_id` hanya boleh memiliki satu config dengan `status = active` dalam satu waktu.
- `folders` menggunakan JSONB untuk fleksibilitas konfigurasi per-folder (extension filter, exclude pattern).
- Constraint enforced di aplikasi: tidak ada dua active config untuk device yang sama.


### 2.5 Tabel `migration_jobs`

```sql
CREATE TABLE migration_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id           UUID NOT NULL REFERENCES migration_configs(id),
    device_id           UUID NOT NULL REFERENCES devices(id),
    current_phase       VARCHAR(50) NOT NULL DEFAULT 'idle'
                        CHECK (current_phase IN (
                            'idle', 'scanning', 'hashing', 'uploading',
                            'verifying', 'dehydrating', 'completed', 'failed', 'paused'
                        )),
    total_files         INTEGER NOT NULL DEFAULT 0,
    total_size_bytes    BIGINT NOT NULL DEFAULT 0,
    scanned_count       INTEGER NOT NULL DEFAULT 0,
    hashed_count        INTEGER NOT NULL DEFAULT 0,
    uploaded_count      INTEGER NOT NULL DEFAULT 0,
    verified_count      INTEGER NOT NULL DEFAULT 0,
    dehydrated_count    INTEGER NOT NULL DEFAULT 0,
    failed_count        INTEGER NOT NULL DEFAULT 0,
    error_details       JSONB DEFAULT '[]',
                        -- Array of: { "file_path": "...", "error": "...", "retries": 2 }
    started_at          TIMESTAMPTZ,
    paused_at           TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    last_progress_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_jobs_config_id  ON migration_jobs(config_id);
CREATE INDEX idx_migration_jobs_device_id  ON migration_jobs(device_id);
CREATE INDEX idx_migration_jobs_phase      ON migration_jobs(current_phase);
```

**Catatan:**
- Satu `config_id` dapat memiliki banyak `migration_jobs` jika ada retry atau resume.
- `error_details` menyimpan array file yang gagal beserta alasan dan jumlah retry.
- `last_progress_at` diupdate setiap kali ada progress report dari client.


### 2.6 Tabel `permissions`

```sql
CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    device_id       UUID NOT NULL REFERENCES devices(id),
    file_id         UUID REFERENCES files(id),  -- NULL = berlaku untuk semua file di device
    action          VARCHAR(50) NOT NULL
                    CHECK (action IN ('export', 'copy', 'usb', 'print', 'screenshot')),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'revoked')),
    request_reason  TEXT,                        -- alasan yang diberikan user/device
    granted_by      UUID REFERENCES users(id),   -- admin yang approve/deny
    deny_reason     TEXT,                        -- alasan penolakan
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,                 -- kapan permission kadaluarsa
    used_at         TIMESTAMPTZ,                 -- kapan pertama kali digunakan
    used_count      INTEGER NOT NULL DEFAULT 0,
    max_uses        INTEGER,                     -- NULL = unlimited
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_user_id    ON permissions(user_id);
CREATE INDEX idx_permissions_device_id  ON permissions(device_id);
CREATE INDEX idx_permissions_file_id    ON permissions(file_id);
CREATE INDEX idx_permissions_status     ON permissions(status);
CREATE INDEX idx_permissions_action     ON permissions(action);
CREATE INDEX idx_permissions_expires_at ON permissions(expires_at);
```

**Catatan:**
- Permission dengan `file_id = NULL` bersifat global untuk device tersebut.
- `expires_at` memungkinkan permission sementara (misal: izin copy 1 hari).
- `max_uses` memungkinkan permission sekali pakai (`max_uses = 1`).
- Background job secara periodik men-set `status = expired` untuk permission yang sudah lewat `expires_at`.


### 2.7 Tabel `audit_logs`

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),    -- NULL untuk sistem/device event
    device_id       UUID REFERENCES devices(id),  -- NULL untuk pure admin event
    action          VARCHAR(100) NOT NULL,
                    -- Contoh: FILE_ACCESSED, FILE_UPLOADED, FILE_DEHYDRATED,
                    --         USB_BLOCKED, USB_ALLOWED, PERMISSION_REQUESTED,
                    --         PERMISSION_APPROVED, PERMISSION_DENIED,
                    --         DEVICE_REGISTERED, DEVICE_SUSPENDED,
                    --         MIGRATION_STARTED, MIGRATION_COMPLETED,
                    --         USER_LOGIN, USER_LOGOUT, ADMIN_ACTION
    detail_json     JSONB,                         -- data kontekstual spesifik per action
    ip_address      INET,
    user_agent      TEXT,
    severity        VARCHAR(20) NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info', 'warning', 'critical')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs tidak memiliki updated_at — immutable setelah dibuat
CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_device_id  ON audit_logs(device_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity   ON audit_logs(severity);
```

**Catatan:**
- Tabel ini bersifat append-only. Tidak ada UPDATE atau DELETE (enforced by aplikasi dan row-level security).
- `detail_json` menyimpan data kontekstual: untuk `FILE_ACCESSED` menyimpan `{ file_id, file_path, size_bytes }`, untuk `USB_BLOCKED` menyimpan `{ usb_device_id, vendor_id, product_id }`.
- Partisi tabel berdasarkan bulan direkomendasikan untuk produksi skala besar.


### 2.8 Tabel `usb_policies`

```sql
CREATE TABLE usb_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE UNIQUE,
                    -- UNIQUE: satu device hanya punya satu policy aktif
    policy          VARCHAR(50) NOT NULL DEFAULT 'block'
                    CHECK (policy IN ('block', 'allow', 'require_permission')),
    allow_known_devices BOOLEAN NOT NULL DEFAULT FALSE,
                    -- jika TRUE, USB yang sudah di-whitelist boleh langsung lewat
    whitelisted_usb JSONB DEFAULT '[]',
                    -- Array of: { "vendor_id": "0781", "product_id": "5571", "label": "SanDisk Cruzer" }
    updated_by      UUID NOT NULL REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usb_policies_device_id ON usb_policies(device_id);
```

**Catatan:**
- Default policy adalah `block` — semua USB diblokir kecuali ada konfigurasi eksplisit.
- `allow_known_devices` memungkinkan USB tertentu di-whitelist (misal USB milik IT departemen).
- Perubahan policy selalu dicatat di `audit_logs` dengan action `USB_POLICY_CHANGED`.

### 2.9 Tabel `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE CASCADE,
    token_hash      CHAR(64) NOT NULL UNIQUE,    -- SHA-256 dari refresh token
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    last_used_at    TIMESTAMPTZ,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_device_id ON refresh_tokens(device_id);
CREATE INDEX idx_refresh_tokens_expires   ON refresh_tokens(expires_at);
```

**Catatan:**
- Token aktual tidak disimpan, hanya hash-nya (SHA-256).
- Background job membersihkan token expired setiap 24 jam.

---


## 3. REST API Endpoints

**Base URL:** `https://api.sentja.internal/api`  
**Content-Type:** `application/json`  
**Authentication:** Bearer token (JWT) via header `Authorization: Bearer <token>`  
**API Version:** v1 (prefix `/api/v1/` digunakan di produksi; spec ini menggunakan `/api/` untuk singkatnya)

### Konvensi Response

**Sukses:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "pagination": { ... } }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "DEVICE_NOT_FOUND",
    "message": "Perangkat dengan ID tersebut tidak ditemukan.",
    "details": {}
  }
}
```

**HTTP Status Codes yang Digunakan:**
- `200 OK` — request berhasil
- `201 Created` — resource baru berhasil dibuat
- `400 Bad Request` — input tidak valid
- `401 Unauthorized` — token tidak ada / expired
- `403 Forbidden` — tidak punya akses
- `404 Not Found` — resource tidak ditemukan
- `409 Conflict` — konflik state (misal device sudah terdaftar)
- `429 Too Many Requests` — rate limit
- `500 Internal Server Error` — error server

---

### 3.1 Auth

#### `POST /api/auth/login`
Login user via email dan password. Mengembalikan access token (JWT) dan refresh token.

**Request Body:**
```json
{
  "email": "user@company.com",
  "password": "plaintextPassword"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "eyJhbGci...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "user": {
      "id": "uuid",
      "email": "user@company.com",
      "name": "John Doe",
      "role": "admin"
    }
  }
}
```

**Response `401 Unauthorized`:**
```json
{
  "success": false,
  "error": { "code": "INVALID_CREDENTIALS", "message": "Email atau password salah." }
}
```

---

#### `POST /api/auth/device-register`
Registrasi perangkat baru. Dipanggil oleh SentjaCloudService saat pertama kali diinstall. Membutuhkan user JWT.

**Headers:** `Authorization: Bearer <user_access_token>`

**Request Body:**
```json
{
  "machine_name": "DESKTOP-ABC123",
  "machine_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "os_version": "Windows 11 Pro 23H2",
  "client_version": "1.0.0"
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "device_id": "uuid",
    "status": "pending",
    "message": "Perangkat berhasil didaftarkan. Menunggu persetujuan admin.",
    "device_access_token": "eyJhbGci...",
    "device_refresh_token": "eyJhbGci..."
  }
}
```

**Response `409 Conflict`:**
```json
{
  "success": false,
  "error": { "code": "DEVICE_ALREADY_REGISTERED", "message": "Perangkat ini sudah terdaftar." }
}
```

---

#### `POST /api/auth/refresh`
Perbarui access token menggunakan refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGci..."
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "expires_in": 3600
  }
}
```

---


### 3.2 Devices

#### `GET /api/devices`
Daftar semua device. Hanya untuk admin.

**Query Params:**
- `status` (opsional): filter by status (`pending`, `active`, `suspended`)
- `user_id` (opsional): filter by user
- `page` (default: 1), `limit` (default: 20)

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user_name": "John Doe",
      "machine_name": "DESKTOP-ABC123",
      "machine_id": "...",
      "os_version": "Windows 11 Pro 23H2",
      "client_version": "1.0.0",
      "status": "active",
      "last_seen_at": "2026-08-10T10:00:00Z",
      "last_ip": "192.168.1.10"
    }
  ],
  "meta": { "pagination": { "total": 42, "page": 1, "limit": 20, "total_pages": 3 } }
}
```

---

#### `GET /api/devices/:id`
Detail satu device. Admin bisa lihat semua; user hanya bisa lihat device miliknya sendiri.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "machine_name": "DESKTOP-ABC123",
    "status": "active",
    "last_seen_at": "2026-08-10T10:00:00Z",
    "usb_policy": {
      "policy": "require_permission",
      "allow_known_devices": false
    },
    "migration_status": {
      "has_active_config": true,
      "job_phase": "uploading",
      "progress_percent": 67
    },
    "file_stats": {
      "total_files": 1240,
      "synced": 832,
      "pending": 408
    }
  }
}
```

---

#### `PUT /api/devices/:id/policy`
Update status device (approve/suspend/decommission). Hanya admin.

**Request Body:**
```json
{
  "status": "active",
  "reason": "Device telah diverifikasi oleh IT."
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": { "id": "uuid", "status": "active", "updated_at": "2026-08-10T10:05:00Z" }
}
```

---

#### `GET /api/devices/:id/status`
Digunakan oleh Windows client untuk heartbeat dan cek status device. Juga memperbarui `last_seen_at` dan `last_ip`.

**Headers:** `Authorization: Bearer <device_access_token>`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "device_status": "active",
    "usb_policy": "require_permission",
    "has_pending_migration": true,
    "server_time": "2026-08-10T10:00:00Z"
  }
}
```

**Response `403 Forbidden`** jika device `status = suspended`:
```json
{
  "success": false,
  "error": { "code": "DEVICE_SUSPENDED", "message": "Perangkat ini telah dinonaktifkan oleh admin." }
}
```

---


### 3.3 Files

#### `GET /api/files`
Daftar file untuk device tertentu. Bisa difilter per path (untuk navigasi folder virtual).

**Query Params:**
- `device_id` (wajib): UUID device
- `path` (opsional): filter file dalam folder tertentu, e.g. `C:\Users\John\Documents`
- `status` (opsional): filter by status file
- `page`, `limit`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "file_name": "laporan_q3.docx",
      "local_path": "C:\\Users\\John\\Documents\\laporan_q3.docx",
      "remote_path": "/org1/device-uuid/Users/John/Documents/laporan_q3.docx",
      "size_bytes": 204800,
      "checksum_sha256": "a3b4c5...",
      "status": "synced",
      "last_modified_at": "2026-08-09T14:30:00Z",
      "last_accessed_at": "2026-08-10T08:00:00Z"
    }
  ],
  "meta": { "pagination": { "total": 1240, "page": 1, "limit": 20 } }
}
```

---

#### `POST /api/files/upload-complete`
Dipanggil oleh Windows client setelah berhasil upload file ke Hetzner. Backend akan verify checksum.

**Headers:** `Authorization: Bearer <device_access_token>`

**Request Body:**
```json
{
  "device_id": "uuid",
  "local_path": "C:\\Users\\John\\Documents\\laporan_q3.docx",
  "remote_path": "/org1/device-uuid/Users/John/Documents/laporan_q3.docx",
  "file_name": "laporan_q3.docx",
  "checksum_sha256": "a3b4c5...",
  "size_bytes": 204800,
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "last_modified_at": "2026-08-09T14:30:00Z"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "file_id": "uuid",
    "status": "synced",
    "verified": true
  }
}
```

**Response `409 Conflict`** jika checksum tidak cocok dengan file di Hetzner:
```json
{
  "success": false,
  "error": {
    "code": "CHECKSUM_MISMATCH",
    "message": "Checksum file tidak cocok. Upload mungkin corrupt.",
    "details": { "expected": "a3b4c5...", "actual": "f6e7d8..." }
  }
}
```

---

#### `DELETE /api/files/:id/local`
Tandai file sebagai dehydrated (konten lokal sudah dihapus, hanya placeholder).

**Headers:** `Authorization: Bearer <device_access_token>`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": { "file_id": "uuid", "status": "dehydrated", "dehydrated_at": "2026-08-10T10:30:00Z" }
}
```

---


### 3.4 Migration

#### `POST /api/migration/config`
Admin membuat konfigurasi migration untuk device tertentu.

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "device_id": "uuid",
  "folders": [
    {
      "local_path": "C:\\Users\\John\\Documents",
      "include_extensions": ["*"],
      "exclude_patterns": ["~$*", "*.tmp", "Thumbs.db"]
    },
    {
      "local_path": "C:\\Users\\John\\Desktop",
      "include_extensions": ["docx", "xlsx", "pdf"],
      "exclude_patterns": []
    }
  ],
  "schedule": {
    "type": "immediate"
  },
  "notes": "Migration awal untuk perangkat John - Q3 2026"
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "config_id": "uuid",
    "device_id": "uuid",
    "status": "active",
    "created_at": "2026-08-10T10:00:00Z"
  }
}
```

---

#### `GET /api/migration/:device_id/status`
Status migration terkini untuk sebuah device.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "device_id": "uuid",
    "has_active_config": true,
    "config_id": "uuid",
    "active_job": {
      "job_id": "uuid",
      "current_phase": "uploading",
      "total_files": 1240,
      "total_size_bytes": 5368709120,
      "scanned_count": 1240,
      "hashed_count": 1240,
      "uploaded_count": 832,
      "verified_count": 800,
      "dehydrated_count": 780,
      "failed_count": 3,
      "progress_percent": 67,
      "started_at": "2026-08-10T08:00:00Z",
      "estimated_completion": "2026-08-10T14:00:00Z"
    }
  }
}
```

---

#### `POST /api/migration/:device_id/start`
Instruksikan client untuk memulai/melanjutkan migration. Dipanggil oleh admin.

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "config_id": "uuid"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "started",
    "message": "Instruksi migration telah dikirim ke client."
  }
}
```

---

#### `GET /api/migration/:job_id/progress`
Progress detail migration job tertentu. Digunakan oleh Web Admin Panel untuk polling.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "config_id": "uuid",
    "device_id": "uuid",
    "current_phase": "uploading",
    "phases": {
      "scan":      { "status": "completed", "count": 1240, "completed_at": "2026-08-10T08:05:00Z" },
      "hash":      { "status": "completed", "count": 1240, "completed_at": "2026-08-10T08:30:00Z" },
      "upload":    { "status": "in_progress", "count": 832, "total": 1240 },
      "verify":    { "status": "in_progress", "count": 800, "total": 832 },
      "dehydrate": { "status": "in_progress", "count": 780, "total": 800 }
    },
    "failed_files": [
      { "file_path": "C:\\Users\\John\\Documents\\locked.docx", "error": "File sedang digunakan oleh proses lain", "retries": 2 }
    ],
    "last_progress_at": "2026-08-10T11:00:00Z"
  }
}
```

---


### 3.5 Permissions

#### `POST /api/permissions/request`
Client meminta permission untuk action tertentu (biasanya diinisiasi karena USB/copy terdeteksi).

**Headers:** `Authorization: Bearer <device_access_token>`

**Request Body:**
```json
{
  "device_id": "uuid",
  "action": "usb",
  "file_id": "uuid",
  "request_reason": "Perlu meng-copy laporan ke USB untuk presentasi offline."
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "permission_id": "uuid",
    "status": "pending",
    "message": "Permintaan dikirim ke admin. Menunggu persetujuan.",
    "estimated_response_time": null
  }
}
```

---

#### `GET /api/permissions/pending`
Daftar semua permission request yang belum diproses. Hanya admin.

**Query Params:**
- `device_id` (opsional)
- `action` (opsional)
- `page`, `limit`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "name": "John Doe", "email": "john@company.com" },
      "device": { "id": "uuid", "machine_name": "DESKTOP-ABC123" },
      "file": { "id": "uuid", "file_name": "laporan_q3.docx", "local_path": "C:\\..." },
      "action": "usb",
      "request_reason": "Perlu meng-copy laporan ke USB untuk presentasi offline.",
      "requested_at": "2026-08-10T11:30:00Z"
    }
  ],
  "meta": { "pagination": { "total": 5 } }
}
```

---

#### `PUT /api/permissions/:id/approve`
Admin approve permission request.

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "expires_at": "2026-08-10T23:59:00Z",
  "max_uses": 1,
  "notes": "Diizinkan untuk keperluan presentasi 10 Agustus 2026."
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "permission_id": "uuid",
    "status": "approved",
    "expires_at": "2026-08-10T23:59:00Z",
    "max_uses": 1
  }
}
```

---

#### `PUT /api/permissions/:id/deny`
Admin deny permission request.

**Headers:** `Authorization: Bearer <admin_access_token>`

**Request Body:**
```json
{
  "deny_reason": "Data bersifat rahasia dan tidak boleh dibawa keluar kantor."
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": { "permission_id": "uuid", "status": "denied" }
}
```

---

#### `GET /api/permissions/check`
Client cek apakah ada permission aktif untuk action tertentu. Dipanggil sebelum izinkan copy/USB.

**Headers:** `Authorization: Bearer <device_access_token>`

**Query Params:**
- `device_id` (wajib)
- `action` (wajib): `export`, `copy`, `usb`
- `file_id` (opsional)

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "granted": true,
    "permission_id": "uuid",
    "expires_at": "2026-08-10T23:59:00Z",
    "remaining_uses": 1
  }
}
```

Jika tidak ada permission aktif:
```json
{
  "success": true,
  "data": {
    "granted": false,
    "reason": "Tidak ada permission aktif untuk action ini."
  }
}
```

---


### 3.6 Audit

#### `GET /api/audit`
Daftar audit log. Hanya admin.

**Query Params:**
- `device_id` (opsional)
- `user_id` (opsional)
- `action` (opsional): filter by action type
- `severity` (opsional): `info`, `warning`, `critical`
- `from` (opsional): ISO 8601, e.g. `2026-08-01T00:00:00Z`
- `to` (opsional): ISO 8601
- `page`, `limit`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "name": "John Doe" },
      "device": { "id": "uuid", "machine_name": "DESKTOP-ABC123" },
      "action": "USB_BLOCKED",
      "severity": "warning",
      "detail_json": {
        "usb_vendor_id": "0781",
        "usb_product_id": "5571",
        "usb_label": "SanDisk Cruzer"
      },
      "ip_address": "192.168.1.10",
      "created_at": "2026-08-10T09:15:00Z"
    }
  ],
  "meta": { "pagination": { "total": 5234, "page": 1, "limit": 20 } }
}
```

---

#### `POST /api/audit/log`
Client mengirim event audit ke backend. Digunakan untuk log file access, USB event, dll.

**Headers:** `Authorization: Bearer <device_access_token>`

**Request Body:**
```json
{
  "action": "FILE_ACCESSED",
  "severity": "info",
  "detail_json": {
    "file_id": "uuid",
    "file_path": "C:\\Users\\John\\Documents\\laporan_q3.docx",
    "size_bytes": 204800,
    "hydration_source": "hetzner"
  },
  "ip_address": "192.168.1.10",
  "occurred_at": "2026-08-10T09:00:00Z"
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "data": { "log_id": "uuid" }
}
```

---

### 3.7 Admin

#### `GET /api/admin/users`
Daftar semua user. Hanya admin/superadmin.

**Query Params:** `role`, `is_active`, `page`, `limit`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@company.com",
      "name": "John Doe",
      "role": "user",
      "is_active": true,
      "last_login_at": "2026-08-10T08:00:00Z",
      "device_count": 2,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

#### `POST /api/admin/users`
Buat user baru. Hanya superadmin/admin.

**Request Body:**
```json
{
  "email": "newuser@company.com",
  "name": "Jane Smith",
  "role": "user",
  "password": "TemporaryPass123!"
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "data": { "id": "uuid", "email": "newuser@company.com", "name": "Jane Smith", "role": "user" }
}
```

---

#### `PUT /api/admin/users/:id`
Update data user (nama, role, status aktif). Superadmin bisa ubah semua; admin tidak bisa ubah role ke superadmin.

**Request Body:**
```json
{
  "name": "Jane Smith Updated",
  "role": "admin",
  "is_active": true
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": { "id": "uuid", "name": "Jane Smith Updated", "role": "admin", "updated_at": "..." }
}
```

---

#### `GET /api/admin/dashboard`
Summary statistik untuk dashboard admin.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "total_users": 45,
    "total_devices": 62,
    "devices_by_status": { "active": 55, "pending": 5, "suspended": 2 },
    "total_files_synced": 98420,
    "total_storage_bytes": 549755813888,
    "active_migrations": 3,
    "pending_permissions": 7,
    "critical_audit_events_today": 2,
    "usb_blocks_today": 14
  }
}
```

---


## 4. Windows Client Architecture

### 4.1 Service Structure

Windows client terdiri dari empat komponen utama yang berjalan bersama:

```
┌─────────────────────────────────────────────────────────────┐
│                    WINDOWS ENDPOINT                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              USER SESSION (Interactive)             │   │
│  │                                                     │   │
│  │  ┌──────────────────┐   ┌─────────────────────┐    │   │
│  │  │  Windows Explorer │   │  SentjaTray.exe     │    │   │
│  │  │  (Shell Extension)│   │  (Tray App / GUI)   │    │   │
│  │  │  - Placeholder    │   │  - Status indicator │    │   │
│  │  │    file display   │   │  - Manual sync      │    │   │
│  │  │  - Progress badge │   │  - Migration wizard │    │   │
│  │  └────────┬──────────┘   │  - Settings         │    │   │
│  │           │ CfAPI         └──────────┬──────────┘    │   │
│  └───────────┼───────────────────────────┼───────────────┘   │
│              │                           │ Named Pipe         │
│  ┌───────────▼───────────────────────────▼───────────────┐   │
│  │           SentjaCloudService.exe (Windows Service)    │   │
│  │           Session 0, NT AUTHORITY\SYSTEM              │   │
│  │                                                       │   │
│  │  ┌─────────────────┐  ┌─────────────────────────┐    │   │
│  │  │  SentjaCfApi    │  │   Sync Engine            │    │   │
│  │  │  (CF Provider)  │  │   - FileSystemWatcher    │    │   │
│  │  │  CfConnectSync  │  │   - Upload Queue         │    │   │
│  │  └─────────────────┘  │   - Polling (30s)        │    │   │
│  │                        └─────────────────────────┘    │   │
│  │  ┌─────────────────┐  ┌─────────────────────────┐    │   │
│  │  │  Cache Manager  │  │   Migration Engine       │    │   │
│  │  │  SQLite local   │  │   (State Machine)        │    │   │
│  │  │  LRU eviction   │  │   Scan/Hash/Upload/      │    │   │
│  │  └─────────────────┘  │   Verify/Dehydrate       │    │   │
│  │                        └─────────────────────────┘    │   │
│  │  ┌─────────────────┐  ┌─────────────────────────┐    │   │
│  │  │  Permission Mgr │  │   SFTP Client            │    │   │
│  │  │  - Request/Poll │  │   (SSH.NET)              │    │   │
│  │  │  - Cache result │  │   - Upload/Download      │    │   │
│  │  └─────────────────┘  └─────────────────────────┘    │   │
│  │                                                       │   │
│  └──────────────────────────────┬────────────────────────┘   │
│                                 │ IOCTL / Named Pipe          │
│  ┌──────────────────────────────▼────────────────────────┐   │
│  │            SentjaDriver.sys (Minifilter Driver)       │   │
│  │            Kernel Mode, altitude 365000               │   │
│  │                                                       │   │
│  │   - IRP_MJ_CREATE intercept untuk USB/eksternal       │   │
│  │   - Volume identification (USB, Network Drive, dll)   │   │
│  │   - Block/Allow berdasarkan policy dari Service       │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 CfAPI Integration Flow

Windows Cloud Files API (CfAPI) adalah framework Microsoft untuk implementasi cloud drive seperti OneDrive. Sentja mengimplementasikan **Sync Root Provider** menggunakan CfAPI.

#### 4.2.1 Registrasi Sync Root

Saat SentjaCloudService pertama kali dijalankan, ia mendaftarkan diri sebagai sync root provider:

```csharp
// Registrasi sync root
var registration = new StorageProviderSyncRootInfo
{
    Id = "SentjaCloudEnterprise!user@company.com!Device",
    Path = StorageFolder.GetFolderFromPathAsync(@"C:\SentjaCloud").GetResults(),
    DisplayName = "Sentja Cloud",
    IconResource = @"%ProgramFiles%\Sentja\sentja.ico",
    Version = "1.0",
    RecycleBinUri = new Uri("https://api.sentja.internal"),
    ShowSiblingsAsGroup = false,
    HardlinkPolicy = StorageProviderHardlinkPolicy.None,
    InSyncPolicy = StorageProviderInSyncPolicy.FileCreationTime | StorageProviderInSyncPolicy.FileReadOnlyAttribute,
    PopulationPolicy = StorageProviderPopulationPolicy.AlwaysFull
};
StorageProviderSyncRootManager.Register(registration);
```

#### 4.2.2 CF Provider Callback Handlers

```csharp
// Handler yang harus diimplementasikan:

// Dipanggil saat user membuka file yang masih OFFLINE (placeholder)
CF_CALLBACK_TYPE_FETCH_DATA
→ Download file dari Hetzner via SFTP
→ Laporkan progress ke CfAPI dengan CfReportProviderProgress()
→ Transfer data dengan CfExecute(CF_OPERATION_TYPE_TRANSFER_DATA)

// Dipanggil saat Windows butuh validasi placeholder
CF_CALLBACK_TYPE_VALIDATE_DATA
→ Konfirmasi data sudah valid

// Dipanggil saat file dimodifikasi
CF_CALLBACK_TYPE_NOTIFY_FILE_CLOSE_WRITE
→ Enqueue file ke upload queue
→ Set status CfAPI ke SYNC_PENDING

// Dipanggil saat Windows ingin dehydrate
CF_CALLBACK_TYPE_NOTIFY_DEHYDRATE
→ Update status lokal ke DEHYDRATED
→ Update backend API
```


### 4.3 Placeholder File Lifecycle

Setiap file dalam cloud drive memiliki lifecycle state yang dikelola oleh CfAPI dan SentjaCloudService:

```
                    [File baru ditemukan / migration]
                              │
                              ▼
                    ┌─────────────────┐
                    │   PLACEHOLDER   │  ← File ada di Explorer, ikon awan
                    │   (OFFLINE)     │    konten belum ada lokal
                    │   CF_PIN_STATE  │    size = 0 bytes lokal
                    │   = UNPINNED    │
                    └────────┬────────┘
                             │
                    User double-click / pin / open
                             │
                             ▼
                    ┌─────────────────┐
                    │   HYDRATING     │  ← Progress bar di Explorer
                    │   (PARTIAL)     │    download streaming dari Hetzner
                    │   CF_IN_SYNC    │
                    │   = NOT_IN_SYNC │
                    └────────┬────────┘
                             │
                    Download selesai, data valid
                             │
                             ▼
                    ┌─────────────────┐
                    │    FULL LOCAL   │  ← File ada penuh di disk
                    │   (HYDRATED)    │    ikon hijau/check
                    │   CF_IN_SYNC    │    tersedia offline
                    │   = IN_SYNC     │
                    └────────┬────────┘
                             │
               ┌─────────────┴──────────────┐
               │                            │
        User edit/save               LRU eviction / manual
               │                            │
               ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐
    │   SYNC_PENDING  │          │   DEHYDRATING   │
    │   (UPLOADING)   │          │                 │
    │   ikon sync     │          └────────┬────────┘
    └────────┬────────┘                   │
             │                   Dehydrate selesai
      Upload selesai +                    │
      backend confirm                     ▼
             │                  ┌─────────────────┐
             ▼                  │   PLACEHOLDER   │  ← kembali ke OFFLINE
    ┌─────────────────┐         │   (OFFLINE)     │
    │    IN_SYNC      │         └─────────────────┘
    │   (SYNCED)      │
    └─────────────────┘
```

**Aturan Dehydrasi:**
- File hanya dapat didehydrate setelah status `synced` (sudah terverifikasi di Hetzner).
- File yang sedang dibuka oleh aplikasi tidak dapat didehydrate.
- Minimum 1 jam sejak terakhir diakses sebelum auto-dehydrate.
- File yang di-pin oleh user (`CF_PIN_STATE = PINNED`) tidak pernah didehydrate.

### 4.4 Migration Engine State Machine

```
              [Admin aktifkan config]
                       │
                       ▼
              ┌────────────────┐
              │     IDLE       │
              └───────┬────────┘
                      │ Terima instruksi start
                      ▼
              ┌────────────────┐
         ┌───►│   SCANNING     │◄──── Resume jika paused
         │    │                │      Rekursif scan folder target
         │    │ total_files++  │      Tulis ke migration_jobs
         │    └───────┬────────┘
         │            │ Scan selesai
         │            ▼
         │    ┌────────────────┐
         │    │    HASHING     │      Hitung SHA-256 setiap file
         │    │                │      Batch 10 files paralel
         │    │ hashed_count++ │      Update checksum di DB lokal + backend
         │    └───────┬────────┘
         │            │ Hash selesai
         │            ▼
         │    ┌────────────────┐
         │    │   UPLOADING    │      Upload via SFTP ke Hetzner
         │    │                │      Concurrent upload: 3 file sekaligus
         │    │uploaded_count++│      Laporkan progress ke backend tiap 30 detik
         │    └───────┬────────┘
         │            │ Semua terupload
         │            ▼
         │    ┌────────────────┐
         │    │   VERIFYING    │      Re-fetch checksum dari Hetzner
         │    │                │      Bandingkan dengan checksum lokal
         │    │verified_count++│      MISMATCH → re-upload (max 3x)
         │    └───────┬────────┘
         │            │ Semua terverifikasi
         │            ▼
         │    ┌────────────────┐
         │    │  DEHYDRATING   │      CfDehydratePlaceholder()
         │    │                │      HANYA untuk file verified
         │    │dehydrated_count│      Konten lokal dihapus → placeholder
         │    └───────┬────────┘
         │            │ Semua didehydrate
         │            ▼
         │    ┌────────────────┐
         │    │   COMPLETED    │      Lapor ke backend
         │    └────────────────┘      Audit log: MIGRATION_COMPLETED
         │
Pause ───┤─── dari state manapun → PAUSED → resume
Error ───┘─── file gagal 3x → catat di error_details → lanjut ke file berikutnya
              Jika >10% file gagal → FAILED → notif admin
```


### 4.5 Local Cache Location dan Management

#### 4.5.1 Lokasi File

```
C:\ProgramData\Sentja\
├── cache\                          ← File yang di-hydrate (konten penuh)
│   ├── {device_id}\
│   │   ├── {sha256_prefix}\        ← 2 karakter pertama SHA-256
│   │   │   └── {sha256_full}.dat   ← konten file
│   │   └── ...
├── db\
│   └── sentja_local.db             ← SQLite: file index, sync state
├── logs\
│   ├── service.log
│   ├── migration.log
│   └── driver.log
├── config\
│   └── sentja.config.json          ← konfigurasi lokal (server URL, device_id)
└── temp\                           ← file upload sementara
    └── uploads\
```

#### 4.5.2 Skema SQLite Lokal

```sql
-- Tabel lokal untuk tracking sync state
CREATE TABLE local_files (
    id              TEXT PRIMARY KEY,    -- sama dengan file.id dari backend
    local_path      TEXT NOT NULL,
    remote_path     TEXT NOT NULL,
    checksum        TEXT,
    size_bytes      INTEGER,
    cf_pin_state    TEXT DEFAULT 'unpinned',  -- unpinned, pinned, excluded
    sync_state      TEXT DEFAULT 'offline',   -- offline, hydrating, hydrated, uploading, synced
    cached_at       INTEGER,                  -- Unix timestamp
    last_access     INTEGER,
    UNIQUE(local_path)
);

CREATE TABLE upload_queue (
    id              TEXT PRIMARY KEY,
    file_id         TEXT,
    local_path      TEXT NOT NULL,
    priority        INTEGER DEFAULT 5,    -- 1=highest, 10=lowest
    retries         INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'queued', -- queued, uploading, failed
    queued_at       INTEGER NOT NULL,
    started_at      INTEGER
);

CREATE TABLE migration_state (
    config_id       TEXT PRIMARY KEY,
    job_id          TEXT,
    current_phase   TEXT,
    last_file_idx   INTEGER DEFAULT 0,   -- untuk resume
    updated_at      INTEGER
);
```

#### 4.5.3 Cache Eviction Policy (LRU)

- **Maximum cache size:** dikonfigurasi admin, default 5 GB per device.
- **Eviction trigger:** ketika cache mencapai 90% kapasitas maksimum.
- **LRU algorithm:** file dengan `last_access` paling lama didehydrate lebih dulu.
- **Pengecualian eviction:**
  - File dengan `cf_pin_state = pinned`
  - File yang sedang digunakan oleh aplikasi (cek handle melalui NtQuerySystemInformation)
  - File dalam upload queue (belum selesai sync)
  - File yang dimodifikasi dalam 24 jam terakhir

### 4.6 Sync Engine

#### 4.6.1 Mekanisme Sinkronisasi

Sentja menggunakan pendekatan hybrid: **polling interval** + **FileSystemWatcher** + **backend webhook** (opsional).

```
┌──────────────────────────────────────────────────────────────┐
│                      SYNC ENGINE                             │
│                                                              │
│  ┌────────────────────┐    ┌───────────────────────────┐    │
│  │  FileSystemWatcher │    │    Heartbeat Polling      │    │
│  │  (upload trigger)  │    │    (setiap 30 detik)      │    │
│  │                    │    │    - Cek device status    │    │
│  │  - File created    │    │    - Cek pending migration│    │
│  │  - File modified   │    │    - Update last_seen_at  │    │
│  │  - File renamed    │    │    - Poll permission result│   │
│  │  - File deleted    │    └───────────────────────────┘    │
│  └────────────┬───────┘                                     │
│               │                                             │
│  ┌────────────▼───────────────────────────────────────┐    │
│  │              Upload Queue Manager                   │    │
│  │                                                     │    │
│  │  - Priority queue (FIFO dengan priority)            │    │
│  │  - Max 3 concurrent uploads                        │    │
│  │  - Exponential backoff pada retry                  │    │
│  │  - Pause jika device status != active              │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

#### 4.6.2 Penanganan Konflik

Jika file dimodifikasi di dua tempat (jarang karena single-device, tapi bisa terjadi):
1. Backend menyimpan `last_modified_at` untuk setiap file.
2. Saat upload, client mengirim `last_known_server_version` (ETag/timestamp).
3. Backend menolak upload dengan `409 Conflict` jika ada versi lebih baru di server.
4. Client mendownload versi server, user diminta memilih mana yang dipertahankan.
5. File konflik disimpan dengan suffix `_conflict_YYYYMMDD_HHMMSS`.

### 4.7 Permission Check Flow

```
User mencoba copy/save ke lokasi non-cloud (USB, network drive, lokal drive lain)
                              │
                              ▼
             SentjaDriver intercept IRP_MJ_CREATE
             Identifikasi: apakah target adalah removable/external?
                              │
                    ┌─────────┴──────────┐
                    │                    │
               Target USB          Target Network/
            atau removable         Drive lain
                    │                    │
                    ▼                    ▼
           Kirim event ke          Biarkan CfAPI
           SentjaCloudService      handle normal
           via Named Pipe
                    │
                    ▼
         Cek usb_policy dari cache lokal
         (refresh dari backend tiap 5 menit)
                    │
         ┌──────────┼─────────────────┐
         │          │                 │
       BLOCK      ALLOW          REQUIRE_PERMISSION
         │          │                 │
     Blokir IRP  Izinkan IRP    Cek permission cache
     Return      Return          (valid <= 5 menit)
     STATUS_     STATUS_              │
     ACCESS_     SUCCESS         ┌────┴─────────┐
     DENIED                      │              │
                             GRANTED        NOT GRANTED
                                 │              │
                            Izinkan IRP    POST /permissions/request
                                           Blokir IRP sementara
                                           Notif user via tray
                                           Poll setiap 10 detik
                                                │
                                         ┌──────┴──────┐
                                         │             │
                                    APPROVED        DENIED
                                         │             │
                                    Izinkan IRP   Blokir IRP
                                    Catat used_at  Notif user
```


### 4.8 USB Protection Approach (Minifilter Driver)

#### 4.8.1 Arsitektur Driver

SentjaDriver adalah **Windows Kernel-Mode Minifilter Driver** yang di-register pada **Filter Manager** (fltmgr.sys) dengan altitude number `365000` (range untuk activity monitoring).

```
Application Layer:
  Explorer.exe / App.exe
        │ WriteFile()
        ▼
Windows I/O Manager
        │ IRP_MJ_CREATE
        ▼
Filter Manager (fltmgr.sys)
        │ Pre-operation callback
        ▼
SentjaDriver.sys  ←── altitude 365000
        │ Analisis IRP
        │ Cek: apakah target volume adalah USB?
        │ Komunikasi dengan SentjaCloudService (via named pipe / shared memory)
        │
        ├── BLOCK → Return FLT_PREOP_COMPLETE, STATUS_ACCESS_DENIED
        └── ALLOW → Return FLT_PREOP_SUCCESS_WITH_CALLBACK
              │
              ▼
        Filter berikutnya / filesystem driver
        (NTFS, FAT32, exFAT)
```

#### 4.8.2 Identifikasi Volume USB

```csharp
// Identifikasi USB melalui:
// 1. Storage device property: BusType == BusTypeUsb
// 2. Volume GUID → IoGetDeviceObjectPointer → IOCTL_STORAGE_QUERY_PROPERTY
// 3. Device type: FILE_DEVICE_DISK dengan karakteristik removable

bool IsUsbVolume(PFLT_VOLUME Volume)
{
    STORAGE_DEVICE_DESCRIPTOR descriptor;
    // Query storage property untuk BusType
    // Return TRUE jika BusType == BusTypeUsb
}
```

#### 4.8.3 Komunikasi Driver ↔ Service

Driver berkomunikasi dengan SentjaCloudService melalui mekanisme **FltSendMessage** (filter communication port):

```
SentjaDriver.sys ──FltSendMessage──► SentjaCloudService.exe
                                              │
                                              ▼
                                    Cek policy di cache
                                    (atau query backend)
                                              │
                  SentjaDriver.sys ◄─────────── Response: BLOCK/ALLOW
```

Komunikasi ini menggunakan **kernel communication port** yang dibuat driver (`FltCreateCommunicationPort`) dan diakses service via `FilterConnectCommunicationPort`.

---


## 5. Folder Structure Proyek

```
sentjs-cloud/
│
├── client/                              ← Existing WPF app (legacy, akan di-refactor)
│   └── ...
│
├── server/                              ← NEW: Node.js + TypeScript Backend API
│   ├── src/
│   │   ├── routes/                      ← Express route definitions
│   │   │   ├── auth.routes.ts
│   │   │   ├── devices.routes.ts
│   │   │   ├── files.routes.ts
│   │   │   ├── migration.routes.ts
│   │   │   ├── permissions.routes.ts
│   │   │   ├── audit.routes.ts
│   │   │   └── admin.routes.ts
│   │   │
│   │   ├── controllers/                 ← Request handling, input validation
│   │   │   ├── auth.controller.ts
│   │   │   ├── devices.controller.ts
│   │   │   ├── files.controller.ts
│   │   │   ├── migration.controller.ts
│   │   │   ├── permissions.controller.ts
│   │   │   ├── audit.controller.ts
│   │   │   └── admin.controller.ts
│   │   │
│   │   ├── services/                    ← Business logic layer
│   │   │   ├── auth.service.ts          ← JWT, bcrypt, token management
│   │   │   ├── devices.service.ts       ← Device registration, status
│   │   │   ├── files.service.ts         ← File record management
│   │   │   ├── migration.service.ts     ← Migration config & job management
│   │   │   ├── permissions.service.ts   ← Permission workflow
│   │   │   ├── audit.service.ts         ← Audit log writing
│   │   │   ├── sftp.service.ts          ← Hetzner SFTP operations
│   │   │   └── notification.service.ts  ← Push notification ke admin (websocket)
│   │   │
│   │   ├── models/                      ← Database models (query builders)
│   │   │   ├── user.model.ts
│   │   │   ├── device.model.ts
│   │   │   ├── file.model.ts
│   │   │   ├── migration.model.ts
│   │   │   ├── permission.model.ts
│   │   │   ├── audit.model.ts
│   │   │   └── usb-policy.model.ts
│   │   │
│   │   ├── middleware/                  ← Express middleware
│   │   │   ├── auth.middleware.ts       ← JWT verification
│   │   │   ├── device-auth.middleware.ts ← Device token verification
│   │   │   ├── admin.middleware.ts      ← Role check (admin/superadmin)
│   │   │   ├── rate-limit.middleware.ts ← Rate limiting per IP/device
│   │   │   ├── validate.middleware.ts   ← Request body validation (zod)
│   │   │   └── error.middleware.ts      ← Global error handler
│   │   │
│   │   ├── utils/                       ← Utilities
│   │   │   ├── logger.ts                ← Winston logger
│   │   │   ├── crypto.ts                ← SHA-256, token generation
│   │   │   ├── pagination.ts            ← Pagination helper
│   │   │   └── date.ts                  ← Date utilities
│   │   │
│   │   ├── config/
│   │   │   ├── database.ts              ← PostgreSQL pool config
│   │   │   ├── sftp.ts                  ← Hetzner SFTP config
│   │   │   └── app.ts                   ← App-level config (JWT secret, dll)
│   │   │
│   │   ├── types/                       ← TypeScript type definitions
│   │   │   ├── express.d.ts             ← Augment Express Request
│   │   │   └── index.ts
│   │   │
│   │   └── app.ts                       ← Express app setup + main entry
│   │
│   ├── migrations/                      ← SQL migration files
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_devices.sql
│   │   ├── 003_create_files.sql
│   │   ├── 004_create_migration_tables.sql
│   │   ├── 005_create_permissions.sql
│   │   ├── 006_create_audit_logs.sql
│   │   ├── 007_create_usb_policies.sql
│   │   └── 008_create_refresh_tokens.sql
│   │
│   ├── seeds/                           ← Database seeders
│   │   └── 001_superadmin.ts
│   │
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   │
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── admin/                               ← NEW: Web Admin Panel
│   ├── src/
│   │   ├── pages/
│   │   │   ├── dashboard/
│   │   │   ├── users/
│   │   │   ├── devices/
│   │   │   ├── migration/
│   │   │   ├── permissions/
│   │   │   ├── audit/
│   │   │   └── settings/
│   │   │
│   │   ├── components/                  ← Reusable UI components
│   │   ├── services/                    ← API client calls
│   │   ├── stores/                      ← State management (Pinia/Zustand)
│   │   └── utils/
│   │
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── cloud-client/                        ← NEW: C# Windows Client
│   │
│   ├── SentjaCloudService/              ← Windows Service (main orchestrator)
│   │   ├── Service/
│   │   │   ├── SentjaService.cs         ← ServiceBase implementation
│   │   │   └── ServiceInstaller.cs
│   │   ├── Sync/
│   │   │   ├── SyncEngine.cs
│   │   │   ├── UploadQueue.cs
│   │   │   └── FileWatcher.cs
│   │   ├── Cache/
│   │   │   ├── CacheManager.cs
│   │   │   ├── LocalDatabase.cs         ← SQLite via Microsoft.Data.Sqlite
│   │   │   └── LruEvictor.cs
│   │   ├── Api/
│   │   │   ├── SentjaApiClient.cs       ← HttpClient wrapper
│   │   │   └── Models/                  ← DTO models
│   │   ├── Sftp/
│   │   │   └── HetznerSftpClient.cs     ← SSH.NET wrapper
│   │   ├── Permission/
│   │   │   ├── PermissionManager.cs
│   │   │   └── PermissionPoller.cs
│   │   └── SentjaCloudService.csproj
│   │
│   ├── SentjaCfApi/                     ← Cloud Files API provider
│   │   ├── CfProvider.cs                ← CF_CALLBACK registration
│   │   ├── FetchDataHandler.cs          ← Handle file hydration
│   │   ├── FileCloseWriteHandler.cs     ← Handle file save → trigger upload
│   │   ├── DehydrateHandler.cs
│   │   ├── PlaceholderManager.cs        ← Create/update placeholders
│   │   └── SentjaCfApi.csproj
│   │
│   ├── SentjaMigration/                 ← Migration engine
│   │   ├── MigrationOrchestrator.cs     ← State machine controller
│   │   ├── Phases/
│   │   │   ├── ScanPhase.cs
│   │   │   ├── HashPhase.cs
│   │   │   ├── UploadPhase.cs
│   │   │   ├── VerifyPhase.cs
│   │   │   └── DehydratePhase.cs
│   │   ├── Models/
│   │   │   ├── MigrationConfig.cs
│   │   │   └── MigrationJob.cs
│   │   └── SentjaMigration.csproj
│   │
│   ├── SentjaDriver/                    ← Minifilter driver (Phase 3)
│   │   ├── driver.c                     ← Driver entry point
│   │   ├── filter.c                     ← IRP callbacks
│   │   ├── communication.c              ← Named pipe ke service
│   │   ├── volume.c                     ← USB volume detection
│   │   ├── SentjaDriver.inf             ← Driver installation manifest
│   │   └── SentjaDriver.vcxproj
│   │
│   ├── SentjaTray/                      ← System tray application
│   │   ├── TrayApp.cs
│   │   ├── TrayIcon.cs
│   │   └── SentjaTray.csproj
│   │
│   └── SentjaCloudClient.sln            ← Solution file
│
└── installer/                           ← Installer scripts
    ├── sentja-setup.iss                 ← Inno Setup script
    ├── sign.ps1                         ← Code signing script
    └── build.ps1                        ← Build & package script
```

---


## 6. Implementation Phases

### 6.1 Phase 1 — Virtual Cloud Drive (Label: B)

**Tujuan:** Mengaktifkan Windows Cloud Drive berbasis CfAPI. User dapat melihat file sebagai placeholder di Explorer dan file ter-download otomatis saat dibuka (download-on-demand). Upload perubahan kembali ke cloud juga berfungsi.

**Deliverables:**

| Komponen | Deliverable |
|---|---|
| `server/` | Setup proyek Node.js + TypeScript + PostgreSQL |
| `server/` | Endpoints: Auth, Devices, Files (upload-complete, local delete) |
| `server/` | Database migrations: users, devices, files, refresh_tokens, audit_logs |
| `server/` | SFTP integration dengan Hetzner (download file untuk hydration) |
| `cloud-client/SentjaCfApi` | Registrasi sync root CfAPI |
| `cloud-client/SentjaCfApi` | Callback: FETCH_DATA (hydration dari Hetzner) |
| `cloud-client/SentjaCfApi` | Callback: NOTIFY_FILE_CLOSE_WRITE (trigger upload) |
| `cloud-client/SentjaCloudService` | Windows Service scaffold |
| `cloud-client/SentjaCloudService` | Upload Queue + FileSystemWatcher |
| `cloud-client/SentjaCloudService` | SFTP client (SSH.NET) untuk upload |
| `cloud-client/SentjaCloudService` | Heartbeat polling ke backend (30 detik) |
| `cloud-client/SentjaCloudService` | Cache Manager + SQLite local DB |
| `cloud-client/SentjaCloudService` | LRU eviction (dehydrate otomatis) |
| `cloud-client/SentjaTray` | System tray app: status indicator, manual sync |
| `admin/` | Halaman login + dashboard dasar |
| `admin/` | Daftar devices + approve/suspend device |

**Dependensi:**
- Akun Hetzner Storage Box sudah aktif dan kredensial SFTP tersedia.
- Sertifikat TLS untuk backend API (development: self-signed, produksi: Let's Encrypt).
- Windows SDK dengan CfApi.h tersedia di development environment.
- .NET 8 SDK untuk C# project.
- Node.js 20 LTS + PostgreSQL 16.

**Estimasi Kompleksitas:** ⭐⭐⭐⭐ (Tinggi)

Catatan: CfAPI memerlukan learning curve yang signifikan. Dokumentasi resmi Microsoft minim contoh end-to-end. Referensi utama: Windows Cloud Mirror sample di GitHub. SFTP streaming untuk file besar (>1GB) perlu handling khusus (chunked transfer + resume support).

---

### 6.2 Phase 2 — Initial Migration Engine (Label: A)

**Tujuan:** Membantu user memindahkan seluruh file lokal mereka ke cloud secara otomatis melalui proses 5 fase (Scan → Hash → Upload → Verify → Dehydrate) yang dapat di-resume jika terganggu.

**Deliverables:**

| Komponen | Deliverable |
|---|---|
| `server/` | Endpoints: Migration (config, status, start, progress) |
| `server/` | Database migrations: migration_configs, migration_jobs |
| `cloud-client/SentjaMigration` | `ScanPhase.cs` — rekursif folder scan dengan filter |
| `cloud-client/SentjaMigration` | `HashPhase.cs` — SHA-256 batch computation (thread pool) |
| `cloud-client/SentjaMigration` | `UploadPhase.cs` — concurrent SFTP upload (max 3 paralel) |
| `cloud-client/SentjaMigration` | `VerifyPhase.cs` — checksum verification dari Hetzner |
| `cloud-client/SentjaMigration` | `DehydratePhase.cs` — CfDehydratePlaceholder per file |
| `cloud-client/SentjaMigration` | `MigrationOrchestrator.cs` — state machine + resume logic |
| `cloud-client/SentjaCloudService` | Integrasi Migration Engine ke Service |
| `cloud-client/SentjaCloudService` | Progress reporting ke backend (interval 30 detik) |
| `cloud-client/SentjaTray` | Migration wizard UI (wizard start/pause/resume/cancel) |
| `cloud-client/SentjaTray` | Progress indicator real-time di tray |
| `admin/` | Halaman migration config (buat konfigurasi untuk device) |
| `admin/` | Halaman migration progress (real-time progress per device) |
| `admin/` | Daftar migration jobs dengan detail error |

**Dependensi:**
- Phase 1 harus selesai dan stabil (terutama SFTP upload client dan CfAPI dehydrate).
- Pengujian dengan dataset besar (>10.000 file, >100 GB) diperlukan sebelum produksi.
- Resume logic membutuhkan SQLite local state yang reliable.

**Estimasi Kompleksitas:** ⭐⭐⭐ (Menengah-Tinggi)

Catatan: Bagian tersulit adalah **Verify Phase** — re-fetching checksum dari Hetzner untuk setiap file membutuhkan batching yang efisien agar tidak overwhelm SFTP connection. **Dehydrate Phase** bergantung pada CfAPI stability dari Phase 1.

---

### 6.3 Phase 3 — Permission & USB Protection (Label: C)

**Tujuan:** Menambahkan lapisan keamanan untuk mengontrol perpindahan data. USB drive diblokir secara default di kernel level. Admin dapat mengatur policy per device dan merespons permission request dari user.

**Deliverables:**

| Komponen | Deliverable |
|---|---|
| `server/` | Endpoints: Permissions (request, pending, approve, deny, check) |
| `server/` | Endpoints: Audit log (GET, POST) |
| `server/` | Database migrations: permissions, usb_policies |
| `server/` | Background job: expire permissions lewat waktu |
| `cloud-client/SentjaDriver` | Minifilter driver scaffold (WDK project) |
| `cloud-client/SentjaDriver` | USB volume identification (BusType check) |
| `cloud-client/SentjaDriver` | IRP_MJ_CREATE pre-operation callback |
| `cloud-client/SentjaDriver` | Communication port ke SentjaCloudService |
| `cloud-client/SentjaDriver` | Driver signing (EV certificate) + WHQL submission |
| `cloud-client/SentjaCloudService` | Permission Manager (cache + polling) |
| `cloud-client/SentjaCloudService` | Driver communication handler |
| `cloud-client/SentjaCloudService` | USB policy cache (refresh 5 menit) |
| `cloud-client/SentjaTray` | Permission request UI (dialog notifikasi) |
| `cloud-client/SentjaTray` | USB block notification |
| `admin/` | USB Policy management per device |
| `admin/` | Permission request list + approve/deny UI |
| `admin/` | Real-time notification (WebSocket) untuk permission request baru |
| `admin/` | Audit log viewer dengan filter |
| `installer/` | Driver installer integration ke setup wizard |

**Dependensi:**
- Phase 1 dan Phase 2 harus selesai.
- **EV (Extended Validation) Code Signing Certificate** wajib untuk driver signing — diperlukan untuk kernel-mode driver di Windows 10/11 modern. Proses pengajuan EV cert ke CA bisa memakan waktu 1-2 minggu.
- Windows Driver Kit (WDK) dan Visual Studio WDK extension terinstall.
- Test environment: Windows 10/11 VM dengan Driver Verifier aktif.
- Opsional: WHQL (Windows Hardware Quality Labs) submission jika ingin distribusi via Windows Update.

**Estimasi Kompleksitas:** ⭐⭐⭐⭐⭐ (Sangat Tinggi)

Catatan: Kernel-mode driver development adalah bagian paling kompleks dalam proyek ini. Bug di driver level dapat menyebabkan Blue Screen of Death (BSOD). Mandatory testing dengan Driver Verifier dan Static Driver Verifier (SDV). BSOD selama development sangat mungkin — gunakan VM atau dedicated test machine. **Pertimbangan alternatif:** Jika minifilter driver terlalu berisiko untuk timeline pendek, bisa menggunakan pendekatan user-mode via **Removable Storage Access Control** di Windows Group Policy sebagai interim solution.

---


## 7. Security Considerations

### 7.1 Token Management

#### 7.1.1 JWT Access Token

- **Algorithm:** RS256 (asymmetric) — private key hanya ada di backend, client hanya perlu public key untuk verifikasi.
- **Expiry:** 1 jam untuk user token; 15 menit untuk device token (lebih pendek karena device bisa di-suspend).
- **Payload:**
  ```json
  {
    "sub": "user-uuid",
    "device_id": "device-uuid",      // hanya untuk device token
    "role": "user",                  // user | admin | superadmin | device
    "iat": 1754838000,
    "exp": 1754841600,
    "jti": "unique-token-id"         // untuk revocation
  }
  ```
- **Revocation:** JWT pada dasarnya stateless. Untuk force revoke (misal device suspended), backend memelihara **token blacklist** di Redis (atau PostgreSQL `refresh_tokens.is_revoked`). Setiap request yang menggunakan JWT, middleware cek `jti` terhadap blacklist.

#### 7.1.2 Refresh Token

- Disimpan sebagai SHA-256 hash di database (`refresh_tokens.token_hash`).
- Nilai aktual refresh token hanya dikirim sekali ke client dan tidak pernah disimpan plaintext.
- Refresh token device: expiry 30 hari; diperbarui setiap kali digunakan (sliding expiration).
- Refresh token user: expiry 7 hari.
- Setiap device memiliki maksimum 1 refresh token aktif — login baru otomatis revoke yang lama.
- Jika device di-suspend, semua refresh token device tersebut langsung di-revoke.

#### 7.1.3 Penyimpanan Token di Client

- Refresh token dan device credentials disimpan di **Windows Credential Manager** (via `CredWrite` / `CredRead` API), bukan di file plain text atau registry.
- Access token disimpan di memory saja (tidak persisted ke disk).

#### 7.1.4 Rotasi Kunci

- JWT signing key pair dirotasi setiap 90 hari.
- Selama rotasi, kedua key pair (lama dan baru) aktif selama 24 jam untuk zero-downtime.

---

### 7.2 File Checksum Verification

#### 7.2.1 Proses Verifikasi

Checksum digunakan pada dua titik kritis:

**Saat Upload (migration):**
```
1. SentjaMigration hitung SHA-256 file lokal sebelum upload
2. Upload ke Hetzner via SFTP
3. Setelah upload selesai, request backend: POST /api/files/upload-complete
4. Backend memerintahkan SFTP service untuk re-download checksum dari Hetzner
   (atau menggunakan SHA-256 dari SFTP server jika tersedia via custom command)
5. Bandingkan checksum:
   - MATCH → status = synced
   - MISMATCH → hapus file di Hetzner → re-upload → max 3 retries
   - Jika 3x gagal → status = error → notif admin → file tetap lokal
```

**Saat Download (hydration):**
```
1. Download file dari Hetzner
2. Hitung SHA-256 dari data yang didownload
3. Bandingkan dengan checksum di tabel files
   - MATCH → hydrate file via CfAPI
   - MISMATCH → hapus cache lokal → notif admin (file mungkin corrupt di Hetzner)
```

#### 7.2.2 Perlindungan dari Tampering

- SFTP connection ke Hetzner menggunakan **SSH host key verification** — host key di-pin saat setup awal dan divalidasi setiap koneksi.
- Semua komunikasi backend menggunakan TLS 1.3 minimum.
- Backend tidak mempercaya checksum dari client — selalu re-verify dari Hetzner untuk file kritis.

---

### 7.3 Migration Safeguards

**Prinsip utama: File lokal TIDAK boleh dihapus sampai file di Hetzner terverifikasi.**

Safeguard yang diimplementasikan:

| Safeguard | Implementasi |
|---|---|
| **No delete before verify** | Dehydrate hanya dipanggil setelah `status = synced` (bukan `uploaded`) |
| **Atomic state transitions** | Setiap perubahan fase disimpan ke SQLite lokal + backend secara atomik |
| **Verify timeout** | Jika verifikasi tidak selesai dalam 24 jam, migration dihentikan dan admin dinotifikasi |
| **Error threshold** | Jika >10% file gagal dalam satu batch, migration di-pause otomatis |
| **Resume capability** | `migration_state.last_file_idx` menyimpan posisi terakhir — migration bisa dilanjutkan dari titik terakhir |
| **Dry run mode** | Admin bisa jalankan "dry run" yang hanya scan + hash tanpa upload, untuk estimasi waktu dan space |
| **Rollback for dehydrated** | Jika file yang sudah didehydrate ternyata hilang di Hetzner (disaster recovery), system memiliki fallback: tandai `status = error`, notif admin |
| **Original file preservation** | Selama migration berlangsung, file lokal tidak dimodifikasi — hanya dibaca |

---

### 7.4 Admin Permission Flow

#### 7.4.1 Principle of Least Privilege

| Role | Kapabilitas |
|---|---|
| `superadmin` | Full access; bisa buat/hapus admin; bisa akses semua data semua org |
| `admin` | Kelola users, devices, migration, permissions dalam orgnya; tidak bisa ubah superadmin |
| `user` | Hanya bisa lihat device miliknya sendiri; tidak bisa akses admin panel |
| `device` | Token khusus untuk device; hanya bisa akses endpoint yang relevan untuk device tersebut |

#### 7.4.2 Permission Approval Security

- Permission request divalidasi server-side: device harus `status = active`, file harus milik device tersebut.
- Admin yang approve tidak bisa approve request untuk device yang bukan dalam lingkup adminnya (multi-tenant safety).
- Permission yang sudah `expired` atau `revoked` tidak bisa digunakan meskipun masih tersimpan di DB.
- Setiap pengecekan permission di `/api/permissions/check` dicatat di audit log dengan severity `info`.
- Jika permission digunakan (`used_at` di-set), action aktual juga dicatat di audit log.

#### 7.4.3 Anti-Bypass Measures

- Client tidak bisa "forge" permission response karena:
  1. Permission check ada di backend (server-side).
  2. Driver-level block tidak bergantung pada response network — timeout = BLOCK.
  3. Jika koneksi ke backend terputus, kebijakan default adalah DENY untuk action yang memerlukan permission.
- Jika SentjaCloudService di-kill atau crash, SentjaDriver kembali ke **fail-secure mode**: semua USB akses diblokir sampai service kembali online.

---

### 7.5 Audit Trail

#### 7.5.1 Events yang Selalu Di-audit

| Event | Severity | Detail Dicatat |
|---|---|---|
| `USER_LOGIN` | info | ip_address, user_agent |
| `USER_LOGIN_FAILED` | warning | ip_address, alasan gagal |
| `DEVICE_REGISTERED` | info | machine_id, os_version |
| `DEVICE_SUSPENDED` | warning | admin yang suspend, alasan |
| `FILE_ACCESSED` | info | file_id, hydration_source |
| `FILE_UPLOADED` | info | file_id, size_bytes, checksum |
| `FILE_DEHYDRATED` | info | file_id |
| `USB_BLOCKED` | warning | usb_vendor_id, product_id |
| `USB_ALLOWED` | info | usb_vendor_id, permission_id |
| `PERMISSION_REQUESTED` | info | action, file_id, reason |
| `PERMISSION_APPROVED` | info | admin, expires_at |
| `PERMISSION_DENIED` | warning | admin, deny_reason |
| `MIGRATION_STARTED` | info | config_id, folder_count |
| `MIGRATION_COMPLETED` | info | job_id, file_count, duration |
| `MIGRATION_FAILED` | critical | job_id, error_details |
| `ADMIN_USER_CREATED` | warning | new_user_id, created_by |
| `ADMIN_ROLE_CHANGED` | warning | target_user_id, old_role, new_role |
| `USB_POLICY_CHANGED` | warning | device_id, old_policy, new_policy |

#### 7.5.2 Integritas Audit Log

- Tabel `audit_logs` bersifat append-only; tidak ada endpoint DELETE di API.
- PostgreSQL row-level security (RLS) dapat dikonfigurasi untuk membatasi DELETE bahkan oleh superadmin application user.
- Untuk kebutuhan compliance tinggi, audit log dapat di-stream ke external SIEM (Splunk, Elastic) via webhook/Kafka.
- Log retention: minimum 1 tahun di PostgreSQL; arsip ke cold storage (Hetzner Object Storage / S3) untuk data >1 tahun.

---

### 7.6 Network Security

#### 7.6.1 API Security

- Rate limiting: 100 request/menit per IP untuk endpoint publik; 1000 request/menit untuk device token.
- Semua endpoint menggunakan HTTPS (TLS 1.3 minimum; TLS 1.2 diizinkan untuk backward compat).
- CORS: hanya izinkan origin yang dikonfigurasi (domain admin panel).
- Helmet.js digunakan untuk HTTP security headers (CSP, HSTS, X-Frame-Options, dll).
- SQL injection dicegah dengan parameterized queries (tidak ada string concatenation untuk query).
- Input validation menggunakan `zod` schema validation di setiap endpoint.

#### 7.6.2 SFTP Security

- Hetzner Storage Box diakses menggunakan **SSH key authentication** (bukan password).
- Private key untuk SFTP disimpan di environment variable / secret manager (tidak di kode).
- Setiap device mendapatkan path namespace tersendiri (`/{org_id}/{device_id}/`) — device tidak bisa akses path device lain meski tahu remote path-nya karena validasi dilakukan di backend sebelum SFTP operation.

#### 7.6.3 Client-Side Security

- Service berjalan sebagai `NT AUTHORITY\SYSTEM` — tidak perlu exposed ke internet secara langsung.
- Semua komunikasi client ke backend menggunakan certificate pinning untuk mencegah MITM.
- Device token di-refresh otomatis — expired token langsung menyebabkan sync berhenti sampai token baru didapat.

---


---

## Appendix A — Daftar Dependencies

### Backend (Node.js)

| Package | Versi | Fungsi |
|---|---|---|
| `express` | `^4.18.2` | Web framework |
| `typescript` | `^5.4.0` | TypeScript compiler |
| `pg` | `^8.11.3` | PostgreSQL client |
| `jsonwebtoken` | `^9.0.2` | JWT generation & verification |
| `bcrypt` | `^5.1.1` | Password hashing |
| `zod` | `^3.23.0` | Input validation |
| `ssh2` | `^1.15.0` | SFTP client untuk Hetzner |
| `winston` | `^3.13.0` | Logging |
| `helmet` | `^7.1.0` | HTTP security headers |
| `express-rate-limit` | `^7.2.0` | Rate limiting |
| `cors` | `^2.8.5` | CORS middleware |
| `ws` | `^8.17.0` | WebSocket (notifikasi real-time) |

### Windows Client (C#/.NET 8)

| Package/SDK | Fungsi |
|---|---|
| `.NET 8.0` | Runtime |
| `SSH.NET (Renci.SshNet)` v2024.1 | SFTP client |
| `Microsoft.Data.Sqlite` v8.0 | SQLite local database |
| `Windows.Storage.Provider` | CfAPI (WinRT namespace) |
| `CfApi.lib / CfApi.h` | CfAPI Win32 API |
| `System.Net.Http` | HttpClient untuk backend API |
| `Newtonsoft.Json` v13 | JSON serialization |
| `WDK 11 (Windows Driver Kit)` | Minifilter driver development (Phase 3) |

### Web Admin Panel

| Package | Fungsi |
|---|---|
| `React 18` / `Vue 3` (TBD) | UI framework |
| `Vite` | Build tool |
| `TanStack Query` | Server state management |
| `Axios` | HTTP client |
| `Tailwind CSS` | Styling |

---

## Appendix B — Environment Variables

```env
# server/.env

# App
NODE_ENV=production
PORT=3000
APP_SECRET=<random-32-bytes-hex>

# JWT
JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt-public.pem
JWT_ACCESS_EXPIRES_IN=3600
JWT_DEVICE_EXPIRES_IN=900
JWT_REFRESH_USER_EXPIRES_IN=604800
JWT_REFRESH_DEVICE_EXPIRES_IN=2592000

# PostgreSQL
DATABASE_URL=postgresql://sentja_user:password@localhost:5432/sentja_db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

# Hetzner SFTP
HETZNER_SFTP_HOST=your-storagebox.hetzner.com
HETZNER_SFTP_PORT=23
HETZNER_SFTP_USER=your-username
HETZNER_SFTP_PRIVATE_KEY_PATH=/secrets/hetzner-sftp-key
HETZNER_BASE_PATH=/sentja

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_PUBLIC=100
RATE_LIMIT_MAX_DEVICE=1000

# CORS
ALLOWED_ORIGINS=https://admin.sentja.internal
```

---

## Appendix C — Glossary

| Istilah | Definisi |
|---|---|
| **CfAPI** | Cloud Files API — Windows API untuk implementasi virtual cloud drive (seperti OneDrive) |
| **CF Provider** | Implementasi sync root provider yang menggunakan CfAPI |
| **Placeholder** | File virtual di Windows Explorer yang mewakili file di cloud; konten belum ada di lokal |
| **Hydration** | Proses mendownload konten file dari cloud ke lokal saat user membuka file |
| **Dehydration** | Proses menghapus konten lokal file, menggantinya dengan placeholder; membebaskan disk space |
| **Minifilter Driver** | Kernel-mode driver yang dapat mengintermiasikan I/O request sebelum sampai ke filesystem |
| **IRP** | I/O Request Packet — struktur kernel Windows untuk operasi I/O |
| **SFTP** | SSH File Transfer Protocol — protokol transfer file berbasis SSH |
| **LRU** | Least Recently Used — algoritma cache eviction yang menghapus item paling lama tidak digunakan |
| **EV Certificate** | Extended Validation Code Signing Certificate — diperlukan untuk sign kernel-mode driver |
| **WHQL** | Windows Hardware Quality Labs — program sertifikasi driver Microsoft |
| **Sync Root** | Lokasi folder di filesystem yang terdaftar sebagai cloud provider root |
| **Migration** | Proses memindahkan file lokal ke cloud secara batch |
| **Permission** | Izin sementara yang diberikan admin untuk user melakukan action tertentu (copy, USB, dll) |
| **Audit Trail** | Catatan kronologis semua aksi penting dalam sistem untuk keperluan audit |

---

*Dokumen ini akan diperbarui seiring perkembangan implementasi. Versi terbaru selalu ada di `.kiro/specs/sentja-cloud-enterprise/requirements.md`.*
