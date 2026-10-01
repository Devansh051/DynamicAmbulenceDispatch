# Dynamic Ambulance Dispatch System (EMS Command Platform)

A full-stack Emergency Medical Services (EMS) dispatch and hospital routing platform built by modernizing an existing C++ dispatch system into a modern web application with Microsoft SQL Server persistence.

---

## 1. Project Overview & Architecture

This repository contains a unified monorepo housing:
1. **Frontend**: A React + Vite command-center application styled with Tailwind CSS, featuring operational status telemetry, route views, fleet gauges, and responsive navigation.
2. **Backend**: A Node.js + Express REST API using ES modules and Sequelize ORM connecting non-destructively to Microsoft SQL Server (`DynamicAmbulanceDispatch`).
3. **Legacy C++ Engine**: The original interactive dispatch program, shortest-path solvers (Dijkstra and Floyd-Warshall), OTP confirmation logic, and ODBC database repository.

```
dynamic-ambulance-system/
├── frontend/                     # React + Vite + Tailwind CSS EMS Command Shell
├── backend/                      # Node.js + Express + Sequelize MSSQL Backend
├── docs/                         # System Architecture, Database Compatibility, Legacy Inventory
├── legacy_text_files/            # Preserved legacy text records
├── hospital_final.cpp            # Preserved C++ main dispatch program
├── database_repository.cpp/.h    # Preserved C++ ODBC SQL Server repository
├── database_schema.sql           # Canonical SQL Server schema creation & seeds
├── test_hospital.cpp             # Preserved C++ test suite
├── .vscode/                      # VS Code build and debug tasks
├── package.json                  # Root monorepo script runner
└── README.md                     # Project documentation
```

For comprehensive architectural design details, see [docs/architecture.md](docs/architecture.md).

---

## 2. Inventory of Existing C++ Features Identified

During Phase 1 source inspection, the following 11 core features were cataloged and preserved:

1. **Hospital Network & Route Matrix**: 15 hospitals seeded in `dbo.Hospitals` and 225 routes in `dbo.HospitalRoutes` representing an urban road network with connection status, casualty counts, and travel weights.
2. **Floyd-Warshall & Dijkstra Pathfinding**: Point-to-point shortest-path calculation, alternative hospital recommendation within a 20% distance threshold based on higher user review rating, and route step visualization.
3. **Dynamic Ambulance Fleet Allocation**: 20 seeded ambulance units in `dbo.Ambulances` with location, availability status, and fuel tracking (disqualifying ambulances with < 20% fuel).
4. **Atomic Timeline Event Logging**: Coordinated SQL transactions updating ambulance status/fuel and logging audit records to `dbo.AmbulanceTimeline`.
5. **Emergency Triage (Levels 1–5)**: Incident priority triage, cost multipliers (0.8x to 2.0x), and hospital casualty admission difficulty ratings.
6. **OTP Confirmation**: 6-digit pseudo-random authorization code prompt required before dispatch execution.
7. **Patient Record Management**: Patient registration upon admission, patient record search by ID, and numerical/string field updates in `dbo.Patients`.
8. **Hospital Feedback & Dynamic Ratings**: User rating submissions (1–5 stars) stored in `dbo.HospitalFeedback` with real-time average score computation.
9. **EMS Statistics Generation**: Aggregate metrics on patient admissions, vaccination percentage, insurance coverage, and average treatment cost.
10. **Legacy Data Migration Importer**: Text file parser in `migrate_existing_data.cpp` importing historical records into SQL Server.
11. **Unit Test Suite**: Assertion-based Floyd-Warshall and hospital selection tests in `test_hospital.cpp`.

For detailed technical analysis of each feature, see [docs/legacy_feature_inventory.md](docs/legacy_feature_inventory.md).

---

## 3. Mapping Functionality & Modernization Phases

