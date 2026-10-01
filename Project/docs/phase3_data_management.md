# PHASE 3 — Core Data Management Documentation

## 1. Executive Summary
Phase 3 builds the persistent data management foundation for the Dynamic Ambulance Dispatch System. It establishes secure, validated CRUD APIs and responsive administrative/dispatcher management screens for:
1. **Ambulance Fleet Directory & Telemetry**
2. **Hospital Network & Trauma Centers**
3. **Emergency Incident Intake & Triage Queue**
4. **Dispatch Service Zones & Coverage Sectors**

All additions preserve complete compatibility with the legacy C++ system (`hospital_final.cpp`, `database_repository.cpp`, `hospital_mssql.exe`), the 15 seeded legacy hospitals, the 20 seeded ambulances, the 225 legacy route values, and the existing patient/timeline/feedback records.

---

## 2. Legacy-to-JavaScript Data Model Mapping

| Entity | Legacy SQL / C++ Column | Legacy Type | New Sequelize Field | New DB Column | Type / Constraint | Semantic Purpose & Coexistence Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hospital** | `HospitalID` | `INT PRIMARY KEY` | `id` / `HospitalID` | `HospitalID` | `INT PRIMARY KEY` | Preserved legacy identifier (1..15+). Not auto-incremented by DB; safely assigned via `beforeValidate` hook `COALESCE(MAX(ID), 0) + 1`. |
| | `HospitalName` | `VARCHAR(100)` | `name` / `HospitalName` | `HospitalName` | `VARCHAR(100) NOT NULL` | Matches legacy C++ struct `Hospital.name`. |
| | `Location` | `VARCHAR(100)` | `address` | `Location` (reused) | `VARCHAR(255) NULL` | Extended column size non-destructively; holds address/locality string. |
| | `TotalBeds` | `INT` | `total_beds` | `TotalBeds` | `INT DEFAULT 100` | Preserves legacy bed tracking. |
| | `AvailableBeds`| `INT` | `available_beds`| `AvailableBeds`| `INT DEFAULT 20` | Preserves legacy bed availability. |
| | *(New Phase 3)*| — | `legacy_id` | `legacy_id` | `INT NULL` | Explicit mirror of legacy HospitalID for foreign integrations. |
| | *(New Phase 3)*| — | `hfr_id` | `hfr_id` | `VARCHAR(100) NULL` | Optional registry ID for future HFR ingestion (not fabricated). |
| | *(New Phase 3)*| — | `google_place_id`| `google_place_id`| `VARCHAR(100) NULL` | Optional place ID for future Google Places matching. |
| | *(New Phase 3)*| — | `city` | `city` | `VARCHAR(100) DEFAULT 'Bengaluru'` | Municipal jurisdiction. |
| | *(New Phase 3)*| — | `state` | `state` | `VARCHAR(100) DEFAULT 'Karnataka'` | State jurisdiction. |
| | *(New Phase 3)*| — | `postal_code` | `postal_code` | `VARCHAR(20) NULL` | Postal PIN code. |
| | *(New Phase 3)*| — | `latitude` | `latitude` | `DECIMAL(10,7) NULL` | Precise GPS latitude (separate from legacy matrix routing). |
| | *(New Phase 3)*| — | `longitude` | `longitude` | `DECIMAL(10,7) NULL` | Precise GPS longitude (separate from legacy matrix routing). |
| | *(New Phase 3)*| — | `facility_type` | `facility_type` | `VARCHAR(50) DEFAULT 'GENERAL_HOSPITAL'` | Trauma Level 1–3, Specialized, Community. |
| | *(New Phase 3)*| — | `ownership` | `ownership` | `VARCHAR(50) DEFAULT 'PRIVATE'` | `PUBLIC`, `PRIVATE`, `TRUST`. |
| | *(New Phase 3)*| — | `phone` | `phone` | `VARCHAR(30) NULL` | Direct emergency reception hotline. |
| | *(New Phase 3)*| — | `is_active` | `is_active` | `BIT DEFAULT 1` | Soft deactivation toggle. |
| | *(New Phase 3)*| — | `data_source` | `data_source` | `VARCHAR(50) DEFAULT 'MANUAL'` | Provenance: `SEED`, `MANUAL`, `HFR`, `MAPS`. |
| | *(New Phase 3)*| — | `created_at` / `updated_at` | `created_at` / `updated_at` | `DATETIME2 DEFAULT GETUTCDATE()` | Audit timestamps. |
| **Ambulance** | `AmbulanceID` | `INT PRIMARY KEY` | `id` / `AmbulanceID` | `AmbulanceID` | `INT PRIMARY KEY` | Preserved legacy identifier (1..20+). Safe `beforeValidate` allocation. |
| | `CurrentHospitalID` | `INT` | `current_hospital_id` | `CurrentHospitalID` | `INT NOT NULL FK` | Station location index (1-based hospital index). Maintained for legacy pathfinding and C++ Dijkstra dispatch. |
| | `Status` | `VARCHAR(20)` | `status` | `Status` | `VARCHAR(30) NOT NULL` | Standardized lowercase in DB (`available`, `busy`, `out_of_service`, `maintenance`) for C++ `strcmp(..., "available") == 0` compatibility. |
| | `Fuel` | `INT` | `fuel_level` | `Fuel` | `INT NOT NULL CHECK (0..100)` | Fuel percentage level. |
| | *(New Phase 3)*| — | `fleet_code` | `fleet_code` | `VARCHAR(50) UNIQUE NULL`| Human-readable unit callsign (e.g., `AMB-001`). Auto-generated if omitted. |
| | *(New Phase 3)*| — | `vehicle_type` | `vehicle_type` | `VARCHAR(50) DEFAULT 'ADVANCED_LIFE_SUPPORT'` | `ADVANCED_LIFE_SUPPORT`, `BASIC_LIFE_SUPPORT`, `PATIENT_TRANSPORT`, `NEONATAL`. |
| | *(New Phase 3)*| — | `registration_number`| `registration_number`| `VARCHAR(50) UNIQUE NULL`| Regional motor vehicle registration (e.g. `KA-01-EQ-1001`). |
| | *(New Phase 3)*| — | `current_location_lat`| `current_location_lat`| `DECIMAL(10,7) NULL`| Real-time GPS latitude (separated from legacy hospital station). |
| | *(New Phase 3)*| — | `current_location_lng`| `current_location_lng`| `DECIMAL(10,7) NULL`| Real-time GPS longitude. |
| | *(New Phase 3)*| — | `is_active` | `is_active` | `BIT DEFAULT 1` | Soft deactivation flag. |
| | *(New Phase 3)*| — | `legacy_id` | `legacy_id` | `INT NULL` | Legacy ID duplicate tracking. |
| | *(New Phase 3)*| — | `created_at` / `updated_at` | `created_at` / `updated_at` | `DATETIME2 DEFAULT GETUTCDATE()` | Audit timestamps. |
| **Emergency** | *(New Table)* | — | `id` | `id` | `INT IDENTITY PRIMARY KEY` | New persistent intake incident table. |
| | *(New Phase 3)*| — | `incident_code`| `incident_code`| `VARCHAR(50) UNIQUE NOT NULL` | Unique incident identifier (e.g., `INC-20260930-1042`). |
| | *(New Phase 3)*| — | `patient_id` | `patient_id` | `INT NULL FK(Patients.id)`| Optional link to registered patient records in `dbo.Patients`. |
| | *(New Phase 3)*| — | `reported_by_user_id`| `reported_by_user_id`| `INT NULL FK(Users.id)` | Dispatcher or Admin user ID recording the incident. |
| | *(New Phase 3)*| — | `emergency_type`| `emergency_type`| `VARCHAR(50) NOT NULL` | `CARDIAC`, `TRAUMA`, `RESPIRATORY`, `STROKE`, `ACCIDENT`, `MATERNAL`, `PEDIATRIC`, `OTHER`. |
| | *(New Phase 3)*| — | `severity` | `severity` | `INT NOT NULL CHECK (1..5)` | Triage Priority Level: 1 (Non-urgent) to 5 (Resuscitation). Documented application scale. |
| | *(New Phase 3)*| — | `description` | `description` | `NVARCHAR(MAX) NULL` | Detailed caller narrative and symptoms. |
| | *(New Phase 3)*| — | `location_address`| `location_address`| `VARCHAR(255) NOT NULL` | Caller-reported street address or landmark. |
| | *(New Phase 3)*| — | `latitude` | `latitude` | `DECIMAL(10,7) NULL` | Geocoded incident latitude. |
| | *(New Phase 3)*| — | `longitude` | `longitude` | `DECIMAL(10,7) NULL` | Geocoded incident longitude. |
| | *(New Phase 3)*| — | `status` | `status` | `VARCHAR(30) DEFAULT 'REPORTED'` | `REPORTED`, `VERIFIED`, `CANCELLED`, `CLOSED`. Operational dispatch statuses reserved for Phase 4. |
| | *(New Phase 3)*| — | `assigned_ambulance_id`| `assigned_ambulance_id`| `INT NULL FK(Ambulances)` | Reserved for Phase 4 dispatch optimization. |
| | *(New Phase 3)*| — | `assigned_hospital_id` | `assigned_hospital_id` | `INT NULL FK(Hospitals)` | Reserved for Phase 4 hospital matching. |
| | *(New Phase 3)*| — | `resolution_notes`| `resolution_notes`| `NVARCHAR(MAX) NULL` | Incident closure / cancellation rationale. |
| | *(New Phase 3)*| — | `resolved_at` | `resolved_at` | `DATETIME2 NULL` | Timestamp of closure. |
| | *(New Phase 3)*| — | `created_at` / `updated_at` | `created_at` / `updated_at` | `DATETIME2 DEFAULT GETUTCDATE()` | Audit timestamps. |
| **Service Zone**| *(New Table)* | — | `id` | `id` | `INT IDENTITY PRIMARY KEY` | New persistent administrative sector table. |
| | *(New Phase 3)*| — | `zone_code` | `zone_code` | `VARCHAR(50) UNIQUE NOT NULL`| Dispatch sector code (e.g. `BLR-CENTRAL`, `BLR-SOUTH`). |
| | *(New Phase 3)*| — | `name` | `name` | `VARCHAR(100) NOT NULL` | Human-readable sector name. |
| | *(New Phase 3)*| — | `description` | `description` | `NVARCHAR(MAX) NULL` | Landmark boundaries and coverage profile. |
| | *(New Phase 3)*| — | `is_active` | `is_active` | `BIT DEFAULT 1` | Soft deactivation flag. |
| | *(New Phase 3)*| — | `centroid_lat` | `centroid_lat` | `DECIMAL(10,7) NULL` | Geographic centroid latitude for response radius modeling. |
| | *(New Phase 3)*| — | `centroid_lng` | `centroid_lng` | `DECIMAL(10,7) NULL` | Geographic centroid longitude. |
| | *(New Phase 3)*| — | `coverage_radius_km`| `coverage_radius_km`| `DECIMAL(6,2) DEFAULT 10.0` | Nominal response coverage radius in kilometers. |
| | *(New Phase 3)*| — | `created_at` / `updated_at` | `created_at` / `updated_at` | `DATETIME2 DEFAULT GETUTCDATE()` | Audit timestamps. |

