# Modernization Roadmap: Mapping Legacy C++ to Web Modules

## Phase 1 (Completed)
- **Monorepo Architecture**: Coexistence of legacy C++ and modern JavaScript full-stack app.
- **Backend Foundation**: Node.js, Express (ES modules), Sequelize ORM, centralized error handling, structured logging, health check endpoint with database telemetry.
- **Frontend Foundation**: React, Vite, Tailwind CSS, React Router, Axios client, responsive EMS Command Center shell, connection status badge, loading/error/empty states.
- **Database Non-Destructive Integration**: SQL Server `DynamicAmbulanceDispatch` verified and mapped to Sequelize models without modifying schema.

## Phase 2 (Completed)
- **Authentication & Sessions**: Email/Password + Google OAuth GIS, HTTP-only secure cookie session management, refresh tokens, and CSRF protection.
- **RBAC & User Management**: Strict authorization across `ADMIN`, `DISPATCHER`, `AMBULANCE_CREW`, and `HOSPITAL_OPERATOR` roles.
- **Admin Provisioning & Approvals**: Account approval workflow, role modification, account status toggling, and audit logging.

## Phase 3 (Completed)
- **Core Data Management**: Persistent models, migrations, validations, and CRUD REST APIs for Ambulances, Hospitals, Emergencies, and Service Zones.
- **Legacy Compatibility**: Non-destructive schema extensions to `dbo.Ambulances` and `dbo.Hospitals`, creation of `dbo.Emergencies` and `dbo.ServiceZones`, preserving legacy IDs (1..15 hospitals, 1..20 ambulances, 225 routes, 9 patients) and C++ binary interoperability.
- **Management Web Interfaces**: Fully responsive React views with status toggles, telemetry drawer, incident triage queue (Levels 1–5), and sector configurations.

## Phase 4 (Completed)
- **data.gov.in NIN Health Facilities API**: Integration of government hospital directory dataset with pagination, exponential backoff retries, error sanitization, and data normalization.
- **Automated 3-Day Synchronization**: Scheduled ingestion cycle (configurable via `DATA_GOV_SYNC_INTERVAL_DAYS=3`), concurrency locking, duplicate prevention, and persistent audit history logging in `dbo.HospitalSyncHistory`.
- **Google Maps Platform Integration**: Dynamic nearby hospital discovery via Google Places API (New), driving travel time and route calculations via Google Routes API, and address geocoding via Geocoding API.
- **Interactive EMS Vector Radar & Google Maps UI**: Google Maps JavaScript API with custom vehicle/facility markers and route tracing, with high-fidelity SVG Tactical Vector Radar fallback when API keys are omitted.
- **Admin Synchronization Dashboard**: Manual sync controls, 3-day countdown, metrics, and audit history ledger.

---

## Subsequent Phases

| Functionality | Target Web Architecture Module | Phase | Technical Implementation Strategy |
| :--- | :--- | :--- | :--- |
| Floyd-Warshall / Dijkstra Pathfinding | `backend/src/modules/routing/` | Phase 4 | JavaScript graph solver class + route recommendation engine |
| Nearest-Ambulance Selection & Matching | `backend/src/modules/dispatch/` | Phase 4 | Nearest-neighbor algorithm with fuel threshold filtering |
| 6-Digit OTP Confirmation | `backend/src/modules/otp/` | Phase 4 | Time-based OTP service with session/redis token verification |
| Live GPS Fleet Tracking & Map Visualization | `frontend/src/modules/maps/` | Phase 4 | Mapbox / Leaflet integration showing ambulances and hospital nodes |
| Real-time Dispatch Broadcasting | WebSocket / Socket.IO | Phase 4 | Bidirectional push notifications on dispatch and status change |
| Dynamic Relocation & Demand Prediction | `backend/src/modules/relocation/` | Phase 5 | Predictive relocation matrix and historical emergency clustering |

