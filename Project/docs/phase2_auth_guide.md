# Phase 2: Authentication, Google Sign-In, User Management & Role-Based Access Control (RBAC)

## 1. Architecture Overview

Phase 2 introduces a complete, production-grade authentication and authorization subsystem to the **Dynamic Ambulance Dispatch System**, coexisting seamlessly alongside the existing MS SQL Server database and legacy C++ components.

### Core Principles
- **Unified Identity System**: Local email/password authentication and federated Google Sign-In integrate into a single session architecture (`dbo.Users`), eliminating fragmented auth pipelines.
- **Backend Token Verification**: Google ID credentials obtained by frontend Google Identity Services (GIS) are strictly verified on the Node.js backend using `google-auth-library`.
- **Subject-Based Identity Mapping**: Federated Google users are resolved using their unique, immutable Google subject (`sub`) claim rather than mutable email addresses.
- **Account Linking & Conflict Prevention**: Local accounts with matching email addresses are never silently auto-linked to external Google credentials. Explicit, authenticated linking from profile settings is enforced.
- **Strict Role-Based Access Control (RBAC)**: Backend middleware strictly validates token authenticity, account status (`ACTIVE`, `PENDING`, `INACTIVE`, `SUSPENDED`), and permitted roles (`ADMIN`, `DISPATCHER`, `AMBULANCE_CREW`, `HOSPITAL_OPERATOR`).

---

## 2. Database Design & Migration

All Phase 2 tables were created non-destructively in `DynamicAmbulanceDispatch` database.

### 2.1 Schema Definition

#### `dbo.Users`
Primary identity store for application users:
- `id` (INT, IDENTITY(1,1), PK)
- `email` (VARCHAR(255), UNIQUE, NOT NULL)
- `name` (VARCHAR(100), NOT NULL)
- `password_hash` (VARCHAR(255), NULL) — Bcrypt hash; nullable for Google-only users
- `role` (VARCHAR(30), DEFAULT 'DISPATCHER') — Restricted to `ADMIN`, `DISPATCHER`, `AMBULANCE_CREW`, `HOSPITAL_OPERATOR`
- `status` (VARCHAR(20), DEFAULT 'PENDING') — Restricted to `ACTIVE`, `PENDING`, `INACTIVE`, `SUSPENDED`, `REJECTED`
- `email_verified` (BIT, DEFAULT 0)
- `must_change_password` (BIT, DEFAULT 0) — Enforces password reset on initial login
- `approved_at` (DATETIME2, NULL)
- `approved_by` (INT, FK to Users(id), NULL)
- `created_at` (DATETIME2, DEFAULT GETDATE())
- `updated_at` (DATETIME2, DEFAULT GETDATE())

#### `dbo.UserAuthIdentities`
Stores federated external providers linked to an application user:
- `id` (INT, IDENTITY(1,1), PK)
- `user_id` (INT, FK to Users(id) ON DELETE CASCADE, NOT NULL)
- `provider` (VARCHAR(50), NOT NULL) — e.g., `'google'`
- `provider_subject` (VARCHAR(255), NOT NULL) — Stable Google `sub` claim
- `provider_email` (VARCHAR(255), NOT NULL)
- `provider_email_verified` (BIT, DEFAULT 0)
- `created_at` (DATETIME2, DEFAULT GETDATE())
- `updated_at` (DATETIME2, DEFAULT GETDATE())
- Composite Unique Constraint: `(provider, provider_subject)`

#### `dbo.AuthAuditLogs`
Immutable security and audit trail:
- `id` (BIGINT, IDENTITY(1,1), PK)
- `user_id` (INT, FK to Users(id) ON DELETE SET NULL, NULL)
- `event_type` (VARCHAR(60), NOT NULL) — e.g., `LOGIN_SUCCESS`, `GOOGLE_LINK_SUCCESS`
- `details` (VARCHAR(1000), NULL)
- `ip_address` (VARCHAR(45), NULL)
- `user_agent` (VARCHAR(255), NULL)
- `created_at` (DATETIME2, DEFAULT GETDATE())

### 2.2 Migrations & Rollback

- **Run Migration**:
  ```powershell
  node backend/scripts/migrate.js
  ```
- **Rollback Migration**:
  ```powershell
  node backend/scripts/rollback.js
  ```
- **SQL Server DDL Script**:
  Alternatively, run [database_schema_auth.sql](../database_schema_auth.sql) in SQL Server Management Studio or `sqlcmd`.

---

## 3. Administrator Bootstrap Command

To securely provision the initial system administrator without hardcoded passwords or destructive operations:

```powershell
# Interactive / arguments:
node backend/scripts/bootstrapAdmin.js admin@ems-dispatch.local "EMS Chief Admin" "SecureAdminPass123!"

# Or via environment variables:
$env:ADMIN_EMAIL="admin@ems-dispatch.local"
$env:ADMIN_NAME="EMS Chief Admin"
$env:ADMIN_PASSWORD="SecureAdminPass123!"
node backend/scripts/bootstrapAdmin.js
```

**Safety Guarantees**:
- Refuses to overwrite if an active administrator already exists.
- Hashes password with configurable bcrypt salt rounds (default 10).
- Never echoes passwords or hashes to standard output.

---

## 4. Google Cloud Configuration Guide

