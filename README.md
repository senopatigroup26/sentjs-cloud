# SentJS Cloud

Cloud storage management system dengan fitur multi-user, role-based access control, dan device management.

## 🚀 Features

- **User Management**: Multi-user dengan role-based permissions (superadmin, admin, user)
- **File Storage**: Upload, download, delete files dengan Hetzner Storage Box integration
- **Device Management**: Device registration dan access control
- **Audit Logging**: Comprehensive audit trail untuk semua aktivitas
- **RESTful API**: Backend API dengan Express.js + TypeScript
- **Admin Panel**: Web-based admin interface dengan React + Vite

## 🏗️ Tech Stack

### Backend (`/server`)
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL (Supabase)
- **Storage**: Hetzner Storage Box (SFTP)
- **Authentication**: JWT (Access + Refresh Token)
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Joi

### Admin Panel (`/admin-panel`)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: Zustand
- **HTTP Client**: Axios
- **UI Icons**: Lucide React

## 📦 Project Structure

```
sentjs-cloud/
├── server/              # Backend API
│   ├── src/
│   │   ├── config/      # Database, environment config
│   │   ├── middleware/  # Auth, validation, rate limiting
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   └── utils/       # Helpers, validators
│   └── vercel.json      # Vercel deployment config
│
├── admin-panel/         # Frontend Admin UI
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── lib/         # API client
│   │   └── App.tsx      # Main app component
│   └── vite.config.ts   # Vite config
│
└── README.md            # This file
```

## 🌐 Deployment

### Production URLs
- **API**: https://api-cloud.sentjagroup.tech
- **Admin Panel**: https://cloud.sentjagroup.tech

### Platform
- **Backend**: Vercel (Serverless Functions)
- **Admin Panel**: Vercel (Static Site)
- **Database**: Supabase PostgreSQL
- **Storage**: Hetzner Storage Box

## 🔧 Environment Variables

### Backend (`/server/.env`)
```env
# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=1h
JWT_DEVICE_EXPIRES_IN=30d
JWT_REFRESH_USER_EXPIRES_IN=7d
JWT_REFRESH_DEVICE_EXPIRES_IN=90d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_PUBLIC=100
RATE_LIMIT_MAX_DEVICE=1000

# CORS
ALLOWED_ORIGINS=https://cloud.sentjagroup.tech,http://localhost:5173

# Hetzner Storage
HETZNER_SFTP_HOST=your-host
HETZNER_SFTP_PORT=23
HETZNER_SFTP_USER=your-user
HETZNER_SFTP_PASSWORD=your-password
HETZNER_BASE_PATH=/base-path
```

### Admin Panel (`/admin-panel/.env`)
```env
VITE_API_BASE_URL=https://api-cloud.sentjagroup.tech/api
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Hetzner Storage Box account

### Installation

1. Clone repository
```bash
git clone https://github.com/senopatigroup26/sentjs-cloud.git
cd sentjs-cloud
```

2. Install backend dependencies
```bash
cd server
npm install
```

3. Install admin panel dependencies
```bash
cd ../admin-panel
npm install
```

4. Setup environment variables (lihat section Environment Variables)

5. Run database migrations
```bash
cd server
npm run db:push
```

6. Run development servers

Backend:
```bash
cd server
npm run dev
```

Admin Panel:
```bash
cd admin-panel
npm run dev
```

## 📋 API Endpoints

### Authentication
- `POST /api/auth/register` - Register user baru
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Devices
- `POST /api/devices/register` - Register device
- `GET /api/devices` - Get all devices
- `DELETE /api/devices/:id` - Delete device

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files` - List files
- `GET /api/files/:id/download` - Download file
- `DELETE /api/files/:id` - Delete file

### Permissions
- `GET /api/permissions` - Get all permissions
- `POST /api/permissions` - Create permission
- `DELETE /api/permissions/:id` - Delete permission

### Audit Logs
- `GET /api/audit-logs` - Get audit logs (admin only)

### System
- `GET /api/system/stats` - Get system statistics

## 👤 Default Users

| Email | Password | Role |
|-------|----------|------|
| owner@sge.com | password | superadmin |
| admin@sge.com | password | admin |
| user@sge.com | password | user |

⚠️ **PENTING**: Ganti password default setelah deployment pertama!

## 🔐 Role Permissions

### Superadmin
- Full access ke semua fitur
- User management
- System configuration
- Audit logs

### Admin
- User management (terbatas)
- File management
- Device management
- View audit logs

### User
- Upload/download own files
- View own audit logs
- Basic file operations

## 📊 Database Schema

### Tables
- `users` - User accounts dan roles
- `devices` - Registered devices
- `files` - File metadata dan storage info
- `permissions` - File sharing permissions
- `audit_logs` - Activity logging
- `refresh_tokens` - JWT refresh tokens

## 🛡️ Security Features

- JWT authentication dengan refresh tokens
- Password hashing dengan bcrypt
- Role-based access control (RBAC)
- Rate limiting per endpoint
- CORS protection
- Helmet security headers
- Input validation dengan Joi
- SQL injection protection (parameterized queries)
- Audit logging untuk compliance

## 📝 License

MIT License - Copyright (c) 2026 Sentja Group

## 👥 Team

Sentja Group - Sentopati Group 26

## 🐛 Issues & Support

Untuk bug reports dan feature requests, silakan buat issue di GitHub repository.
