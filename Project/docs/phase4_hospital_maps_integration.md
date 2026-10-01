# Phase 4: Hospital Data Integration, Google Maps Platform & Automated Synchronization

## 1. Executive Summary & Architectural Overview

Phase 4 of the **Dynamic Ambulance Dispatch System** expands the hospital discovery and routing ecosystem by connecting the Government of India's **data.gov.in NIN Health Facilities Registry API** with **Google Maps Platform** services (Places API New, Routes API, Geocoding API, and Maps JavaScript API).

### Architectural Boundaries
* **Primary Hospital Directory Source:** Government of India `data.gov.in` NIN Health Facilities with Geo Code and Additional Parameters API.
* **ABDM HFR Status:** Explicitly **not** used in this phase (scheduled for Phase 7).
* **Automated Synchronization:** Automatically ingests, normalizes, deduplicates, and upserts government hospital directory records every 3 days (72 hours), configurable via `DATA_GOV_SYNC_INTERVAL_DAYS`.
* **Dynamic Discovery & Routing:** Uses Google Places API (New) for dynamic facility discovery and Google Routes API for real-time driving distance and duration calculations based on the ambulance's live GPS coordinates.
* **Security & Credential Isolation:** All external API keys (`DATA_GOV_API_KEY`, `GOOGLE_MAPS_API_KEY`) remain strictly on the backend. The frontend uses a referrer-restricted `VITE_GOOGLE_MAPS_BROWSER_API_KEY` with an interactive vector radar fallback when unset.
* **Zero Fabrication Policy:** Hospital capacity, bed counts, ICU availability, and emergency services are never fabricated. Information from the government directory is marked as a facility registry, and real-time operational capacity remains explicitly unverified/extensible.
* **Legacy C++ Compatibility:** Preserves 100% binary and operational compatibility with the existing C++ application (`hospital_mssql.exe`, `test_hospital.exe`), legacy schema, and initial 15 seeded trauma centers.

---

## 2. Database Extensions (Migration 003)

Migration `003_create_phase4_tables.js` applied non-destructive additions to the existing Microsoft SQL Server database:

### A. Extended `dbo.Hospitals` Table
```sql
ALTER TABLE dbo.Hospitals ADD
  government_id NVARCHAR(100) NULL,
  district NVARCHAR(100) NULL,
  specialties NVARCHAR(MAX) NULL,
  emergency_services BIT NOT NULL DEFAULT 0,
  verification_status NVARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED',
  data_freshness NVARCHAR(50) NOT NULL DEFAULT 'FRESH',
  last_imported_at DATETIME2 NULL,
  last_synced_at DATETIME2 NULL,
  last_verified_at DATETIME2 NULL;

CREATE NONCLUSTERED INDEX IX_Hospitals_GovernmentID ON dbo.Hospitals(government_id) WHERE government_id IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_Hospitals_Coordinates ON dbo.Hospitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

### B. New `dbo.HospitalSyncHistory` Table
Tracks comprehensive audit telemetry for all automated and manual synchronization cycles:
* `id`: Primary Key (Identity)
* `sync_id`: Unique execution identifier (`sync-YYYYMMDD-HHMMSS-RAND`)
* `trigger_type`: `'SCHEDULED'` | `'MANUAL'`
* `started_at`, `completed_at`: High-precision timestamps
* `duration_ms`: Duration of sync batch in milliseconds
* `status`: `'PENDING'` | `'RUNNING'` | `'COMPLETED'` | `'PARTIALLY_COMPLETED'` | `'FAILED'`
* `total_fetched`: Records retrieved from data.gov.in
* `records_inserted`: New facility records added
* `records_updated`: Existing records refreshed with new parameters
* `records_skipped`: Records skipped due to invalid data or absence of changes
* `records_failed`: Records encountering database insertion errors
* `error_details`: Sanitized error messages (redacted of API keys)

---

## 3. Government of India data.gov.in NIN Registry Integration

### Dataset Resource Specifications
* **Resource Slug:** `nin-health-faclities-geo-code-and-additional-parameters-updated-till-last-month`
* **API Endpoint Base:** `https://api.data.gov.in/resource/`
* **Authentication:** Query parameter `api-key=<DATA_GOV_API_KEY>`
* **Format:** `format=json`
* **Pagination:** Standard limit and offset paging (`limit=50&offset=N`)

