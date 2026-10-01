# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary User — EMS Dispatchers**: Operators working in high-pressure emergency dispatch centers responsible for triaging incoming emergency medical incidents, evaluating ambulance fleet availability, assigning optimal vehicles based on route recommendations, verifying dispatches with 6-digit confirmation OTPs, and monitoring hospital transfer status.
- **Secondary User — EMS System Administrators**: Supervisors managing user approvals, role-based permissions (Admin, Dispatcher, Paramedic, Hospital Staff), fleet commissioning, database audit trails, and automated 3-day government hospital directory synchronization.
- **Confirmed Collaborators**: Field ambulance crews and hospital emergency room triage liaisons.

## Product Purpose

- Deliver rapid, reliable, and deterministic coordination of emergency medical response, ambulance fleet dispatch, and hospital transfer matching.
- Bridge high-performance legacy C++ routing algorithms and transactional SQL Server persistence with an intuitive, real-time web command center.
- Success means zero dispatch latency bottlenecks, zero double-assignment conflicts, transparent and auditable emergency lifecycles, and resilient operational continuity when external APIs or network services fail.

## Positioning

A mission-critical emergency dispatch platform uniting deterministic C++ shortest-path legacy compatibility, atomic transactional state transitions, and a resilient 3-day government directory synchronization with 250m proximity deduplication and fail-safe offline route estimation.

## Operating Context

- 24/7 emergency dispatch centers and incident operations control rooms.
- High-stress, multi-screen command workstation environments where decision time is measured in seconds.
- High-contrast tactical HUD interfaces with dark command backgrounds, dynamic map radars, dense scannable data grids, and keyboard-friendly modal interactions.

## Capabilities and Constraints

- **Capabilities**:
  - Centralized, explicit emergency lifecycle state machine (`REPORTED` -> `VERIFIED` -> `DISPATCHED` -> `EN_ROUTE` -> `RESOLVED` -> `CLOSED`).
  - Route-based ambulance dispatch recommendations filtered by fuel eligibility ($\ge 20\%$) and active availability.
  - Concurrency locking preventing any ambulance from being assigned to multiple active emergencies.
  - Time-limited 6-digit dispatch confirmation OTP workflow (10-minute TTL).
  - Dedicated `resolution_notes` tracking without altering incident descriptions.
  - Automated 3-day hospital synchronization with National Data Portal (data.gov.in) using 250m proximity matching and distributed SQL Server application locks (`sp_getapplock`).
  - Automatic crash recovery for stale synchronization jobs (>30 minutes old).
  - Fail-safe Haversine route estimation and bounded API retry handling when Google Maps is blocked or quota-exhausted.
- **Constraints**:
  - Strict preservation of Microsoft SQL Server (SQLEXPRESS) database schema and legacy C++ binary compatibility (`hospital_mssql.exe`, `test_hospital.exe`).
  - Ambulance status in database must persist in lowercase (`"available"`, `"busy"`) for legacy C++ `strcmp` compatibility.
  - Hospital synchronization schedule is intentionally set to run every 3 days; this must remain unchanged.
  - Patient PII (phone number, name, clinical condition) must be sanitized (`[REDACTED]`) in audit logs.
  - Real-time ICU and hospital bed capacity must never be fabricated from static directory registries.

## Brand Commitments

- **Name**: Dynamic Ambulance Dispatch System (EMS Command Platform).
- **Tone & Voice**: Authoritative, calm, unambiguous, and clinically precise.
- **Visual Identity**: Mission-critical tactical command palette: deep slate/navy surfaces, high-visibility amber/yellow warnings, emergency crimson alerts, and operational emerald status indicators.

## Evidence on Hand

- Monorepo containing full-stack implementation through Phase 4 in `frontend/` (React + Vite + Tailwind CSS), `backend/` (Node.js + Express + Sequelize + MSSQL), and `Legacy/` (C++ ODBC engines).
- Complete engineering documentation in `docs/` (`architecture.md`, `database_compatibility.md`, `phase2_auth_guide.md`, `phase3_data_management.md`, `phase4_hospital_maps_integration.md`).
- Comprehensive test coverage: 126 passed backend tests (10/10 suites) and 30 passed frontend tests (6/6 suites).
- **Phase 5 Dispatch Engine & Workflow**: Multi-factor scoring engine (Travel Time 40%, Capability 20%, Coverage 20%, Fuel 10%, Freshness 10%), human approval enforcement, dispatcher override capture, recommendation TTL expiry (5m), pre-assignment revalidation, filtered unique index concurrency protection (`UQ_Emergencies_ActiveAmbulance`), SHA-256 idempotency key protection, and append-only event audit history.
- **Explicit Absence**: Live real-time telemetry for hospital ICU beds (must remain displayed as unintegrated/unavailable, never mocked as real-time).

## Product Principles

- **Deterministic Dispatch Over Guesswork**: Every assignment, status transition, and audit log must be transactional, validated by state machine rules, and protected against concurrency race conditions.
- **Clarity Over Clutter**: Dispatchers need high information density without visual noise. Crucial incident telemetry (severity, fuel, ETA, status) must be scannable in milliseconds.
- **Failsafe Graceful Degradation**: System must maintain operational readiness during network timeouts, Google Maps API quota exhaustion, or external sync drops via mathematical Haversine calculations and clear fallback indicators.
- **Strict Provenance & PII Confidentiality**: Patient health data must never leak into unauthenticated logs, and hospital directory metadata must remain distinct from operational capacity.

## Accessibility & Inclusion

- High-contrast visual compliance (WCAG 2.1 AA) suitable for ambient 24/7 dispatch room lighting.
- Color-blind safe status indicators combining semantic colors with distinctive icons and text badges.
- Keyboard accessible workflows for emergency intake, dispatch confirmation, and modal dialogs.
