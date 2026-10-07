# Phase 1-5 verification progress

Updated 2026-10-07. Existing architecture and pre-existing working-tree changes preserved. No Phase 6 work.

## Current state

- [x] Inspected the repository, original audit/progress, implementation, tests, SQL schema and dirty Git tree before repairs.
- [x] Verified existing migration 006/007 schema in both operational and isolated test databases; safely reapplied both additive migrations. No operational records removed.
- [x] Fixed dispatch fail-closed behavior, atomic idempotency, reassignment revalidation/history, source binding, durable operational synchronization and SQL port handling.
- [x] Fixed socket health events, cookie authentication, persistent logout revocation, frontend state ordering/error display, and long-outage retry behavior.
- [x] Fixed incident creation history, terminal recommendation recalculation, map popup escaping and bounded external map loading.
- [x] Built the legacy application/importer, ran existing and actual solver tests, and verified real ODBC reads plus the Phase 5 write guard.
- [x] Current final backend run: 14 suites, 181 tests passed, 0 failed. Machine-readable evidence: backend/test-results-final.json.
- [x] Current frontend run: 10 files, 45 tests passed, 0 failed. Production build succeeds. Evidence: frontend/test-results-final.json and frontend/build-results-final.log.
- [x] Actual three-vehicle API demo: incident 265, 27 new sampled locations, five operational transitions, zero duplicate events/incorrect simulation flags.
- [x] Actual recovery: 14 checks passed, including fresh-process logout revocation, SQL connection outage, worker recovery/fencing, saturation, Redis AOF restart and socket resnapshot.
- [x] Measured 25-vehicle workload: 100 warm updates, zero SQL queries during ingestion, 25 coalesced updates, 25 sampled records, one SQL batch.
- [x] Browser verified moving Google map markers, assignment display, reload snapshot, connection errors and authoritative recovery. Captured the actual rendered map on October 7.
- [x] Verified automatic browser reconnect after a 69-second backend outage, without reloading. Captured three fresh vehicles and a moving, nonduplicated marker.
- [x] Repeated all backend/frontend/C++ regressions and the production build after the demonstration. Updated audit, product notes, fleet operating guide and final acceptance record.

## External dependencies

- Google Routes: actual HTTP 200 and a route returned.
- Google Places: actual HTTP 403, SearchNearby blocked by key/API configuration.
- Data.gov.in: connection refused to the configured provider endpoint.
- Google Identity: browser reports the demo origin is not allowed for the configured client ID; mocked identity tests pass.

Sandbox-only failures were retried with approved local access. They are not recorded as successful test runs: Redis/network access initially failed, and the resumed sandbox blocked Vite realpath resolution before any tests ran. The isolated SQL fixture teardown failure was repaired and rerun successfully. Old test totals in earlier documents are superseded by the current evidence.
