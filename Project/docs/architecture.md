# Dynamic Ambulance Dispatch System — Phase 1 Architecture

## 1. Architectural Overview

The Dynamic Ambulance Dispatch System has transitioned from a standalone C++ terminal application into a modern, production-minded full-stack web platform while strictly preserving the existing C++ codebase, ODBC repository, database schema, and test suite.

```
                              MONOREPO WORKSPACE
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│   ┌───────────────────────────┐                  ┌───────────────────────────┐   │
│   │     Frontend (Vite+React) │                  │     Backend (Node.js)     │   │
│   │     - Tailwind CSS        │  HTTP / Axios    │     - Express (ESM)       │   │
│   │     - React Router v6     │ ───────────────> │     - Sequelize ORM       │   │
│   │     - EMS Command Shell   │                  │     - Centralized Error   │   │
│   │     - Health Badge        │                  │     - Structured Logger   │   │
│   └───────────────────────────┘                  └─────────────┬─────────────┘   │
│                                                                │                 │
│                                                                │ Tedious         │
│   ┌───────────────────────────┐                                │ (Port 1433)     │
│   │     Legacy C++ Engine     │                                │                 │
│   │     - hospital_final.cpp  │       ODBC Driver 18           │                 │
│   │     - database_repo.cpp   │ ──────────────────────┐        │                 │
│   │     - test_hospital.cpp   │ (Trusted_Connection)  │        │                 │
│   └───────────────────────────┘                       │        │                 │
│                                                       v        v                 │
│                                             ┌───────────────────────┐            │
│                                             │ Microsoft SQL Server  │            │
│                                             │   (SQLEXPRESS)        │            │
│                                             │ DynamicAmbulance...   │            │
│                                             └───────────────────────┘            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Layout

```text
dynamic-ambulance-system/
├── frontend/                     # React + Vite application
│   ├── public/                   # Static assets
│   ├── src/
│   │   ├── components/           # ConnectionBadge, StateFeedback (Loading, Error, Empty)
│   │   ├── layouts/              # MainLayout (EMS Command Center shell)
│   │   ├── pages/                # Dashboard, Emergencies, Ambulances, Hospitals, Settings
│   │   ├── services/             # Axios API client, healthService
│   │   ├── App.jsx               # React Router configuration
│   │   ├── main.jsx              # Application bootstrap
│   │   └── index.css             # Tailwind base & custom EMS theme variables
│   ├── .env.example              # Frontend environment reference
│   ├── package.json              # Frontend scripts & dependencies
│   ├── tailwind.config.js        # EMS design palette configuration
│   └── vite.config.js            # Vite bundler configuration
│
├── backend/                      # Node.js + Express backend
│   ├── src/
│   │   ├── config/               # env.js, database.js (Sequelize)
│   │   ├── middleware/           # requestLogger, errorHandler, notFoundHandler, validateRequest
│   │   ├── modules/              # Domain models (Hospital, Ambulance, Patient, Timeline, Feedback)
│   │   │   ├── health/           # Health controller and routes
│   │   │   ├── hospitals/        # Hospital, HospitalRoute, HospitalFeedback models
│   │   │   ├── ambulances/       # Ambulance, AmbulanceTimeline models
│   │   │   └── patients/         # Patient model
│   │   ├── routes/               # Root router and /api/v1 router
│   │   ├── utils/                # logger.js, responseFormatter.js
│   │   ├── app.js                # Express app configuration
│   │   └── server.js             # HTTP server lifecycle
│   ├── scripts/                  # Database connectivity verification script (verifyDb.js)
│   ├── tests/                    # Jest + Supertest suites (health, errorHandler, responseFormatter)
│   ├── .env.example              # Backend environment template
│   └── package.json              # Backend dependencies (ES modules)
│
├── docs/                         # Architecture, schema compatibility, feature inventory
│   ├── architecture.md
│   ├── database_compatibility.md
│   ├── legacy_feature_inventory.md
│   └── phase_roadmap.md
│
├── hospital_final.cpp            # Preserved C++ interactive terminal dispatch program
├── database_repository.h/.cpp    # Preserved C++ ODBC repository layer
├── database_schema.sql           # Canonical SQL Server creation and seed script
├── model_types.h                 # Preserved C++ model structs
├── test_hospital.cpp             # Preserved C++ assertion test suite
├── migrate_existing_data.cpp     # Preserved legacy text file importer
├── legacy_text_files/            # Preserved 9 historical text files
├── .vscode/                      # Preserved tasks.json & launch.json
├── .gitignore                    # Monorepo git configuration
├── .env.example                  # Root environment template
├── package.json                  # Root monorepo workspace scripts
└── README.md                     # Complete project documentation
```

---

## 3. Key Design Decisions

1. **JavaScript ES Modules (`"type": "module"`)**:
   Standardized on native ES modules across the Node.js backend for consistency with modern JavaScript patterns.
2. **Preservation of C++ Files in Place**:
   To avoid breaking compiler paths, `.vscode/tasks.json`, and developer workflows, the legacy C++ application files remain in the workspace root.
3. **Dual SQL Server Authentication**:
   - C++ uses ODBC Driver 18 with Windows Authentication (`Trusted_Connection=Yes`).
   - Node.js uses `tedious` driver with SQL Server Authentication (`ems_user`).
   Both access the identical database (`DynamicAmbulanceDispatch`) without conflict.
4. **Centralized Operational Response Standard**:
   All API endpoints return `{ success: true, data: ..., meta: { timestamp } }` or `{ success: false, error: { code, message, details }, timestamp }`.
5. **Real-time Diagnostic Telemetry**:
   The frontend command shell continuously queries `/api/health` every 15 seconds to display live connection status, round-trip database latency in milliseconds, and service uptime.