---

## 3. Database Migration and Legacy Compatibility Guarantees

### Migration Execution
Migration `backend/src/migrations/002_create_phase3_tables.js` was executed non-destructively:
1. `dbo.Ambulances`: Added `fleet_code`, `vehicle_type`, `registration_number`, `current_location_lat`, `current_location_lng`, `is_active`, `legacy_id`, `created_at`, `updated_at`. Populated default `fleet_code = 'AMB-' + FORMAT(AmbulanceID, 'd3')` and `registration_number` for existing 20 ambulances.
2. `dbo.Hospitals`: Added `hfr_id`, `google_place_id`, `city`, `state`, `postal_code`, `latitude`, `longitude`, `facility_type`, `ownership`, `phone`, `is_active`, `data_source`, `source_updated_at`, `legacy_id`, `created_at`, `updated_at`. Populated existing 15 hospitals with `legacy_id = HospitalID`, `data_source = 'SEED'`.
3. `dbo.Emergencies`: Created with foreign keys to `dbo.Patients(id)`, `dbo.Users(id)`, `dbo.Ambulances(AmbulanceID)`, and `dbo.Hospitals(HospitalID)`.
4. `dbo.ServiceZones`: Created and seeded with 5 default Bengaluru operational sectors (`BLR-CENTRAL`, `BLR-SOUTH`, `BLR-EAST`, `BLR-NORTH`, `BLR-WEST`).
5. **Rollback Script (`backend/scripts/rollback.js`)**: Provided with safe, idempotent `DROP TABLE IF EXISTS` and `ALTER TABLE DROP COLUMN` operations.

