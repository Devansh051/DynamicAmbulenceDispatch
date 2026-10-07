# Phase 1-5 completion and verification record

Verification performed October 6-7, 2026, against the existing working tree. This is the acceptance record; earlier success totals are superseded. No Phase 6 work, replacement scaffold, architecture migration, destructive Git operation, operational table deletion, or production-data cleanup was performed.

## A. Acceptance decision

| Phase | Status | Evidence / limit |
| --- | --- | --- |
| Phase 1 | VERIFIED | Existing Node/Express, React/Vite, Sequelize/SQL, migrations and C++ builds execute. |
| Phase 2 | PARTIALLY VERIFIED | Password/cookie/bearer/RBAC and persistent revocation tested; live Google identity is externally blocked at the demo origin. |
| Phase 3 | VERIFIED | SQL-backed ambulance, hospital, zone and emergency workflows pass. |
| Phase 4 | PARTIALLY VERIFIED | Google map and Routes API work; routing fallback, ranking and deduplication tested. Places and Data.gov.in live acceptance remain externally blocked. |
| Phase 5 | VERIFIED | Dispatch, concurrency, telemetry, real Redis/Socket.IO, SQL history, worker recovery and simulator tested; browser evidence below. |

The local Phase 1-5 system is working and demonstrable. An unqualified **PHASE 1-5 COMPLETE** claim is withheld until the external Phase 2/4 checks are cleared. This is a verification of this development configuration, not an assertion about an untested deployment.

## B. Already implemented before this continuation

- Express/Sequelize SQL Server backend, React/Vite frontend, migrations and legacy C++17 ODBC application.
- Password and Google Identity authentication, JWT/cookie/bearer sessions, protected routes, approvals and role authorization.
- Ambulance/hospital/zone directories, persistent emergency workflows and audit records.
- Data.gov.in synchronization, Places discovery/deduplication, Google Maps/Routes and explicit estimation fallback.
- Phase 5 candidate scoring, hard capability/fuel/assignment filtering, dispatcher recommendations/approval/override, TTL, reassignment, escalation, lifecycle, idempotency and unique assignment index.
- Redis fleet store, validated device telemetry, crew/device binding, health monitoring, Socket.IO snapshots/updates, sampled SQL persistence worker, bounded queue and simulator.
- React live fleet/map components and migrations 006/007. These were inspected and repaired in place.

## C. Defects fixed in this continuation

