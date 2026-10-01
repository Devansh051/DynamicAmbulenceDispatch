# Phase 5: Ambulance Dispatch Engine & Emergency Response Workflow

## 1. System Overview & Architecture

Phase 5 introduces a rule-based, deterministic decision-support **Dispatch Recommendation Engine** and an atomic **Emergency Response Lifecycle** to the Dynamic Ambulance Dispatch System.

The architecture extends the existing modular-monolith stack:
* **Backend:** Node.js (v20+), Express.js, Sequelize ORM, Microsoft SQL Server (SQLEXPRESS).
* **Frontend:** React 18, Vite, Tailwind CSS, Lucide icons.
* **Routing Services:** Phase 4 OSRM Routing Engine integration with deterministic Haversine distance-plus-turnout-buffer fallback.
* **Hospital Intelligence:** Static/periodic sync hospital directory with explicit capacity confidence labeling (`UNKNOWN (No live telemetry feed)`).
* **Legacy Interoperability:** C++ binary (`test_hospital.exe`) test suite and SQL Server legacy tables (`Ambulances`, `Hospitals`, `Patients`) fully preserved.

---

## 2. Dispatch Recommendation Engine

### 2.1 Multi-Factor Deterministic Scoring Formula

Ambulance candidates are evaluated across 5 weighted operational dimensions (0 to 100 points total):

$$\text{Total Score} = W_{\text{time}} \cdot S_{\text{time}} + W_{\text{cap}} \cdot S_{\text{cap}} + W_{\text{cov}} \cdot S_{\text{cov}} + W_{\text{fuel}} \cdot S_{\text{fuel}} + W_{\text{fresh}} \cdot S_{\text{fresh}}$$

Where weights default to:
* $W_{\text{time}} = 0.40$ (40% Travel Time / ETA)
* $W_{\text{cap}} = 0.20$ (20% Clinical Capability & Equipment Fit)
* $W_{\text{cov}} = 0.20$ (20% Zone Fleet Coverage Preservation)
* $W_{\text{fuel}} = 0.10$ (10% Operational Fuel Readiness)
* $W_{\text{fresh}} = 0.10$ (10% GPS Location Telemetry Freshness)

$$\sum W_i = 1.00 \quad (100\%)$$

#### Factor 1: Travel Time ($S_{\text{time}}$, 0–100 pts)
Evaluates response time calculated by OSRM route duration (or fallback route duration).
* Max points (100 pts) awarded if $\text{ETA} \le 2\text{ minutes}$.
* Zero points (0 pts) if $\text{ETA} \ge 30\text{ minutes}$.
* Linear decay: $S_{\text{time}} = \max(0, \min(100, 100 - ((\text{ETA} - 2) / 28) \times 100))$.

#### Factor 2: Clinical Capability ($S_{\text{cap}}$, 0–100 pts)
Matches vehicle clinical level against incident triage priority:
* If severity $\ge 4$ (Critical/Severe) and vehicle is `ALS` (Advanced Life Support): $100\text{ pts}$.
* If severity $\ge 4$ and vehicle is `BLS` (Basic Life Support): $55\text{ pts}$ (penalty for suboptimal capability).
* If severity $< 4$ and vehicle is `BLS`: $100\text{ pts}$ (preserves ALS for high-acuity calls).
* If severity $< 4$ and vehicle is `ALS`: $75\text{ pts}$.

#### Factor 3: Coverage Impact ($S_{\text{cov}}$, 0–100 pts)
Prevents depleting a geographic zone of its last emergency response unit:
* If remaining available ambulances in zone $> 2$: $100\text{ pts}$ (`LOW IMPACT`).
* If remaining available ambulances $= 2$: $75\text{ pts}$ (`LOW IMPACT`).
* If remaining available ambulances $= 1$: $40\text{ pts}$ (`MODERATE IMPACT`).
* If remaining available ambulances $= 0$: $15\text{ pts}$ (`HIGH IMPACT` - leaves zone uncovered).
* If zone cannot be determined from telemetry: $50\text{ pts}$ (`UNKNOWN`).

#### Factor 4: Fuel Readiness ($S_{\text{fuel}}$, 0–100 pts)
Ensures response vehicle has sufficient fuel for travel, scene idling, and transport:
* Minimum threshold: 15% fuel. Units $< 15\%$ are disqualified as excluded.
* Score: $S_{\text{fuel}} = \min(100, \text{Fuel\%})$.

