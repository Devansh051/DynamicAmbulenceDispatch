# Phase 1-5 repository audit

Final verification: October 7, 2026. Scope is the existing Node/React/SQL Server/Redis application and C++17 engine. Pre-existing working-tree changes were preserved; no Phase 6 work was performed.

The October 3 audit and its failing test totals were historical inputs, not completion evidence. This audit supersedes them with current execution. The complete defect list, changed paths, commands, 20-step demonstration and requirement matrix are in [PHASE1_5_COMPLETION.md](PHASE1_5_COMPLETION.md).

| Area | Current status | Evidence |
| --- | --- | --- |
| Phase 1 foundation | VERIFIED | Actual SQL connection/schema; backend/frontend/C++ builds and tests. |
| Phase 2 authentication | PARTIALLY VERIFIED | Password, cookie/bearer, RBAC, crew ownership and shared logout revocation pass; live Google origin is blocked. |
| Phase 3 workflows | VERIFIED | SQL-backed CRUD, lifecycle, concurrency, events and repeated release tests. |
| Phase 4 providers | PARTIALLY VERIFIED | Google Maps and Routes work; ranking/fallback/deduplication tests pass; Places/directory live checks blocked. |
| Phase 5 dispatch/live fleet | VERIFIED | Real Redis, Socket.IO, SQL persistence/recovery, simulator and browser checks. |
| Migrations 006/007 | VERIFIED | Both databases already had the schema; safe additive reapplication completed. Fifteen models checked against SQL columns. |
| Backend regressions | VERIFIED | 14 suites, 181 passed, 0 failed; backend/test-results-final.json. |
| Frontend regressions | VERIFIED | 10 files, 45 passed, 0 failed; frontend/test-results-final.json. |
| Production build | VERIFIED | Vite succeeds; existing 582.00 kB main chunk advisory recorded. |
| C++ regression | VERIFIED | Application/importer compile, two existing tests, actual solver harness and ODBC reads/write guard pass. |
| Browser reconnect | VERIFIED | 69-second backend outage, LAST SNAPSHOT while unavailable, automatic LIVE CONNECTED recovery without reload. |
| Recovery | VERIFIED | 14 actual checks: SQL TCP interruption, worker restart/fencing, duplicate replay, saturation, Redis AOF restart, resnapshot and shared logout. |
| Performance | VERIFIED | Measured 25-vehicle workload; zero warm-ingestion SQL queries, 25 coalesced updates, one sampled SQL batch. |
| Live provider acceptance | BLOCKED | Places HTTP 403; Data.gov.in connection refused; Google Identity origin not authorized. |
| Phase 6 | NOT APPLICABLE | Excluded by the requested scope. |

All local implementation checklist items from the prior audit are covered by the current report. Genuine remaining external actions: authorize the configured Places API/key, restore directory endpoint reachability, and authorize the intended Google sign-in origin before repeating those live checks. Controlled provider/identity doubles are identified as mocked, never claimed as live acceptance.

SQL-writing tests and demonstrations use `DynamicAmbulanceDispatch_Test`; operational data was not deleted. Redis outage fails closed. SQL outage continuity is bounded by cached vehicle registration, queue capacity and periodic authorization checks. Redis disk durability depends on its AOF/RDB settings. See the completion record for these exact limits rather than assuming uninterrupted operation.

Machine-readable consolidated results: [docs/verification/phase1_5_results.json](docs/verification/phase1_5_results.json). Visual evidence: [live map](docs/verification/fleet-dashboard.png) and [three online simulated vehicles](docs/verification/fleet-online-vehicles.png).