1. Explicit DB_PORT was ignored for named SQL instances. It now selects the actual TCP endpoint and is range validated; verification observed port 1433. Database verification and sqlcmd test setup use consistent configuration.
2. Redis read failure could be treated as an empty fleet during dispatch. It now fails closed, separately from the valid base-coordinate fallback for missing GPS.
3. Assignment revalidation could miss coordinate eligibility; it now rechecks fresh valid GPS or valid assigned-base coordinates inside the locked assignment transaction.
4. Reassignment lacked equivalent locked capability/fuel/live-state revalidation. Both vehicle locks are acquired in consistent ID order and eligibility is rechecked.
5. Reassignment event history recorded the overwritten status. It now records the original lifecycle status.
6. Idempotency records could be written after assignment commit or have write errors swallowed. Command and replay record now commit together, with a transaction-owned application lock for concurrent duplicate keys; expired keys can be reused safely.
7. Superseded recommendations could be approved. Recommendation ownership/current ID/activity/expiry are now checked.
8. Lifecycle commands now validate an optional expected version; SQL optimistic concurrency and the active-assignment index remain authoritative. Regression checks cover repeated terminal release and an old closed incident not releasing a newly assigned unit.
9. Emergency creation omitted its CREATED history entry. The entry is now in the creation transaction.
10. Recalculation accepted terminal/assigned incidents. It now rejects those states.
11. Partial numeric ambulance IDs and coercible non-coordinate values were accepted. IDs must be positive integers, and coordinates reject null/blank/boolean/object/array coercion.
12. Telemetry source_id could disagree with the authenticated source. It must match; device-to-ambulance and simulation binding remain enforced.
13. Simulator credential ingress could run in production. Both middleware and tracker now reject it.
14. fleet:health was not emitted consistently. Health changes now have a coalesced explicit event; Redis epoch changes are also published.
15. Socket authentication did not accept the session cookie; it now does, while retaining role/account checks.
16. Snapshot failure and Redis recovery could leave clients without authoritative state. Snapshot retries and Redis recovery snapshots were added.
17. Frontend state could appear live when Redis was unavailable. Errors now identify last-known state and the connection badge shows LAST SNAPSHOT.
18. Socket reconnection stopped after eight attempts. Transport retries continue at a bounded delay; temporary authentication-store failures retry, rejected credentials stop, and unmount cancels timers. Server permission checks distinguish temporary storage failures from authorization denial.
19. Logout revocations existed only in process memory. Token hashes with expiry are now held in shared Redis, checked on HTTP/socket authentication, and tested from a fresh Node process. Authentication fails closed without the store.
20. Nearby routing treated SQL checkpoint coordinates as live GPS. It now uses fresh Redis GPS or valid base coordinates, with explicit provenance.
21. Hospital recommendations invented clinical capabilities. They now expose known facility type, unverified capability status and UNKNOWN capacity only.
22. Custom dispatch weights did not drive all score components/explanations. Configured finite nonnegative weights totaling 100 now scale the existing curves and metadata.
23. Google retry errors could expose credentials; sanitization now redacts both configured secrets and key parameters. Geocoding accepts valid zero coordinates.
24. Data.gov.in application-error responses could look like a successful empty directory. Explicit provider error responses now fail the sync.
25. Hospital sync application locks could belong to a different pooled connection or fail open. They now belong to a dedicated SQL transaction and are always released; shutdown also cancels the startup timer.
26. Manual ambulance state changes bypassed durable fleet synchronization. They now write the shared operational history/outbox transaction.
27. Pending worker recovery replayed in the wrong order. It now restores oldest pending work first. An acknowledgment after losing the worker lease is rejected, preserving replayable work.
28. Queue metadata implied unconditional Redis durability. It now explicitly reports dependency on Redis persistence configuration.
29. Hospital/origin map popup text was not consistently escaped; it is now escaped. Invalid coordinate coercion is rejected at the map boundary too.
30. Google script loading could remain blank indefinitely. It now shows loading, has a 15-second timeout and explicit vector fallback, and cleans up event handlers. Fleet fallback labels no longer imply every historical point is live.
31. Legacy disconnected Dijkstra traversal could use an invalid vertex; vehicle selection could index outside the fixed matrix, reject a same-location vehicle, or choose an unreachable route. These cases are corrected without replacing the solvers.
32. Legacy ODBC dispatch could bypass Phase 5 guarantees. Fleet writes are rejected when Phase 5 schema is present; legacy graph reads remain available and limited to valid station IDs. ODBC also honors DB_PORT.
33. SQL fixture cleanup omitted new operational history, causing Phase 3 teardown to fail. Cleanup now targets only that suite's isolated fixture IDs. SQL-writing suites enforce the _Test database guard and use separate Redis namespaces.
34. Demo verification previously counted only accumulated history. It now asserts newly persisted samples plus duplicate-event and simulation-flag integrity.

## D. Files changed during this continuation

Paths are relative to `D:/DynamicAmbulenceDispatch/Project`. This list distinguishes continuation edits from the much larger pre-existing dirty working tree.