| Feature / Subsystem | Target Web Module | Phase | Status |
| :--- | :--- | :--- | :--- |
| System Health & DB Telemetry | `backend/src/modules/health/` | Phase 1 | Completed |
| EMS Command Shell & Navigation | `frontend/src/layouts/`, `pages/` | Phase 1 | Completed |
| Sequelize Schema Integration | `backend/src/modules/*/` | Phase 1 | Completed |
| **Authentication & Session (JWT + Cookies)** | `backend/src/modules/auth/` | **Phase 2** | **Completed** |
| **Google Sign-In (GIS + Backend Verification)** | `backend/src/modules/auth/google-auth.service.js` | **Phase 2** | **Completed** |
| **Account Linking & Unlinking** | `backend/src/modules/auth/auth.service.js` | **Phase 2** | **Completed** |
| **RBAC & User Management** | `backend/src/modules/users/` | **Phase 2** | **Completed** |
| **Protected Routes & Role Navigation** | `frontend/src/components/`, `pages/` | **Phase 2** | **Completed** |
| **Admin Provisioning & Approvals** | `frontend/src/pages/Admin*` | **Phase 2** | **Completed** |
| **Ambulance Fleet Directory & Management** | `backend/src/modules/ambulances/`, `frontend/src/pages/AmbulancesPage.jsx` | **Phase 3** | **Completed** |
| **Hospital Network & Directory** | `backend/src/modules/hospitals/`, `frontend/src/pages/HospitalsPage.jsx` | **Phase 3** | **Completed** |
| **Emergency Incident Intake & Triage** | `backend/src/modules/emergencies/`, `frontend/src/pages/EmergenciesPage.jsx` | **Phase 3** | **Completed** |
| **Service Zones & Coverage Sectors** | `backend/src/modules/zones/`, `frontend/src/pages/ServiceZonesPage.jsx` | **Phase 3** | **Completed** |
| Dijkstra / Floyd-Warshall Solver & Routing | `backend/src/modules/routing/` | Phase 4 | Future |
| Dispatch Engine & Hospital Matching | `backend/src/modules/dispatch/` | Phase 4 | Future |
| Map Visualization & Live GPS Tracking | `frontend/src/modules/maps/` | Phase 4 | Future |
| Dynamic Relocation & Demand Prediction | `backend/src/modules/relocation/` | Phase 5 | Future |

For detailed Phase 2 guide, see **[docs/phase2_auth_guide.md](docs/phase2_auth_guide.md)**.
For detailed Phase 3 guide, see **[docs/phase3_data_management.md](docs/phase3_data_management.md)**.

---

## 4. Local Setup Instructions

### Prerequisites
- **Node.js**: v18+ (tested on Node v24.13.0)
- **npm**: v9+ (tested on npm 11.6.2)
- **Microsoft SQL Server**: 2019/2022 or SQLEXPRESS running on port 1433
- **C++ Compiler (Optional for legacy)**: GCC with C++17 support (e.g. MinGW-w64 or MSYS2 UCRT64) with `odbc32`

---

### Step 1: SQL Server Database Setup

1. Open PowerShell or Command Prompt and run the schema setup script:
   ```powershell
   sqlcmd -S "localhost\SQLEXPRESS" -E -C -i database_schema.sql
   ```
   *(This creates `DynamicAmbulanceDispatch` and seeds 15 hospitals, 225 routes, and 20 ambulances).*

2. Create the dedicated backend SQL login:
   ```sql
   CREATE LOGIN ems_user WITH PASSWORD = 'EmsSecurePassword123!', DEFAULT_DATABASE = DynamicAmbulanceDispatch;
   USE DynamicAmbulanceDispatch;
   CREATE USER ems_user FOR LOGIN ems_user;
   ALTER ROLE db_datareader ADD MEMBER ems_user;
   ALTER ROLE db_datawriter ADD MEMBER ems_user;
   ```

---

### Step 2: Environment Configuration

Copy the example environment files:
```powershell
# Root environment (used by legacy C++ and root verification)
cp .env.example .env

# Backend environment
cp backend\.env.example backend\.env

# Frontend environment
cp frontend\.env.example frontend\.env
```

Verify that `backend/.env` contains your SQL Server connection details:
```env
PORT=5000
NODE_ENV=development
API_PREFIX=/api/v1
CORS_ORIGIN=http://localhost:5173

DB_SERVER=localhost\SQLEXPRESS
DB_NAME=DynamicAmbulanceDispatch
DB_USER=ems_user
DB_PASSWORD=EmsSecurePassword123!
DB_ENCRYPT=yes
DB_TRUST_SERVER_CERTIFICATE=yes
```

---

### Step 3: Run the Application

#### Option A: Run via Root Monorepo Commands
```powershell
# Verify SQL Server connectivity
npm run db:verify

# Start backend server (port 5000)
npm run dev:backend

# In a separate terminal, start frontend dev server (port 5173)
npm run dev:frontend
```