### Field Mapping & Normalization
| Government API Field | Normalized Model Field | Database Column | Notes |
| :--- | :--- | :--- | :--- |
| `nin_to_hfr_id` / `nin` | `government_id` | `government_id` | Primary stable registry identifier |
| `facility_name` | `name` | `HospitalName` | Sanitized to 50 chars for C++ UQ compatibility |
| `facility_address` | `address` | `address`, `Location` | Facility street address |
| `district_name` | `district` | `district` | Administrative district |
| `state_name` | `state` | `state` | Administrative state |
| `pincode` | `postal_code` | `postal_code` | Postal index number |
| `latitude` | `latitude` | `latitude` | Validated between -90 and +90 |
| `longitude` | `longitude` | `longitude` | Validated between -180 and +180 |
| `contact_number` | `phone` | `phone` | Primary facility telephone |
| `facility_type` | `facility_type` | `facility_type` | Normalized to `GENERAL_HOSPITAL`, `TRAUMA_CENTER`, etc. |
| `ownership` | `ownership` | `ownership` | Normalized to `PUBLIC`, `PRIVATE`, `TRUST` |

### Error Sanitization & Security
All outbound requests and catch blocks in `DataGovService` sanitize error strings using regex to ensure `api-key` values are completely redacted (`[REDACTED_API_KEY]`) before writing to logs, audit tables, or API responses.

---

## 4. 3-Day Automated Synchronization Scheduler

Implemented in `HospitalSyncScheduler` (`backend/src/modules/hospitals/hospitalSync.scheduler.js`):
1. **Recurring Check:** Executes an hourly check against `dbo.HospitalSyncHistory`.
2. **72-Hour Interval Evaluation:** Calculates whether `now - last_successful_sync >= DATA_GOV_SYNC_INTERVAL_DAYS * 24h`.
3. **Startup Verification:** Checks within 15 seconds of server startup if synchronization is overdue (e.g., after maintenance or server restarts).
4. **Concurrency Locking:** Employs an in-memory lock and checks `dbo.HospitalSyncHistory` for any active `RUNNING` status within the last 30 minutes to prevent overlapping runs.
5. **Conservative Matching:**
   * Matches by `government_id` first.
   * If `government_id` is missing, matches by normalized facility name within 250 meters.
   * If an identical name exists in another district, suffixes the district name (`Apollo Hospital (Bengaluru Urban)` vs `Apollo Hospital (Mysuru)`) to preserve the unique constraint.
6. **Graceful Failure & Backoff:** Transient network errors retry up to 3 times with exponential backoff. Incomplete responses never delete existing database entries.

---

## 5. Google Maps Platform Integration

### A. Google Places API (New)
* **Endpoint:** `POST https://places.googleapis.com/v1/places:searchNearby`
* **Headers:** `X-Goog-Api-Key`, `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.nationalPhoneNumber,places.rating,places.userRatingCount`
* **Cache:** 5-minute memory cache by coordinate and radius to conserve API quota.
* **Deduplication:** Cross-matches discovered Places against local database hospitals using `google_place_id` or GPS distance (< 250m) + normalized name matching. Matches are tagged as `data_source = 'MATCHED_BOTH'` and `verification_status = 'CROSS_MATCHED'`.

### B. Google Routes API
* **Endpoint:** `POST https://routes.googleapis.com/directions/v2:computeRoutes`
* **Routing Mode:** `DRIVE` with `routingPreference: 'TRAFFIC_AWARE'`
* **Field Mask:** `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline`
* **Haversine Fallback:** When Google Maps API key is unset or quota fails, the system automatically uses urban detour speed modeling (1.3x straight-line distance at 35 km/h) to provide uninterrupted routing estimates.

### C. Google Geocoding API
* **Endpoint:** `GET https://maps.googleapis.com/maps/api/geocode/json`
* Used on-demand to resolve addresses lacking GPS coordinates.