```text
Legacy/database_repository.cpp
Legacy/database_repository.h
Legacy/hospital_final.cpp
Legacy/test_phase5.cpp
backend/src/config/env.js
backend/src/middleware/authenticate.js
backend/src/modules/auth/auth.controller.js
backend/src/modules/auth/session.service.js
backend/src/modules/dispatch/dispatchConfig.js
backend/src/modules/dispatch/dispatchEngine.service.js
backend/src/modules/dispatch/idempotency.service.js
backend/src/modules/emergencies/emergency.service.js
backend/src/modules/ambulances/ambulance.service.js
backend/src/modules/fleet/fleetDispatchOutbox.js
backend/src/modules/fleet/fleetTracker.service.js
backend/src/modules/fleet/fleetState.store.js
backend/src/modules/fleet/fleet.socket.js
backend/src/modules/fleet/telemetry.validation.js
backend/src/modules/fleet/telemetryAuth.middleware.js
backend/src/modules/hospitals/dataGov.service.js
backend/src/modules/hospitals/googleMaps.service.js
backend/src/modules/hospitals/hospital.service.js
backend/src/modules/hospitals/hospitalSync.service.js
backend/src/modules/hospitals/hospitalSync.scheduler.js
backend/src/utils/coordinates.js
backend/scripts/verifyDb.js
backend/scripts/setupTestDatabase.js
backend/scripts/verifyPhaseSchema.js
backend/scripts/verifyFleetDemo.js
backend/scripts/controlFleetDemo.js
backend/scripts/verifyFleetRecovery.js
backend/scripts/verifyFleetPerformance.js
backend/scripts/verifyExternalServices.js
backend/tests/databaseSafety.setup.js
backend/tests/phase3.test.js
backend/tests/fleet_safety.test.js
backend/tests/fleet_integration.test.js
frontend/src/components/FleetDigitalTwinPanel.jsx
frontend/src/components/GoogleMapView.jsx
frontend/src/services/fleetService.js
frontend/src/services/fleetState.js
frontend/src/tests/FleetDigitalTwin.test.jsx
frontend/src/tests/FleetMap.test.jsx
frontend/src/tests/FleetService.test.jsx
PHASE1_5_AUDIT.md
PHASE1_5_PROGRESS.md
PHASE1_5_COMPLETION.md
PRODUCT.md
docs/phase5_fleet_digital_twin.md
docs/verification/phase1_5_results.json
docs/verification/fleet-dashboard.png
docs/verification/fleet-online-vehicles.png
```

Generated evidence also includes `backend/schema-operational-verification.json`, `backend/schema-test-verification.json`, backend/frontend `test-results-final.json`, `backend/browser-assignment.json`, and local ignored test/build/integration logs.

## E. Database

Operational database: `DynamicAmbulanceDispatch`; SQL-writing tests/demo: `DynamicAmbulanceDispatch_Test`. Existing configured login and password were used without logging secrets. SQL Server is `LAPTOP-GLEP1OUN\SQLEXPRESS`, actual TCP port 1433; encryption is enabled and the configured development certificate-trust setting is honored.

Migrations 006 and 007 were already present in both databases on current inspection. They were safely reapplied, with no new operational schema alteration needed. No destructive down migration, database recreation or operational data deletion was executed.

Verified columns: `Ambulances.is_simulated`, `Ambulances.telemetry_checkpoint_at`, `Emergencies.version`, `Emergencies.is_simulated`. Verified tables: `AmbulanceLocationHistory`, `AmbulanceOperationalEvents`, `FleetDispatchOutbox`, `DispatchRecommendations`, `EmergencyEvents`, `IdempotencyRecords`. Fifteen Sequelize model field sets have matching SQL columns; SQL-backed CRUD tests pass. Verified time/pending indexes, unique event constraints, trusted ambulance foreign keys and filtered unique `UQ_Emergencies_ActiveAmbulance`.

Commands, from backend:

```powershell
node scripts/verifyPhaseSchema.js --apply
$env:DB_NAME='DynamicAmbulanceDispatch_Test'
node scripts/verifyPhaseSchema.js --apply
```

The schema evidence files contain the observed indexes, foreign keys and TCP connection properties. Re-running without `--apply` is read-only.

## F. Tests and measured conditions

Final regression: backend 14 suites / 181 passed / 0 failed; frontend 10 files / 45 passed / 0 failed. The production build passes; main JS is 582.00 kB (150.37 kB gzip), with Vite's existing 500 kB chunk advisory. No performance rewrite was introduced just to hide that warning.

Backend, with `DB_NAME=DynamicAmbulanceDispatch_Test` and real Redis available:

```powershell
npm.cmd test -- --runInBand --json --outputFile=test-results-final.json
```

Frontend:

```powershell
npm.cmd test -- --reporter=default --reporter=json --outputFile=test-results-final.json
npm.cmd run build
```

Legacy, from the project root:

```powershell
g++ -std=c++17 -static -static-libgcc -static-libstdc++ Legacy/hospital_final.cpp Legacy/database_repository.cpp -lodbc32 -o Legacy/hospital_final.exe
g++ -std=c++17 -static -static-libgcc -static-libstdc++ Legacy/migrate_existing_data.cpp Legacy/database_repository.cpp -lodbc32 -o Legacy/migrate_existing_data.exe
g++ -std=c++17 -static Legacy/test_hospital.cpp -o Legacy/test_hospital.exe
./Legacy/test_hospital.exe
g++ -std=c++17 -static -static-libgcc -static-libstdc++ Legacy/test_phase5.cpp Legacy/database_repository.cpp -lodbc32 -o Legacy/test_phase5.exe
$env:DB_NAME='DynamicAmbulanceDispatch_Test'
$env:DB_PORT='1433'
$env:VERIFY_LEGACY_SQL='true'
./Legacy/test_phase5.exe
```

Both application/importer builds succeeded. Two existing assertion-based tests passed; the new harness passed actual Dijkstra/disconnected graph, Floyd-Warshall, vehicle eligibility/bounds/same-location checks and real ODBC schema reads/write rejection. The importer was built, not executed against operational records.

Node 24.13.0, npm 11.6.2, Vite 6.4.3 and GCC 14.2.0 on Windows were used. Jest logs include expected negative-test warnings/errors. Sandbox networking and resumed Vite realpath failures were retried with approved local access; those failed attempts are not counted as passing tests.

`verifyFleetPerformance.js` measured 25 simulated vehicles, 125 accepted packets (100 measured warm updates), 30-second SQL sampling, batch size 100 and 1-second socket coalescing. The warm burst took 534.59 ms; ingest p50/p95 were 4.85/8.52 ms. Twenty 25-vehicle reads used exactly twenty Redis MGETs; p50/p95 were 5.25/7.93 ms. Warm ingestion made zero SQL queries, produced 25 received socket updates and left 25 sampled rows, persisted in one transaction with three SQL statements including begin/commit. These are local measurements, not production capacity claims.

Mocked tests: Google identity token verification, provider response/failure fixtures, React socket/map doubles, reducer ordering, loader timeout and DOM rendering. Real tests: SQL transactions/indexes, Redis atomic state/queue/lease, Socket.IO protocol, HTTP authorization, worker writes/recovery, Google Routes probe, Google Maps browser and C++ ODBC.

## G. Demonstration and failure recovery

The final API demo used three explicitly simulated vehicles (`SIM-DEMO-1..3`, IDs 86/87/88), isolated SQL, backend port 5005, frontend port 5175 and dedicated Redis port 6385. Incident 265 completed its lifecycle. It added 27 new sampled locations and five operational transitions; duplicate event and wrong simulation-flag counts were zero.

| Requested step | Status | Evidence |
| --- | --- | --- |
| 1. SQL/Redis/backend/frontend running | VERIFIED | Real local services and HTTP/browser health. |
| 2. Safe migrations | VERIFIED | 006/007 reapplication and schema reports. |
| 3. Multiple simulators | VERIFIED | Three named simulated vehicles, patrol mode. |
| 4. Vehicles appear on map | VERIFIED | Real Google Maps browser marker controls. |
| 5. Movement/time/heartbeat | VERIFIED | GPS timestamps advance; three healthy rows; marker movement observed. |
| 6. Simulated emergency | VERIFIED | API incident 265. |
| 7. Recommendations | VERIFIED | Persisted ranked recommendation. |
| 8. Capability/fuel/GPS/assignment filtering | VERIFIED | Dispatch and fleet SQL integration regression tests. |
| 9. Approve recommended unit | VERIFIED | Demo approves first-ranked live-GPS candidate with recommendation ID. |
| 10. Assignment/SQL/Redis/socket/dashboard | VERIFIED | API/SQL integration and browser incident 177 display during continuation. |
| 11-12. Movement and marker update | VERIFIED | Browser marker position changed; no duplicate markers. |
| 13. Stale then offline | VERIFIED | Pause GPS with heartbeat, then stop one heartbeat; thresholds 5s/10s in demo. |
| 14. Restore heartbeat/GPS | VERIFIED | OFFLINE to ONLINE after valid telemetry. |
| 15. Reconnect authoritative snapshot | VERIFIED | Socket reconnect, page reload and real browser outage recovery. |
| 16. SQL outage | VERIFIED | Actual application SQL TCP connections interrupted through an isolated proxy; shared SQL service was not stopped. |
| 17. Restore SQL/drain queue | VERIFIED | Claimed and queued records replayed into real SQL. |
| 18. History/integrity | VERIFIED | New sample delta, operational transitions, unique events and simulated flags asserted. |
| 19. Simulation isolation | VERIFIED | Both real/simulated directions and production simulator rejection tested. |
| 20. Current regressions | VERIFIED | Backend 181 and frontend 45 passed; production build passed. |

