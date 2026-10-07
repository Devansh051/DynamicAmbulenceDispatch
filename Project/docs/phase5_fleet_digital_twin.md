# Phase 5: Live Fleet Digital Twin

## Purpose and data flow

Phase 5 adds live ambulance telemetry without replacing the existing SQL Server, emergency lifecycle, dispatch engine, React dashboard, or legacy C++ engine.

```text
Simulator or telemetry device
  -> authenticated HTTP ingestion
  -> validation and state-machine checks
  -> Redis current fleet state
  -> Socket.IO dispatcher room and React fleet map
  -> Redis-backed persistence queue
  -> SQL Server location and operational-event history
```

Redis is the source for verified current state. SQL Server is append-only, sampled history and the fallback source after a Redis restart. Recovered SQL coordinates are marked `restored_from_database: true` and never presented as fresh live GPS.

## Database migration

Apply all additive migrations, including `006_create_fleet_tracking_tables.js` and `007_integrity_and_simulation.js`, before enabling telemetry:

```powershell
Set-Location backend
node scripts/migrate.js
```

The migration adds `dbo.Ambulances.is_simulated` and creates:

- `dbo.AmbulanceLocationHistory` — sampled accepted GPS events, unique by `event_id`, indexed by `(ambulance_id, gps_event_timestamp)`.
- `dbo.AmbulanceOperationalEvents` — separately persisted operational state transitions, also idempotent and indexed by ambulance/time.

No existing records are deleted. Retention is an operational/database policy; this application does not automatically purge history.

## HTTP API and authorization

All paths are below `/api/v1/fleet`.

| Endpoint | Authorization | Purpose |
| --- | --- | --- |
| `POST /telemetry` | `x-telemetry-key`, `x-simulator-key`, or an authorized JWT | GPS plus optional operational status. |
| `POST /heartbeat` | Same as telemetry | Liveness without a GPS point. |
| `GET /snapshot` | Active `ADMIN` or `DISPATCHER` | Authorized current fleet snapshot. |
| `GET /health` | Active `ADMIN` or `DISPATCHER` | Health thresholds, monitored state count, and persistence queue depth. |
| `GET /ambulances/:id` | Active `ADMIN` or `DISPATCHER` | One live fleet state if present. |
| `POST /simulator/start`, `/pause`, `/resume`, `/stop` | Active `ADMIN` | Development simulator control. |
| `POST /simulator/ambulances/:id/advance-lifecycle` | Active `ADMIN` | Explicit isolated-test lifecycle advance; requires `SIMULATOR_ALLOW_ACTIVE_ASSIGNMENTS=true`. |

Telemetry payloads use `ambulance_id`, `gps_timestamp`, optional `speed_kph`, `heading_degrees`, `operational_status`, `assignment_id`, `source_id`, and `is_simulated`. GPS telemetry additionally requires valid `latitude` and `longitude`. Coordinates, speed, heading, timestamps, status transitions, payload size, and event rate are validated before live state changes.

Device keys are never logged or returned. Credentials bind an authenticated source to specific ambulance IDs; a payload cannot select a different source. A simulator key can update only ambulances stored with `is_simulated=true`; device telemetry cannot update those simulated records. Crew JWT telemetry fails closed until a crew-to-vehicle mapping exists. By default real incidents use real vehicles and simulated incidents use simulated vehicles. Cross-mode dispatch requires an explicit isolated-test configuration. The simulator rejects production mode.

## Socket.IO contract

Socket.IO runs on the backend origin and uses the same session JWT (`auth.token`, an `Authorization: Bearer` header, or the session cookie). Only active `ADMIN` and `DISPATCHER` accounts enter the `fleet:dispatchers` room. Shared Redis revocation checks survive backend restarts. Account permissions are rechecked every 15 seconds. Temporary authorization-storage failures close the transport so it can retry; rejected or expired credentials fail closed.

| Server event | Payload |
| --- | --- |
| `fleet:snapshot` | `{ fleet, generated_at, redis_live }` on connection and after resync. |
| `fleet:update` | Current public vehicle state plus accepted telemetry metadata. |
| `fleet:health` | Current public vehicle state when online/stale/offline classification changes. |
| `fleet:persistence-warning` | Queue/persistence warning without secrets. |
| `fleet:error` | A recoverable socket error, such as an unavailable snapshot. |