### Legacy C++ Compatibility
- **Fixed-Size Hospital Array Boundary**: In `database_repository.cpp` line 243, `loadHospitalData` initially aborted if `id > HOSPITAL_COUNT (15)`. This was patched to `if (id < 1 || id > HOSPITAL_COUNT) continue;`, ensuring that new hospitals created via web do not crash the legacy C++ console application while safely loading the original 15 seeded hospitals and 225 route matrix entries.
- **Status String Matching**: `hospital_final.cpp` line 342 compares ambulance status using case-sensitive `strcmp(ambulances[i].status, "available") == 0`. The database model normalizes status to lowercase `'available'`, `'busy'`, `'out_of_service'`, `'maintenance'` while accepting case-insensitive input via the REST API.
- **Non-Identity Primary Keys**: Legacy tables `dbo.Hospitals` and `dbo.Ambulances` use non-identity `HospitalID` and `AmbulanceID`. Sequelize models utilize `beforeValidate` hooks to query `COALESCE(MAX(ID), 0) + 1` prior to schema validation, guaranteeing seamless co-existence when creating new records.

---

## 4. Role-Based Access Control (RBAC) Matrix

| Operation | ADMIN | DISPATCHER | AMBULANCE_CREW | HOSPITAL_OPERATOR |
| :--- | :--- | :--- | :--- | :--- |
| **Ambulances** | | | | |
| View ambulance directory (`GET /ambulances`) | Full | Full | Read-Only | Denied (403) |
| View ambulance details (`GET /ambulances/:id`) | Full | Full | Read-Only | Denied (403) |
| Commission ambulance (`POST /ambulances`) | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Update ambulance metadata (`PATCH /ambulances/:id`)| Allowed | Denied (403) | Denied (403) | Denied (403) |
| Update status & fuel (`PATCH /ambulances/:id/status`)| Allowed | Allowed | Denied (Reserved Phase 5)| Denied (403) |
| **Hospitals** | | | | |
| View hospital directory (`GET /hospitals`) | Full | Full | Denied (403) | Read-Only |
| View hospital details (`GET /hospitals/:id`) | Full | Full | Denied (403) | Read-Only |
| Register hospital (`POST /hospitals`) | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Update hospital metadata (`PATCH /hospitals/:id`) | Allowed | Denied (403) | Denied (403) | Denied (Facility linkage Phase 4)|
| Toggle hospital active status (`PATCH /hospitals/:id/status`)| Allowed | Denied (403) | Denied (403) | Denied (403) |
| **Emergencies** | | | | |
| View incident queue (`GET /emergencies`) | Full | Full | Denied (403) | Denied (403) |
| View incident details (`GET /emergencies/:id`)| Full | Full | Denied (403) | Denied (403) |
| Report emergency (`POST /emergencies`) | Allowed | Allowed | Denied (403) | Denied (403) |
| Update emergency (`PATCH /emergencies/:id`) | Allowed | Allowed | Denied (403) | Denied (403) |
| Update incident status (`PATCH /emergencies/:id/status`)| Allowed | Allowed | Denied (403) | Denied (403) |
| Cancel emergency (`POST /emergencies/:id/cancel`)| Allowed | Allowed | Denied (403) | Denied (403) |
| **Service Zones** | | | | |
| View zones (`GET /zones`) | Full | Full (View Only)| Denied (403) | Denied (403) |
| View zone details (`GET /zones/:id`) | Full | Full (View Only)| Denied (403) | Denied (403) |
| Create zone (`POST /zones`) | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Update zone (`PATCH /zones/:id`) | Allowed | Denied (403) | Denied (403) | Denied (403) |
| Toggle zone active status (`PATCH /zones/:id/status`)| Allowed | Denied (403) | Denied (403) | Denied (403) |