#### Option B: Run Services Individually
```powershell
# Backend
cd backend
npm install
npm test
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

Open your browser at **`http://localhost:5173`**. The top status indicator will display **`API: ONLINE`** and **`SQL: CONNECTED`**.

---

### Step 5: How to Run the Preserved C++ Application

The original C++ system remains fully operational and can be compiled and run anytime:

```powershell
# Compile the legacy application
npm run build:legacy
# Or directly:
g++ -std=c++17 -static -static-libgcc -static-libstdc++ hospital_final.cpp database_repository.cpp -lodbc32 -o hospital_mssql.exe

# Run the legacy application
.\hospital_mssql.exe

# Run legacy unit tests
npm run test:legacy
```

---

## 5. Verification & Test Results

### Backend Automated Test Suite
Run `npm test` inside `backend/`:
```text
PASS tests/health.test.js
PASS tests/responseFormatter.test.js
PASS tests/errorHandler.test.js

Test Suites: 3 passed, 3 total
Tests:       5 passed, 5 total
Snapshots:   0 total
```

### Frontend Production Build
Run `npm run build` inside `frontend/`:
```text
✓ 1647 modules transformed.
dist/index.html                   1.23 kB │ gzip:  0.70 kB
dist/assets/index-DvyEXOrq.css   19.62 kB │ gzip:  4.44 kB
dist/assets/index-B5J0u92J.js   267.24 kB │ gzip: 84.10 kB
✓ built in 2.85s
```

### Browser Verification
Visual audit confirmed using automated browser subagent:
- Header Status: `API: ONLINE`, `SQL: CONNECTED (latency < 400ms)`.
- KPI Metric Cards: `20 Units Seeded`, `15 Hospitals / 225 Routes`, `9 Historical Patient Records`.
- Navigation: Seamless routing between Dashboard, Emergencies, Ambulances, Hospitals, and Settings without console errors.

---

## 6. Record of Files Created, Modified, and Preserved

### Files Preserved (Unchanged & Intact)
- `hospital_final.cpp` — Main C++ dispatch implementation
- `database_repository.h` & `database_repository.cpp` — C++ ODBC SQL repository
- `database_schema.sql` — SQL Server database creation and seed script
- `model_types.h` — C++ data models
- `test_hospital.cpp` & `test_hospital.exe` — C++ test suite
- `migrate_existing_data.cpp` & `migrate_existing_data.exe` — Text importer
- `patientSorted.cpp` — Secondary utility
- `DOCUMENTATION.md` — Original transition documentation
- `legacy_text_files/` (9 text files) — Historical data files
- `.vscode/` (`tasks.json`, `launch.json`) — C++ build and debug configurations

### Files Modified
- `README.md` — Updated with complete architecture, setup, legacy catalog, and verification details.

### Files Created
- `.gitignore` — Monorepo git ignore rules (protecting `.env`, `node_modules`, build outputs).
- `.env.example` — Root environment variable template.
- `package.json` — Root monorepo workspace script configuration.
- `docs/architecture.md` — Monorepo architecture and data flow document.
- `docs/database_compatibility.md` — Schema audit and Sequelize model mapping report.
- `docs/legacy_feature_inventory.md` — Complete catalog of all 11 existing C++ features.
- `docs/phase_roadmap.md` — Multi-phase modernization roadmap.
- `backend/`
  - `package.json` — Node.js ES modules configuration and dependencies.
  - `.env.example` — Backend environment template.
  - `scripts/verifyDb.js` — Database connectivity test script.
  - `src/config/env.js` — Environment variable loader and validation.
  - `src/config/database.js` — Sequelize MSSQL connection pool with health check.
  - `src/utils/logger.js` — Structured JSON logger with sanitization.
  - `src/utils/responseFormatter.js` — Standardized success and error response wrappers.
  - `src/middleware/requestLogger.js` — HTTP access logger.
  - `src/middleware/errorHandler.js` — Centralized error handler.
  - `src/middleware/notFoundHandler.js` — 404 handler.
  - `src/middleware/validateRequest.js` — Request validation middleware.
  - `src/modules/hospitals/hospital.model.js` — Sequelize model for `dbo.Hospitals`.
  - `src/modules/hospitals/hospitalRoute.model.js` — Sequelize model for `dbo.HospitalRoutes`.
  - `src/modules/hospitals/hospitalFeedback.model.js` — Sequelize model for `dbo.HospitalFeedback`.
  - `src/modules/ambulances/ambulance.model.js` — Sequelize model for `dbo.Ambulances`.
  - `src/modules/ambulances/ambulanceTimeline.model.js` — Sequelize model for `dbo.AmbulanceTimeline`.
  - `src/modules/patients/patient.model.js` — Sequelize model for `dbo.Patients`.
  - `src/modules/index.js` — Model foreign key associations index.
  - `src/modules/health/health.controller.js` — Health check endpoint controller.
  - `src/modules/health/health.routes.js` — Health check router.
  - `src/routes/v1/index.js` — Versioned API v1 router.
  - `src/routes/index.js` — Root API router.
  - `src/app.js` — Express application configuration.
  - `src/server.js` — Server bootstrap and graceful shutdown.
  - `tests/health.test.js` — Supertest health check tests.
  - `tests/errorHandler.test.js` — 404 and error handling tests.
  - `tests/responseFormatter.test.js` — Response formatter unit tests.
