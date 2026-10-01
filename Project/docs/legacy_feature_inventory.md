# Legacy C++ System Feature Inventory & Architecture Catalog

## 1. Executive Summary
The legacy C++ Dynamic Ambulance Dispatch System was developed to model urban emergency dispatch, dynamic nearest-ambulance allocation, shortest-route graph traversal, emergency admission assessment, and patient billing with persistence in Microsoft SQL Server via ODBC.

During Phase 1 inspection, all source files, database scripts, text migration inputs, and unit tests were thoroughly audited and preserved in place.

---

## 2. Inventory of Existing Features

### Feature 1: Graph-Based Hospital Network & Route Matrix
- **Implementation**: `hospital_final.cpp`, `database_repository.cpp`, `database_schema.sql`
- **Data Model**: 15 hospitals seeded in `dbo.Hospitals`, 225 directional routes seeded in `dbo.HospitalRoutes`.
- **In-Memory Representation**: Adjacency linked list (`Node* adjList[15]`), 15x15 distance/weight matrix (`weights[15][15]`), and casualty matrix (`casualtiesMatrix[15][15]`).
- **Functionality**: Directional graph with road congestion weights, casualty capacity thresholds, and admission difficulty ratings.

### Feature 2: Shortest-Path & Route Optimization
- **Implementation**: `hospital_final.cpp` (`dijkstra`, `floyd_warshall`), `test_hospital.cpp`
- **Routing Engine**: Dijkstra's algorithm for point-to-point emergency pathfinding; Floyd-Warshall for all-pairs distance queries.
- **Smart Recommendation**: If an alternate hospital exists within a 20% distance threshold (`threshold = averageWeight * 1.2`) and has a higher user feedback rating, the system dynamically prompts the dispatcher to reroute to the higher-rated facility.
- **Visual Route Trace**: Outputs the reverse hop trace from destination to origin with individual segment weights.

### Feature 3: Dynamic Ambulance Fleet Tracking & Allocation
- **Implementation**: `hospital_final.cpp` (`findNearestAmbulance`, `updateAmbulanceStatus`), `database_repository.cpp` (`dispatchAmbulance`)
- **Fleet State**: 20 seeded ambulance units in `dbo.Ambulances`, tracked by ID, current hospital location (1–15), status (`"available"` vs `"busy"`), and fuel percentage (0–100%).
- **Allocation Rule**: Computes shortest travel delay across all available ambulances located at neighboring stations. Units with fuel below the minimum threshold (20%) are disqualified from emergency dispatch until refueled.
- **Fuel Consumption Simulation**: Fuel is decremented proportionally to the traversed road weight (`fuelUsed = (int)(averageWeight * 0.5)`).

### Feature 4: Atomic Event Audit Logging (Timeline)
- **Implementation**: `database_repository.cpp` (`dispatchAmbulance`, `addTimelineEvent`)
- **Data Model**: `dbo.AmbulanceTimeline` with auto-incrementing `TimelineID BIGINT`, `AmbulanceID`, `EventTime`, `EventType`, and `Message`.
- **Integrity**: Updates to ambulance status, fuel decrement, and timeline log insertion are wrapped in an atomic SQL Server transaction (`SQL_ATTR_AUTOCOMMIT = SQL_AUTOCOMMIT_OFF`). Both succeed or rollback together.

### Feature 5: Emergency Triage & Severity Rating
- **Implementation**: `hospital_final.cpp` (case 1)
- **Scale**: Severity levels 1 through 5.
  - **Levels 4–5 (Critical)**: Immediate priority dispatch, 1.5x–2.0x treatment cost surcharge.
  - **Levels 2–3 (Medium)**: Standard emergency dispatch, 1.0x–1.2x cost factor.
  - **Level 1 (Low)**: Non-emergency scheduled transport, 0.8x cost factor.
- **Admission Difficulty**: Evaluated based on casualty count at the admitting hospital (`Easy` / `Moderate` / `High` / `Full`).

### Feature 6: OTP (One-Time Password) Verification Flow
- **Implementation**: `hospital_final.cpp` (`confirmOTP()`)
- **Workflow**: Generates a pseudo-random 6-digit confirmation code (`rand() % 900000 + 100000`) displayed to the operator. The dispatch cannot proceed until the matching OTP is submitted, preventing accidental dispatches.

### Feature 7: Patient Registration, Admission & Record Updates
- **Implementation**: `hospital_final.cpp` (cases 1, 4, 5), `database_repository.cpp` (`insertPatient`, `updatePatient`, `getPatientById`)
- **Data Model**: `dbo.Patients` storing Patient ID, Name, Age, Blood Group, Gender, Address, Condition, Vaccines Done, Area of Treatment, Insurance, Phone Number, Assigned Hospital, Optimal Cost, Severity, Current Treatment Cost, and Total Expenditure.
- **Operations**:
  - Admission registration upon dispatch completion.
  - Search patient record by ID.
  - Partial or full updates to existing patient records.

### Feature 8: Hospital Feedback & Dynamic Rating System
- **Implementation**: `hospital_final.cpp` (cases 2, 7), `database_repository.cpp` (`addHospitalFeedback`, `getAverageHospitalFeedbackRating`)
- **Data Model**: `dbo.HospitalFeedback` storing `HospitalID`, `Rating` (1–5 stars), `FeedbackText` (500 chars), and `CreatedAt`.
- **Dynamic Rating**: Real-time SQL aggregation (`AVG(CAST(Rating AS FLOAT))`) replaces static hardcoded ratings.

### Feature 9: Aggregated EMS Statistics Generation
- **Implementation**: `hospital_final.cpp` (case 6), `database_repository.cpp` (`getPatientStatistics`)
- **Metrics**: Total patients admitted, percentage vaccinated, percentage insured, and average optimal cost calculated via SQL aggregations.

### Feature 10: Legacy Text File Migration Importer
- **Implementation**: `migrate_existing_data.cpp`
- **Data Source**: `legacy_text_files/` (`patient_details.txt`, `ambulance_locations.txt`, `hospital_feedback.txt`, `ambulance_timeline.txt`).
- **Purpose**: One-time importer that normalized unstructured flat files into the relational database.

### Feature 11: Graph Algorithm Unit Tests
- **Implementation**: `test_hospital.cpp`
- **Coverage**: Floyd-Warshall shortest path calculation and nearest hospital selection tests with assertion verification.

---

## 3. Preserved File Catalog
All original files remain in the workspace root, preserving build tasks and command-line compatibility:
- `hospital_final.cpp` — Main interactive C++ dispatch terminal application.
- `database_repository.h` & `database_repository.cpp` — ODBC SQL Server repository.
- `database_schema.sql` — Canonical DDL & DML script for SQL Server database.
- `model_types.h` — Core C++ data structures.
- `migrate_existing_data.cpp` — One-time legacy data migration utility.
- `patientSorted.cpp` — Secondary sorting utility.
- `test_hospital.cpp` — C++ assertion test suite.
- `legacy_text_files/` — Historical text data files (9 files).
- `.vscode/` (`tasks.json`, `launch.json`) — Visual Studio Code build and debug profiles.