The recovery script passed 14 checks, including a fresh process rejecting a logged-out token, SQL outage/replay, lease exclusion, abandoned batch recovery, lease-loss acknowledgment rejection, duplicate replay, saturation rejection before live mutation, pending-work shutdown, duplicate/out-of-order telemetry, actual Redis stop/AOF restart and socket resnapshot. Latest measured SQL-outage live update was 17.64 ms for one vehicle. This does not claim unlimited live operation without SQL.

On October 7 the browser showed LAST SNAPSHOT during a backend outage from 03:33:24 to 03:34:33 UTC (69 seconds), then automatically returned to LIVE CONNECTED without navigation or reload. Three restarted simulated vehicles showed Online / fresh with advancing GPS times. SIM-DEMO-2 had exactly one marker; its observed position changed from (451.40, 213.60) to (470.40, 200.60) in viewport coordinates. This verifies visible updates, not a frame-rate benchmark. Screenshots: [live map](docs/verification/fleet-dashboard.png), [three online vehicles](docs/verification/fleet-online-vehicles.png). The simulator was stopped after capture; backend 5005 and frontend 5175 remain available. Their subsequent offline vehicle labels are expected without telemetry.

## H. Remaining external blockers and smallest actions

- **Google Places: BLOCKED.** Configured key gets HTTP 403: SearchNearby is blocked. An owner must enable/authorize Places API (New), billing and appropriate key restrictions, then rerun `node scripts/verifyExternalServices.js`.
- **Data.gov.in: BLOCKED.** Configured endpoint refused the HTTPS connection (`164.100.61.198:443`). Restore provider/network reachability, verify the configured resource/API key, then rerun the provider probe and an isolated synchronization.
- **Live Google Identity: BLOCKED.** Google reports the demo origin is not allowed for the configured client ID. Add the intended development origin to that OAuth client's authorized JavaScript origins and complete a real staff Google sign-in. Automated verification uses controlled identity responses.

Google Routes returned HTTP 200 with a route. The Google Maps browser layer rendered successfully. No Google account/cloud permissions were changed by this task.

## Operational behavior and limits

- SQL owns dispatch assignments and lifecycle transitions. Redis owns accepted live telemetry. SQL operational outbox entries synchronize committed assignments to Redis; they do not generate GPS heartbeats.
- A last-known point has historical coordinates; a restored SQL point is explicitly historical/offline until new telemetry. Simulated state remains explicitly labeled. Missing coordinates never imply zero/zero.
- Heartbeat indicates connectivity independently of movement. Repeated identical valid GPS positions remain fresh; heartbeat alone cannot make an expired GPS observation fresh. Health is ONLINE, LOCATION_STALE, OFFLINE or LOCATION_UNAVAILABLE.
- Missing/stale GPS permits only valid base fallback by default; `FLEET_DISPATCH_REQUIRE_ONLINE=true` makes fresh online state mandatory. Redis failure rejects dispatch/telemetry and authenticated operations rather than silently falling back to fresh-looking SQL state. The browser retains and ages its last authorized snapshot.
- GPS queue sampling occurs atomically with Redis updates. On saturation the packet is rejected before changing live state. The worker retries with bounded backoff and acknowledges only committed SQL writes while holding the lease. Replay is idempotent. Shutdown drains one bounded batch; any remainder stays in Redis for restart.
- Redis persistence must be configured by deployment. Verification used AOF with `appendfsync always` on port 6385; the existing port 6379 instance uses `everysec`. Process crash/restart durability depends on those settings. Queue health does not claim unconditional disk durability. In-memory stores are explicitly injected test doubles, never an automatic runtime fallback.
- Telemetry registry caching supports known vehicles briefly during SQL outages (30-second normal cache, at most five minutes on SQL error). New registrations and transactional dispatch still require SQL. Socket account checks repeat every 15 seconds and close/retry on temporary authorization-storage failure; revoked/expired/forbidden clients receive no new authorized snapshot. Cross-process logout is checked on authentication and these periodic checks.
- Dispatch scoring deliberately uses clearly labeled Haversine-derived estimates plus turnout allowance. The existing hospital routing service can use the configured Google Routes API. No traffic-aware claim is made for scoring fallback; no hospital capacity or clinical capability was fabricated.
- Simulator movement is deterministic local geometry, bounded at its configured speed/interval, not actual road traffic. It starts only by opt-in, is rejected in production, and cannot cross real/simulated incident boundaries by default.