### 4.1 Creating the Google Cloud OAuth 2.0 Web Client
1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (e.g. `dynamic-ambulance-dispatch`).
3. Navigate to **APIs & Services > OAuth consent screen**:
   - Choose **External** (or **Internal** if using a Google Workspace organization).
   - Enter Application name: `Dynamic Ambulance Dispatch System`.
   - Enter User support email and Developer contact information.
   - Click **Save and Continue** through Scopes (default `email`, `profile`, `openid`).
   - If in Testing mode, add test Gmail accounts under **Test Users**.
4. Navigate to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Select **Web application**.
   - Under **Authorized JavaScript origins**, add:
     - `http://localhost:5173` (local Vite dev server)
     - `http://127.0.0.1:5173`
     - Production frontend domain (e.g., `https://ems.yourdomain.com`)
   - Click **Create**.
5. Copy your **Client ID** (format: `xxxxxxxx.apps.googleusercontent.com`).

### 4.2 Environment Configuration
Add the Google Client ID to both environment files:

#### `backend/.env`
```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
# Account creation policy for unlinked Google users: 'disabled' (default) or 'pending'
GOOGLE_SIGNUP_MODE=disabled
```

#### `frontend/.env`
```env
VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
```

### 4.3 Troubleshooting Common Google GIS Errors
- `origin_mismatch`: The origin serving the frontend does not match the exact scheme, domain, and port in Google Cloud Console's *Authorized JavaScript origins*. Add `http://localhost:5173` or `http://127.0.0.1:5173`.
- `invalid_client`: Check that `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` match the exact string from Google Cloud Console with no trailing spaces.
- `Access blocked: App has not completed verification`: When OAuth consent screen is in *Testing* mode, the logging-in Google account must be explicitly listed under **Test users** in the Google Cloud Console.

---

## 5. API Endpoints Reference

Base path: `/api/v1`

### 5.1 Authentication Module (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public (Rate-limited) | Local email and password login |
| `POST` | `/auth/google` | Public (Rate-limited) | Google Sign-In with GIS ID credential |
| `POST` | `/auth/logout` | Authenticated | Invalidates JWT and clears session cookie |
| `GET` | `/auth/me` | Authenticated | Returns current authenticated profile |
| `POST` | `/auth/change-password` | Authenticated | Changes local password (clears temp pass flag) |
| `POST` | `/auth/google/link` | Authenticated | Links Google identity to current account |
| `DELETE`| `/auth/google/link` | Authenticated | Unlinks Google (prevents removing only auth method) |

#### Example: `POST /api/v1/auth/login`
**Request Body**:
```json
{
  "email": "dispatcher@ems-dispatch.local",
  "password": "Password123!"
}
```
**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "dispatcher@ems-dispatch.local",
      "name": "Jane Dispatcher",
      "role": "DISPATCHER",
      "status": "ACTIVE",
      "email_verified": true,
      "must_change_password": false,
      "linked_providers": []
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  },
  "meta": { "timestamp": "2026-09-30T01:00:00.000Z" }
}
```

### 5.2 User Management Module (`/api/v1/users`)
*All user management endpoints require `role: ADMIN`.*

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/users` | `ADMIN` | List users with search, role, status & pagination |
| `GET` | `/users/:id` | `ADMIN` | Get user details by ID |
| `POST` | `/users` | `ADMIN` | Provision user with temporary password |
| `PATCH` | `/users/:id` | `ADMIN` | Update display name, role, or status |
| `PATCH` | `/users/:id/status`| `ADMIN` | Change status (`ACTIVE`, `INACTIVE`, `SUSPENDED`) |
| `PATCH` | `/users/:id/role` | `ADMIN` | Change role (protected against last admin removal) |
| `POST` | `/users/:id/approve`| `ADMIN` | Approve pending account and activate |
| `POST` | `/users/:id/reject` | `ADMIN` | Reject pending registration |

---

## 6. Security & Authorization Controls

1. **Password Hashing**: Local passwords are encrypted using `bcrypt` with a configurable work factor (default 10 rounds). Plaintext passwords and hashes are never exposed in API responses or logs.
2. **Timing Attack Protection**: Failed logins execute a dummy bcrypt hash comparison to prevent username enumeration via timing discrepancy.
3. **Session Cookies & Bearer Tokens**: Dual session support enables both modern browser HttpOnly cookies with SameSite strictness and Authorization Bearer headers for API clients.
4. **Token Invalidation**: Logged-out tokens are immediately added to an in-memory revocation blacklist with automatic TTL expiration.
5. **Rate Limiting**: Express rate limiters protect `/login` (10 per 15 min), `/google` (15 per 15 min), and `/change-password` (5 per 15 min).
6. **Last Admin Protection**: The system prevents demoting or deactivating the last active `ADMIN` account.
7. **Audit Logging**: All authentication attempts, role changes, approvals, and credential links are recorded in `dbo.AuthAuditLogs` without persisting sensitive credentials.

---

## 7. Automated Testing

### 7.1 Backend Tests
Runs complete Jest test suite covering authentication, GIS verification, account linking, and RBAC:
```powershell
npm --prefix backend test
```

### 7.2 Frontend Tests
Runs Vitest test suite covering React component rendering, Google Sign-In button, protected routes, and role-aware navigation:
```powershell
npm --prefix frontend test
```

### 7.3 Run All Tests Across Workspace
```powershell
npm run test:all
```