#### Factor 5: GPS Freshness ($S_{\text{fresh}}$, 0–100 pts)
Penalizes stale or unverified coordinates:
* Updated within 2 minutes: $100\text{ pts}$.
* Updated within 5 minutes: $80\text{ pts}$.
* Updated within 15 minutes: $40\text{ pts}$.
* Stale $> 15$ minutes: $10\text{ pts}$.

---

### 2.2 Candidate Exclusions & Eligibility Rules

An ambulance is strictly excluded from recommendations if:
1. Status is not `Available` (e.g. `busy`, `maintenance`, `out_of_service`).
2. Ambulance is already assigned to another active emergency.
3. Fuel level is below the 15% minimum operational reserve.
4. GPS coordinates are missing or invalid.
5. Unit is administratively deactivated.

Every exclusion is captured with an explicit explanatory string in `exclusions[]`.

---

### 2.3 Routing Provider Failure & Fallback Policy

When OSRM or external route engine is unreachable, times out, or returns no route:
1. Engine seamlessly transitions to the **Haversine Straight-Line Fallback**.
2. Applies an urban tortuosity factor of $1.35\times$ and an assumed urban speed of $35\text{ km/h}$.
3. Adds a standard turnout/dispatch mobilization buffer of 2.0 minutes.
4. Labeled in API response and UI as `HAVERSINE_STRAIGHT_LINE_FALLBACK` (Routing: ⚠️ Haversine Fallback).
5. Never fabricates live route geometry or pretends real-time traffic was evaluated.

---

## 3. Human Dispatcher Approval & Override Workflow

**Rule:** An ambulance is **NEVER** automatically dispatched without explicit human dispatcher authorization.

1. **Top Recommendation Selected by Default:** UI highlights Candidate #1 with `#1 RECOMMENDED` badge.
2. **Dispatcher Override:**
   * If a dispatcher selects Candidate #2 or lower, an amber warning banner appears.
   * A mandatory operational reason (`override_reason`, min 5 characters) must be provided.
   * Assignment submission is locked until the reason is entered.
   * Both original top recommendation and override rationale are immutably logged into `EmergencyEvents`.
3. **Recommendation Expiry & TTL:**
   * Recommendations have a configurable TTL (default 300 seconds / 5 minutes).
   * UI displays a live second-by-second countdown.
   * Stale recommendations (> 5 mins) are rejected with HTTP 400 (`RECOMMENDATION_EXPIRED`).
   * "Recalculate Recommendations" button fetches fresh fleet telemetry without losing incident context.
4. **Pre-Assignment Revalidation:**
   * Immediately inside the database transaction, candidate status, emergency state, and current assignments are re-queried.
   * If candidate became busy between recommendation and confirmation, transaction aborts and returns HTTP 409 (`AMBULANCE_UNAVAILABLE`).

---

## 4. Duplicate-Action Protection & Concurrency Safeguards

### 4.1 SQL Server Unique Filtered Index

To prevent double-booking at the database engine level, migration 005 establishes a filtered unique index:

```sql
CREATE UNIQUE NONCLUSTERED INDEX UQ_Emergencies_ActiveAmbulance
ON dbo.Emergencies(assigned_ambulance_id)
WHERE assigned_ambulance_id IS NOT NULL
  AND status IN (
    'REPORTED', 'VERIFIED', 'DISPATCH_RECOMMENDED',
    'DISPATCHED', 'EN_ROUTE', 'AT_PATIENT',
    'TRANSPORTING', 'AT_HOSPITAL'
  );
```

### 4.2 Idempotency Keys (`Idempotency-Key` Header)

* Clients supply a unique key per action (e.g. `p5-assign-101-179078...`).
* The system hashes the payload using SHA-256 and records it in `dbo.IdempotencyRecords`.
* If a network retry occurs with the **same key and identical payload**:
  * Cached response is returned with HTTP 200/201.
  * No duplicate DB updates or duplicate timeline events occur.
* If a retry occurs with the **same key but differing payload**:
  * Request is rejected with HTTP 422 (`IDEMPOTENCY_PAYLOAD_MISMATCH`).

---

## 5. Emergency Response Lifecycle

### 5.1 Validated State Transition Matrix