## I. Acceptance matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Authentication | PARTIALLY VERIFIED | Local auth/revocation tests and fresh-process check pass; live Google origin blocked. |
| RBAC | VERIFIED | Role matrix, pending crew, ownership and socket room tests. |
| SQL Server | VERIFIED | Actual schema, TCP port, migrations, model field checks, transaction tests. |
| Dispatch engine | VERIFIED | SQL-backed scoring/TTL/override/concurrency tests and demo approval. |
| Emergency lifecycle | VERIFIED | Versions, event history, invalid/duplicate commands, release/reassignment tests. |
| Routing | VERIFIED | Real Google Routes response plus explicit fallback/failure tests. |
| Hospital selection | PARTIALLY VERIFIED | SQL ranking/deduplication/fallback pass; live Places/directory blocked. |
| Redis live state | VERIFIED | Real Lua ordering, queue atomicity, restart and fail-closed checks. |
| Telemetry | VERIFIED | Bound HTTP credentials, timestamps, coordinates, rates, sizes, duplicate/order checks. |
| Heartbeat | VERIFIED | Stationary fresh GPS, independent heartbeat and reconnect checks. |
| Stale detection | VERIFIED | Configured location/heartbeat thresholds in real demo and unit tests. |
| Socket.IO | VERIFIED | Six event contracts, cookie/bearer auth, roles, revocation and resync. |
| Simulator | VERIFIED | Three vehicles, patrol/stationary, lifecycle, pause/resume/stop and isolation. |
| Persistence worker | VERIFIED | Real SQL batch, lease/fencing, retry/replay and saturation tests. |
| SQL history | VERIFIED | New demo samples, transitions, unique IDs and simulation flags. |
| Live map | VERIFIED | Real Google map, moving DOM markers, selection, status, screenshot; marker reuse tests. |
| Dispatch integration | VERIFIED | GPS recommendation through approval, SQL/outbox/Redis/socket to dashboard. |
| Reconnect | VERIFIED | Protocol resync, browser reload and long-outage recovery. |
| Failure recovery | VERIFIED | Real Redis restart, real SQL TCP outage, worker restart and bounded shutdown. |
| C++ regression | VERIFIED | Application/importer builds, both test harnesses, actual ODBC reads and write guard. |
| Backend tests | VERIFIED | Current 14 suites / 181 passed / 0 failed. |
| Frontend tests | VERIFIED | Current 10 files / 45 passed / 0 failed. |
| Production build | VERIFIED | Vite exits 0; bundle-size warning recorded. |
| End-to-end demo | VERIFIED | Isolated three-vehicle demonstration plus browser and controlled outage runs. |
| Live external provider acceptance | BLOCKED | Places, Data.gov.in and Google Identity conditions above. |
| Phase 6 | NOT APPLICABLE | Explicitly excluded. |

## Reproduce the isolated demonstration

Use the existing SQL Server and existing `_Test` database, with credentials in backend/.env. The following commands do not recreate or reset a database. The dedicated Redis container `ems-phase5-verification` exposes port 6385 and was configured with AOF `appendfsync always`; it must be running for the recovery script. The existing general Redis on 6379 serves regression tests.

In a backend terminal:

```powershell
Set-Location D:\DynamicAmbulenceDispatch\Project\backend
$env:DB_NAME='DynamicAmbulanceDispatch_Test'
$env:DB_PORT='1433'
$env:PORT='5005'
$env:CORS_ORIGIN='http://localhost:5175'
$env:REDIS_URL='redis://127.0.0.1:6385'
$env:FLEET_REDIS_PREFIX='ems:phase5:demo:20261006'
$env:HOSPITAL_SYNC_ENABLED='false'
$env:SIMULATOR_ENABLED='true'
$env:FLEET_PERSISTENCE_WORKER_ENABLED='true'
$env:FLEET_PERSISTENCE_SAMPLE_MS='1000'
$env:FLEET_LOCATION_STALE_MS='5000'
$env:FLEET_OFFLINE_MS='10000'
node scripts/verifyPhaseSchema.js --apply
# Set DEMO_ADMIN_PASSWORD to the existing synthetic demo account password.
# On a fresh isolated database, use a password of at least 12 characters.
npm.cmd run demo:setup
node src/server.js
```

In a frontend terminal:

```powershell
Set-Location D:\DynamicAmbulenceDispatch\Project\frontend
$env:VITE_API_BASE_URL='http://localhost:5005/api/v1'
npm.cmd run dev -- --host 127.0.0.1 --port 5175
```

Open http://localhost:5175 and sign in with the synthetic account configured by setup. The script preserves an existing account and rejects mismatched credentials; it does not reset its password.

In a verification terminal, with the same backend environment and demo password:

```powershell
Set-Location D:\DynamicAmbulenceDispatch\Project\backend
$env:DEMO_API_URL='http://localhost:5005/api/v1/'
node scripts/verifyFleetDemo.js
node scripts/verifyFleetRecovery.js
node scripts/verifyFleetPerformance.js
node scripts/verifyExternalServices.js
```

The demo starts/stops three named simulated vehicles, creates a simulated incident and checks its lifecycle/history. It reports `browser_verified:false` because browser evidence is collected separately; this flag is not relabeled as true. Recovery deliberately stops/restarts only `ems-phase5-verification` and uses an isolated SQL TCP proxy. Performance/recovery create synthetic fixtures in `_Test`. The shared operational database and SQL service are never reset or stopped by these scripts.

## Per-suite final execution results

Every backend row was executed by the backend command in section F; every frontend row by the frontend command there. All rows have result PASS, zero failed tests and no execution blocker. Provider mocks do not establish live provider acceptance.

| Backend suite | Passed | Failed | Blocked reason |
| --- | ---: | ---: | --- |
| fleet_integration.test.js | 12 | 0 | None |
| phase5_dispatch_engine.test.js | 22 | 0 | None |
| phase4_regression_fixes.test.js | 25 | 0 | None |
| phase4.test.js | 19 | 0 | None |
| phase3.test.js | 25 | 0 | None |
| auth.test.js | 10 | 0 | None |
| googleAuth.test.js | 10 | 0 | None |
| rbac.test.js | 10 | 0 | None |
| health.test.js | 3 | 0 | None |
| fleet_safety.test.js | 35 | 0 | None |
| errorHandler.test.js | 1 | 0 | None |
| fleet_tracking.test.js | 4 | 0 | None |
| shutdown.test.js | 3 | 0 | None |
| responseFormatter.test.js | 2 | 0 | None |

| Frontend file | Passed | Failed | Blocked reason |
| --- | ---: | ---: | --- |
| DashboardRecovery.test.jsx | 2 | 0 | None |
| FleetDigitalTwin.test.jsx | 8 | 0 | None |
| FleetMap.test.jsx | 3 | 0 | None |
| FleetService.test.jsx | 2 | 0 | None |
| LoginPage.test.jsx | 4 | 0 | None |
| Phase3Pages.test.jsx | 5 | 0 | None |
| Phase4NearbyMap.test.jsx | 6 | 0 | None |
| Phase5Dispatch.test.jsx | 6 | 0 | None |
| ProtectedRoute.test.jsx | 5 | 0 | None |
| RoleAwareNavigation.test.jsx | 4 | 0 | None |

Final backend duration: 51.713 seconds. Frontend: 5.12 seconds. Build: 3.71 seconds. C++ harnesses exited 0. These are observed local run times.