- `frontend/`
  - `package.json` — React, Vite, Tailwind CSS dependencies and scripts.
  - `vite.config.js` — Vite configuration.
  - `tailwind.config.js` — Tailwind CSS configuration with EMS custom palette.
  - `postcss.config.js` — PostCSS configuration.
  - `index.html` — HTML shell with modern typography.
  - `.env.example` — Frontend environment template.
  - `src/index.css` — Tailwind directives and custom theme.
  - `src/main.jsx` — Application entry point.
  - `src/App.jsx` — React Router setup.
  - `src/services/api.js` — Axios client with configurable base URL.
  - `src/services/healthService.js` — API health and overview service.
  - `src/components/ConnectionBadge.jsx` — Live API and SQL Server status indicator.
  - `src/components/StateFeedback.jsx` — Loading, Error, and Empty state components.
  - `src/layouts/MainLayout.jsx` — EMS Command Center shell with responsive sidebar.
  - `src/pages/DashboardPage.jsx` — Operations center overview with live metrics.
  - `src/pages/EmergenciesPage.jsx` — Emergency triage queue placeholder.
  - `src/pages/AmbulancesPage.jsx` — Ambulance fleet telemetry placeholder.
  - `src/pages/HospitalsPage.jsx` — Hospital network and trauma centers placeholder.
  - `src/pages/SettingsPage.jsx` — System diagnostics and database telemetry page.
  - `src/pages/NotFoundPage.jsx` — 404 tactical sector not found page.

### Phase 2 Additions (Authentication, Google Sign-In & RBAC)
- **Database & Migrations**:
  - `database_schema_auth.sql` — Idempotent SQL Server DDL script for Phase 2 auth tables.
  - `backend/src/migrations/001_create_auth_tables.js` — Sequelize migration script creating `dbo.Users`, `dbo.UserAuthIdentities`, `dbo.AuthAuditLogs`.
  - `backend/scripts/migrate.js` — Migration runner.
  - `backend/scripts/rollback.js` — Migration rollback runner.
  - `backend/scripts/bootstrapAdmin.js` — Initial administrator bootstrap CLI tool.
- **Backend Auth & Users Subsystems**:
  - `backend/src/modules/users/user.model.js` — User model with role and status constraints.
  - `backend/src/modules/users/userIdentity.model.js` — Federated identities model (Google GIS).
  - `backend/src/modules/users/user.service.js` — User provisioning, approvals, role & status management.
  - `backend/src/modules/users/user.controller.js` — User management REST controller.
  - `backend/src/modules/users/user.routes.js` — Admin-guarded user routes.
  - `backend/src/modules/users/user.validation.js` — Provisioning and update validators.
  - `backend/src/modules/auth/auth.service.js` — Unified auth service (local + Google resolution + linking).
  - `backend/src/modules/auth/google-auth.service.js` — Google ID token verification via `google-auth-library`.
  - `backend/src/modules/auth/session.service.js` — JWT issuance, revocation blacklist, and HttpOnly cookies.
  - `backend/src/modules/auth/auth.controller.js` — Login, Google, Logout, Profile, Link/Unlink endpoints.
  - `backend/src/modules/auth/auth.routes.js` — Authentication router.
  - `backend/src/modules/auth/auth.validation.js` — Credential format validation.
  - `backend/src/modules/audit/audit.model.js` & `audit.service.js` — Security audit trail logging.
  - `backend/src/middleware/authenticate.js` — JWT session authentication middleware.
  - `backend/src/middleware/authorize.js` — Role-based authorization middleware.
  - `backend/src/middleware/requireActiveAccount.js` — Active status enforcement middleware.
  - `backend/src/middleware/rateLimit.js` — Brute-force rate limiting middleware.