---

## 5. API Endpoints and Specification

### Ambulances (`/api/v1/ambulances`)
- `GET /api/v1/ambulances` — Query fleet with pagination (`page`, `limit`), search (`search`), status filter (`status`), vehicle type filter (`vehicle_type`), active filter (`is_active`), and hospital station filter (`hospital_id`).
- `GET /api/v1/ambulances/:id` — Get full ambulance details, stationed hospital name, and recent audit timeline events.
- `POST /api/v1/ambulances` — Commission new ambulance unit. Validates unique `fleet_code` and `registration_number`.
- `PATCH /api/v1/ambulances/:id` — Update vehicle type, registration, GPS coordinates, or active status.
- `PATCH /api/v1/ambulances/:id/status` — Quick status transition (`available`, `busy`, `out_of_service`, `maintenance`), fuel level update (0–100), and hospital reassignment. Automatically creates an `AmbulanceTimeline` event.

### Hospitals (`/api/v1/hospitals`)
- `GET /api/v1/hospitals` — Query network hospitals with pagination (`page`, `limit`), search (`search`), facility type filter (`facility_type`), ownership filter (`ownership`), and active filter (`is_active`). Includes stationed ambulance count and available unit count.
- `GET /api/v1/hospitals/:id` — Detailed hospital view with stationed ambulances, recent patient feedback, and verification status.
- `POST /api/v1/hospitals` — Register new medical center with contact info, facility tier, and coordinates.
- `PATCH /api/v1/hospitals/:id` — Update hospital address, contact details, total beds, available beds, or facility type.
- `PATCH /api/v1/hospitals/:id/status` — Activate or deactivate hospital facility.