Clients emit `fleet:resync` after every successful Socket.IO connection. The frontend also gets the initial HTTP snapshot, then merges server updates by ambulance ID, epoch and version so old events cannot replace newer state or create duplicate markers. Network retries continue with a maximum five-second delay. Temporary middleware failures retry; forbidden credentials do not. Unmount cancels retries.

## Live-state and durability behavior

- Current Redis keys use `FLEET_REDIS_PREFIX` (default `ems:fleet:v1`), for example `ems:fleet:v1:ambulance:42`, `:index`, `:persistence`, and `:persistence:processing`.
- Atomic Redis merge logic rejects an older GPS packet from replacing a newer accepted location. Heartbeats use the server receipt time, independently of GPS timestamps.
- Health classifications are `ONLINE`, `LOCATION_STALE`, `OFFLINE`, and `LOCATION_UNAVAILABLE`. Identical fresh GPS observations plus heartbeats keep a stationary vehicle online. Heartbeat alone cannot refresh an old GPS observation; it becomes LOCATION_STALE before heartbeat expiry makes it OFFLINE.
- SQL persistence samples GPS with `FLEET_PERSISTENCE_SAMPLE_MS`. SQL transactions persist meaningful operational transitions immediately and create outbox records to synchronize Redis without inventing GPS or heartbeat events.
- The worker atomically claims queue items into `:persistence:processing`, acknowledges only after SQL commit while holding its lease, and recovers unacknowledged records after restart. Lease fencing prevents concurrent workers from acknowledging another worker's batch. Retry backoff is bounded; graceful shutdown drains one bounded batch and leaves remaining work in Redis.
- Redis persistence depends on AOF/RDB configuration. There is no automatic in-memory runtime fallback. Redis failure rejects telemetry and dispatch-critical operations. The dashboard retains clearly labeled last-known positions; restored SQL points are historical until new telemetry arrives.
- The queue is bounded. Saturation rejects the packet before live mutation and emits a warning; it never silently drops older pending records. During a SQL outage, previously registered vehicles can temporarily continue Redis/socket processing within the registry cache limit (at most five minutes), while persistence waits for SQL recovery. Dispatch and fresh authorization still require SQL. Socket authorization rechecks may interrupt connections until SQL recovers.

## Configuration and commands

Start Redis and SQL Server, copy the environment template, and set actual credentials outside source control. The Phase 5 settings are documented in `backend/.env.example`.

```powershell
# Apply schema changes once.
Set-Location backend
node scripts/migrate.js

# Backend with Socket.IO. Set this only to run its in-process worker.
$env:FLEET_PERSISTENCE_WORKER_ENABLED = 'true'
npm run dev

# Alternatively, run the worker as a dedicated process (do not also enable the in-process worker).
npm run worker:fleet

# Opt-in development simulator; never enable in production.
$env:SIMULATOR_ENABLED = 'true'
npm run simulator

# React dispatcher dashboard.
Set-Location ..\frontend
npm run dev
```

`SIMULATOR_MODE=patrol` produces deterministic local movement. `SIMULATOR_MODE=stationary` is useful for testing independent heartbeat health. Starting latitude/longitude, vehicle count/max count, update interval and heartbeat interval are configurable. The simulator does not start automatically and rejects production mode.

## Dispatch integration and limitations

The dispatch engine reads all relevant live states in one Redis operation, prefers fresh accepted GPS, and otherwise falls back to the assigned base hospital. `FLEET_DISPATCH_REQUIRE_ONLINE=true` makes fresh online telemetry mandatory; otherwise stale/offline locations do not masquerade as fresh GPS.

The simulator uses deterministic local patrol/stationary geometry rather than Google road geometry. Dispatch scoring uses an explicitly estimated Haversine travel time; hospital routing can use Google Routes. A fallback estimate is never traffic-aware ETA. The October 6-7 development verification, exact commands, measured limits and remaining external blockers are in [PHASE1_5_COMPLETION.md](../PHASE1_5_COMPLETION.md). A different deployment still requires verification against its own services and devices.