- **Frontend Auth & User Interface**:
  - `frontend/src/context/AuthContext.jsx` — React authentication state provider and hooks.
  - `frontend/src/services/authService.js` — Auth API client methods.
  - `frontend/src/services/userService.js` — User management API client methods.
  - `frontend/src/components/ProtectedRoute.jsx` — Route guard with forced password change / approval redirection.
  - `frontend/src/components/RoleRoute.jsx` — Role-based access restriction guard.
  - `frontend/src/components/GoogleSignInButton.jsx` — Official Google Identity Services button integration.
  - `frontend/src/pages/LoginPage.jsx` — Dual local & Google authentication page.
  - `frontend/src/pages/PendingApprovalPage.jsx` — Pending registration waiting page.
  - `frontend/src/pages/ChangePasswordPage.jsx` — Mandatory temporary password update screen.
  - `frontend/src/pages/ProfilePage.jsx` — Operator profile & Google account linking interface.
  - `frontend/src/pages/AdminUsersPage.jsx` — Administrator user management & provisioning table.
  - `frontend/src/pages/AdminApprovalsPage.jsx` — Administrator pending approvals review queue.
  - `frontend/src/tests/LoginPage.test.jsx` — Vitest unit tests for login component.
  - `frontend/src/tests/ProtectedRoute.test.jsx` — Vitest tests for route security.
  - `frontend/src/tests/RoleAwareNavigation.test.jsx` — Vitest tests for role-based navigation.
- **Documentation**:
  - `docs/phase2_auth_guide.md` — Full Phase 2 implementation, Google Cloud setup, and API guide.
  - `docs/phase3_data_management.md` — Full Phase 3 core data management and CRUD documentation.
  - `docs/phase4_hospital_maps_integration.md` — Phase 4 data.gov.in NIN API, 3-day sync, and Google Maps Platform integration guide.

---

## 7. Phase 4 Deliverables (Hospital Data Integration, Google Maps & Synchronization)

- **Database Migration 003**:
  - `backend/src/migrations/003_create_phase4_tables.js` — Alters `dbo.Hospitals` non-destructively (`government_id`, `district`, `specialties`, `emergency_services`, `verification_status`, `data_freshness`, `last_synced_at`), creates `dbo.HospitalSyncHistory` audit table and nonclustered indexes.
- **Backend Services & Scheduler**:
  - `backend/src/modules/hospitals/dataGov.service.js` — data.gov.in NIN Health Facilities API service with pagination, retries, and error sanitization.
  - `backend/src/modules/hospitals/googleMaps.service.js` — Google Places API (New) nearby search, Routes API driving durations, Geocoding API, and Haversine fallback.
  - `backend/src/modules/hospitals/hospitalSync.service.js` — Bulk upsert, cautious deduplication matching, and audit logging.
  - `backend/src/modules/hospitals/hospitalSync.scheduler.js` — Automated 3-day (72-hour) recurring synchronization scheduler.
  - `backend/src/modules/hospitals/hospital.service.js` — Combined `findNearbyHospitals` algorithm merging local SQL Server spatial data, Google Places, and Google Routes driving durations.
- **Frontend Maps & Sync UI**:
  - `frontend/src/components/GoogleMapView.jsx` — Google Maps JavaScript API integration with dark roadmap, custom ambulance beacon, hospital pins, and tactical SVG vector radar fallback.
  - `frontend/src/components/HospitalSyncModal.jsx` — Admin-only 3-day synchronization management modal with countdown, telemetry, manual sync button, and history table.
  - `frontend/src/pages/HospitalsPage.jsx` — View toggle (`grid`, `table`, `nearby`), ambulance selector, radius filter, candidate list, and enriched hospital details drawer.
- **Automated Tests**:
  - `backend/tests/phase4.test.js` — 19 comprehensive unit and integration tests (79 total backend passing).
  - `frontend/src/tests/Phase4NearbyMap.test.jsx` — 6 Vitest component tests (24 total frontend passing).