### Emergencies (`/api/v1/emergencies`)
- `GET /api/v1/emergencies` — Emergency incident queue with pagination, search, status filter (`status`), emergency type filter (`emergency_type`), and triage severity filter (`severity`).
- `GET /api/v1/emergencies/:id` — Incident case file with caller description, geocoordinates, triage level, patient linkage, and audit timeline.
- `POST /api/v1/emergencies` — Report 911/108 emergency intake incident. Auto-generates unique incident code `INC-YYYYMMDD-XXXX`.
- `PATCH /api/v1/emergencies/:id` — Modify incident description, address, coordinates, or severity level.
- `PATCH /api/v1/emergencies/:id/status` — Transition incident lifecycle (`REPORTED`, `VERIFIED`, `CLOSED`).
- `POST /api/v1/emergencies/:id/cancel` — Cancel incident with mandatory resolution / cancellation notes.

### Service Zones (`/api/v1/zones`)
- `GET /api/v1/zones` — Query municipal EMS dispatch sectors with pagination, search, and active status filter.
- `GET /api/v1/zones/:id` — Detailed sector configuration with centroid GPS and coverage radius.
- `POST /api/v1/zones` — Create new service zone sector code and coverage metrics.
- `PATCH /api/v1/zones/:id` — Update zone name, description, centroid coordinates, or coverage radius.
- `PATCH /api/v1/zones/:id/status` — Activate or deactivate operational dispatch zone.

---

## 6. Frontend Management Interfaces

1. **Ambulance Management (`/ambulances`)**:
   - Grid and Table view toggles.
   - Search by fleet callsign, registration number, or legacy ID.
   - Status, vehicle capability, and lifecycle filter controls.
   - Commission Ambulance modal with validation feedback.
   - Quick Status & Fuel Update modal with audit timeline logging.
   - Ambulance Details Slide-out Drawer: Separates legacy hospital station index from GPS coordinates, visual fuel level gauge, and chronological timeline event stream.
2. **Hospital Management (`/hospitals`)**:
   - Facility type and ownership badges.
   - Searchable directory with active/inactive toggles.
   - Register Hospital modal with address and contact fields.
   - Hospital Details Drawer: Stationed fleet breakdown, patient feedback reviews and ratings, and clear indicators marking HFR and Live Telemetry integration as "Pending Phase 4/7" (no fabricated data).
3. **Emergency Management (`/emergencies`)**:
   - Triage Priority Queue (Levels 1–5 color-coded with medical emergency types).
   - Report Emergency Intake modal with optional patient linkage.
   - Lifecycle Update modal (`REPORTED` -> `VERIFIED` -> `CLOSED` / `CANCELLED`).
   - Incident Case File Drawer: Detailed narrative, patient details, and explicit notice that automated ambulance dispatch allocation is reserved for Phase 4.
4. **Service Zone Management (`/zones`)**:
   - Regional sector cards and table view.
   - Centroid coordinates, coverage radius in km, and active status badges.
   - Create and Edit Sector modals.
   - Information banner clarifying GIS polygon boundaries and live heatmaps will arrive in Phase 4/6.