### D. Google Maps JavaScript API (Frontend)
* Dynamically loads `maps.googleapis.com/maps/api/js` using `VITE_GOOGLE_MAPS_BROWSER_API_KEY`.
* When key is present: renders interactive dark-styled roadmap with custom ambulance marker, color-coded hospital markers, info windows, and route polylines.
* When key is omitted: seamlessly displays an interactive **EMS Tactical Vector Radar & Canvas** with concentric scanning rings, distance vectors, and legend.

---

## 6. API Endpoints

### 1. Dynamic Nearby Hospital Discovery
```http
GET /api/v1/hospitals/nearby?lat=12.9716&lng=77.5946&radius=15000
GET /api/hospitals/nearby?ambulance_id=1&radius=20000
```
* **Authorization:** `ADMIN`, `DISPATCHER`, `AMBULANCE_CREW`, `HOSPITAL_OPERATOR`
* **Query Parameters:**
  * `lat` or `latitude`: Float (-90 to 90)
  * `lng` or `longitude`: Float (-180 to 180)
  * `radius`: Integer in meters (500 to 50,000; defaults to 15,000)
  * `ambulance_id`: Integer ID of fleet unit (resolves coordinates from vehicle if lat/lng omitted)
* **Response:**
```json
{
  "success": true,
  "data": {
    "search_center": { "latitude": 12.9716, "longitude": 77.5946 },
    "search_radius_meters": 15000,
    "total_candidates": 14,
    "sources_summary": {
      "local_database": 10,
      "google_places": 4,
      "matched_both": 2
    },
    "hospitals": [
      {
        "HospitalID": 101,
        "HospitalName": "Bowring and Lady Curzon Hospital",
        "distance_km": 2.1,
        "duration_minutes": 7,
        "data_source": "MATCHED_BOTH",
        "verification_status": "CROSS_MATCHED",
        "data_freshness": "FRESH"
      }
    ]
  }
}
```

### 2. Manual Administrative Synchronization
```http
POST /api/v1/admin/hospitals/sync
POST /api/admin/hospitals/sync
```
* **Authorization:** `ADMIN` only.

### 3. Synchronization Status
```http
GET /api/v1/admin/hospitals/sync/status
GET /api/admin/hospitals/sync/status
```
* **Authorization:** `ADMIN` only.
* Returns scheduler readiness, running status, interval, last sync, and next scheduled run.

### 4. Synchronization Audit History
```http
GET /api/v1/admin/hospitals/sync/history?page=1&limit=10
GET /api/admin/hospitals/sync/history
```
* **Authorization:** `ADMIN` only.
* Returns paginated audit entries with duration, status, and upsert counts.

---

## 7. Frontend Integration & Admin Dashboard

1. **Nearby Radar & Discovery Tab:**
   * Added to `frontend/src/pages/HospitalsPage.jsx` alongside Grid and Table views.
   * Includes ambulance fleet selector dropdown, manual GPS coordinate inputs, browser geolocation button, and radius filter (5km to 50km).
   * Renders `GoogleMapView` with interactive polyline tracing and candidate list sorted by travel time.
2. **Admin Synchronization Modal:**
   * Accessible via the header "Gov Directory Sync" button for administrators.
   * Displays 3-day sync schedule countdown, telemetry metrics (Fetched, Inserted, Updated, Skipped, Failed), real-time status badge, and "Trigger Sync Now" button.
   * Full paginated audit history table.
3. **Details Drawer:**
   * Shows Government NIN Identifier, Verification Status (`VERIFIED`, `CROSS_MATCHED`, `UNVERIFIED`), Data Freshness (`FRESH`, `STALE`), District, State, and Last Synced timestamp.

---

## 8. Verification & Test Results

### Test Suite Execution
* **Backend Tests:** 8 test suites, **79 passing tests** (including 19 Phase 4 tests in `backend/tests/phase4.test.js`).
* **Frontend Tests:** 5 test suites, **24 passing tests** (including 6 Phase 4 tests in `frontend/src/tests/Phase4NearbyMap.test.jsx`).
* **Frontend Production Build:** `vite build` completed in 6.31s with zero bundle warnings.
* **C++ Regression Test:** `.\test_hospital.exe` executed cleanly with all shortest path and selection assertions passing.
* **C++ Application:** `hospital_mssql.exe` starts, connects to SQL Server, displays hospital data, and exits without regressions.