```
REPORTED ──────► VERIFIED ──────► DISPATCH_RECOMMENDED ──────► DISPATCHED
    │                │                     │                       │
    ▼                ▼                     ▼                       ▼
CANCELLED        CANCELLED             CANCELLED               CANCELLED
                                                                   │
                                                                   ▼
RESOLVED ◄────── AT_HOSPITAL ◄────── TRANSPORTING ◄────── AT_PATIENT ◄────── EN_ROUTE
   │
   ▼
 CLOSED
```

| Current Status | Allowed Next Transitions | Role Permissions |
| :--- | :--- | :--- |
| `REPORTED` | `VERIFIED`, `CANCELLED` | `ADMIN`, `DISPATCHER` |
| `VERIFIED` | `DISPATCH_RECOMMENDED`, `DISPATCHED`, `CANCELLED` | `ADMIN`, `DISPATCHER` |
| `DISPATCH_RECOMMENDED` | `DISPATCHED`, `CANCELLED` | `ADMIN`, `DISPATCHER` |
| `DISPATCHED` | `EN_ROUTE`, `RESOLVED`, `CANCELLED` | `CREW` (for En Route), `DISPATCHER` (for Cancel/Resolve) |
| `EN_ROUTE` | `AT_PATIENT`, `RESOLVED`, `CANCELLED` | `CREW` (for At Patient), `DISPATCHER` |
| `AT_PATIENT` | `TRANSPORTING`, `RESOLVED`, `CANCELLED` | `CREW` (for Transporting), `DISPATCHER` |
| `TRANSPORTING` | `AT_HOSPITAL`, `RESOLVED`, `CANCELLED` | `CREW` (for At Hospital), `DISPATCHER` |
| `AT_HOSPITAL` | `RESOLVED`, `CANCELLED` | `ADMIN`, `DISPATCHER`, `CREW` |
| `RESOLVED` | `CLOSED` | `ADMIN`, `DISPATCHER` |
| `CLOSED` | None (Terminal) | - |
| `CANCELLED` | None (Terminal) | - |

---

## 6. API Reference (Phase 5)

All endpoints mounted under `/api/v1/emergencies` and `/api/v1/dispatch`.

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/emergencies/:id/recommendations` | Generate multi-factor dispatch recommendations | Dispatcher, Admin |
| `GET` | `/api/v1/emergencies/:id/recommendations` | Get active recommendation for incident | Dispatcher, Admin |
| `POST` | `/api/v1/emergencies/:id/recalculate` | Invalidate & recalculate fresh recommendations | Dispatcher, Admin |
| `GET` | `/api/v1/emergencies/:id/eligible-ambulances` | List eligible candidate ambulances | Dispatcher, Admin |
| `POST` | `/api/v1/emergencies/:id/assign` | Confirm ambulance assignment with human approval | Dispatcher, Admin |
| `POST` | `/api/v1/emergencies/:id/reassign` | Reassign active ambulance with mandatory reason | Dispatcher, Admin |
| `POST` | `/api/v1/emergencies/:id/escalate` | Escalate incident requiring manual supervisor handling | Dispatcher, Admin |
| `PATCH` | `/api/v1/emergencies/:id/status` | Update response lifecycle state (validated) | Dispatcher, Admin, Crew |
| `GET` | `/api/v1/emergencies/:id/history` | Get append-only chronological event timeline | Dispatcher, Admin |
| `GET` | `/api/v1/emergencies/:id/hospitals` | Get candidate trauma hospitals with route ETA | Dispatcher, Admin |
| `GET` | `/api/v1/dispatch/active-assignments` | Get active fleet ambulance incident assignments | Dispatcher, Admin |
| `GET` | `/api/v1/dispatch/config` | Retrieve dispatch scoring weights & TTL settings | Dispatcher, Admin |

---

## 7. Verification & Test Summary

* **Backend Test Suites:** 10 of 10 passed (126 of 126 tests, 100% pass rate).
* **Frontend Test Suites:** 6 of 6 passed (30 of 30 tests, 100% pass rate).
* **Frontend Production Build:** Vite build succeeded in 2.95s (`dist/index.html` 1.37 kB, `dist/assets/index-Dz7WJ8kt.js` 523.85 kB).
* **Legacy C++ Verification:** `test_hospital.exe` binary executed cleanly and all tests passed.
