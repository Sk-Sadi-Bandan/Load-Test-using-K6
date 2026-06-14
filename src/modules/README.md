# Modules - Complete Explanation

## Overview
The `modules` folder contains test **flow orchestration** logic — how virtual users progress through the supplier connect test journey. This is where the actual user simulation happens.

**Location:** `src/modules/`  
**Files:**
- `test.js` — Main test flow and user journey orchestration

**Key Principle:** Follows **Separation of Concerns** — this file orchestrates but doesn't do actual work (delegates to specialists in `services/`).

---

## File: `test.js` (Test Orchestration Module)

### What is This File?
This file **orchestrates the complete supplier connect user journey**. Every virtual user executes this function, repeating it throughout the test duration.

Think of it as the **user's journey checklist:**
1. ✅ Track I'm active
2. ✅ Login (get auth token)
3. ✅ Browse home & dashboard
4. ✅ Test inventory (list → create → update → delete)
5. ✅ Browse supplier requests
6. ✅ Browse supplier orders
7. ✅ Rest and repeat

### Key Features
✅ **Dynamic inventory CRUD** — create → capture ID → update → delete in one iteration  
✅ **GET filtering** — only clean GET endpoints passed to `callApiGroup`  
✅ **ID capture from response** — no hardcoded inventory IDs  
✅ **Graceful skip** — if create fails, update/delete are safely skipped  

---

### Imports

#### K6 Functions
```javascript
import { group, sleep } from 'k6';
```

**`group()`:** Labels related API calls into logical sections for reporting.
- Appears in test output as named sections (`█ Home & Dashboard`, `█ Inventory`, etc.)
- Groups errors by section — easier to pinpoint which feature failed
- No performance impact, only organizational

**`sleep()`:** Pauses execution for specified seconds.
- Makes test realistic (real users don't click instantly)
- Spreads load across time (prevents artificial burst)
- Simulates user "think time" between actions

#### Services
```javascript
import { authenticate, createAuthHeaders } from '../services/auth.js';
import { callApi, callApiGroup } from '../services/api.js';
```

- `authenticate()` — logs in with `TEST_USER` credentials, returns auth token
- `createAuthHeaders(token)` — wraps token in `{ auth_token, Content-Type }` headers
- `callApi()` — makes a single HTTP request (GET/POST/PUT/DELETE) with metric tracking
- `callApiGroup()` — iterates an array of endpoints and calls each via `callApi()`

#### Configuration
```javascript
import { BASE_URL, API_GROUPS, API_ENDPOINTS, REQUEST_PAYLOADS } from '../config/environment.js';
```

- `BASE_URL` — `http://52.220.47.3` (staging server)
- `API_GROUPS` — endpoint arrays by feature (home, inventory, supplier_requests, supplier_orders)
- `API_ENDPOINTS` — individual endpoint definitions with path + method
- `REQUEST_PAYLOADS` — POST/PUT request bodies (create/update inventory item)

#### Metrics
```javascript
import {
    activeVUs,
    homeDuration,
    inventoryDuration,
    supplierRequestsDuration,
    supplierOrdersDuration,
} from '../metrics/custom.js';
```

One duration trend per feature group — enables per-section response time breakdown in the summary report.

---

### Function: `runMainTest()`

**Purpose:** Executes the complete supplier connect user journey for one VU iteration.  
**Called:** Repeatedly by K6 for each virtual user, until the scenario duration ends.  
**Returns:** `void` — exits early only if authentication fails.

---

### Step 1: Track Active Virtual Users

```javascript
activeVUs.add(__VU);
```

`__VU` is K6's built-in variable holding the current VU number (1, 2, 3... up to max VUs).

**During your load test:**
```
Stage 1 (5s):   activeVUs → 2
Stage 2 (15s):  activeVUs → 5
Stage 3 (30s):  activeVUs → 10  ← peak
Stage 4 (20s):  activeVUs → 10  (hold)
Stage 5 (5s):   activeVUs → 0   (ramp down)
```

**From your last full run:** `active_vus min=1, max=10`

---

### Step 2: Authenticate

```javascript
const accessToken = authenticate();
if (!accessToken) return;
```

Calls `authenticate()` in `auth.js`, which:
1. POSTs to `/api/v1/auth/login/` with `TEST_USER` credentials
2. Parses response body — token is at `data.auth_token`
3. Returns the token string, or `null` if login failed

If `null` is returned, the iteration exits immediately (`return`) — no API calls are made without a valid token. Auth failure is logged via `console.error()`.

**Login response shape:**
```json
{
  "success": true,
  "data": {
    "auth_token": "Eo_N07LZ-URWhQzJQdmk...",
    "user_details": { "id": 105, "name": "Sadi supplier 606 (Load test)" }
  }
}
```

**From your last full run:** `sign_in avg=474ms, p(95)=853ms` — all 81 logins successful.

---

### Step 3: Create Authenticated Headers

```javascript
const headers = createAuthHeaders(accessToken);
```

Produces:
```javascript
{
    'auth_token':   'Eo_N07LZ-URWhQzJQdmk...',
    'Content-Type': 'application/json'
}
```

These headers are passed to every subsequent API call in the iteration.

---

### Step 4: Home & Dashboard

```javascript
group('Home & Dashboard', () => {
    callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration);
});
sleep(5);
```

**Endpoints tested (from `API_GROUPS.home`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v3/supplier_requests?page=1&per_page=1&query=` | Supplier request summary |
| GET | `/api/v3/supplier_orders?page=1&per_page=15&query=` | Supplier order summary |
| GET | `/api/v1/dashboard` | Main dashboard data |
| GET | `/api/v1/dashboard/top_companies` | Top companies widget |

**Metrics recorded:** `homeDuration`, `responseTimeTrend`, `ttfb`, `successfulRequests`, `dataReceived`

**From your last full run:** `home_duration avg=154ms, p(95)=296ms` — all ✅

**`sleep(5)` after:** Simulates the 5 seconds a user spends reading the dashboard before moving on.

---

### Step 5: Inventory

```javascript
group('Inventory', () => {

    // 1. GET inventory list
    callApiGroup(
        BASE_URL,
        API_GROUPS.inventory.filter((e) => e.method === 'GET' && !e.path.includes('{')),
        headers,
        'inventory',
        inventoryDuration
    );

    // 2. POST create
    const createUrl     = `${BASE_URL}${API_ENDPOINTS.inventory.create_inventory_item.path}`;
    const createPayload = JSON.stringify(REQUEST_PAYLOADS.create_inventory_item);
    const createRes     = callApi(createUrl, headers, 'inventory', inventoryDuration, 'POST', createPayload);

    // 3. Capture ID from create response
    let newItemId = null;
    try {
        const body = createRes.json();
        newItemId =
            (body.data && body.data.id) ? body.data.id :
            (body.id)                   ? body.id       :
            (body.item && body.item.id) ? body.item.id  : null;

        if (!newItemId) console.warn(`ID not found. Response keys: [${Object.keys(body).join(', ')}]`);
    } catch (e) {
        console.error(`Failed to parse create response: ${e}`);
    }

    // 4. PUT update + DELETE — only if create succeeded
    if (newItemId) {
        const updateUrl     = `${BASE_URL}${API_ENDPOINTS.inventory.update_inventory_item.path.replace('{inv_id}', newItemId)}`;
        const updatePayload = JSON.stringify(REQUEST_PAYLOADS.update_inventory_item);
        callApi(updateUrl, headers, 'inventory', inventoryDuration, 'PUT', updatePayload);

        const deleteUrl = `${BASE_URL}${API_ENDPOINTS.inventory.delete_inventory_item.path.replace('{inv_id}', newItemId)}`;
        callApi(deleteUrl, headers, 'inventory', inventoryDuration, 'DELETE');
    }
});
sleep(5);
```

**Why the GET filter?**
```javascript
API_GROUPS.inventory.filter((e) => e.method === 'GET' && !e.path.includes('{'))
```

`API_GROUPS.inventory` contains 5 endpoints. Only `inventory_list` is a clean GET without a path parameter — the others (`update`, `delete`, `get by id`) contain `{inv_id}` which must be substituted at runtime. This filter passes only `inventory_list` to `callApiGroup`, avoiding literal `{inv_id}` in URLs.

**The CRUD cycle per iteration:**

```
GET  /api/v1/inventory/           → list all items
POST /api/v1/inventory/           → create "Potato" item → response has id=513
PUT  /api/v1/inventory/513        → update to "Potato Update", price 300
DELETE /api/v1/inventory/513      → clean up created item
```

**Why capture ID instead of hardcoding?**
Hardcoded IDs fail when the item doesn't exist on staging. Capturing from the create response guarantees the ID is always valid for that iteration.

**Create payload:**
```javascript
{
    name: "Potato",
    price: "500.0",
    company_name: "Syngenta",
    unit_id: 1,
    quantity: "100.2",
    quality_parameters_desc: "Lomba misti potato"
}
```

**Update payload:**
```javascript
{
    name: "Potato Update",
    price: "300.0",
    company_name: "Pran",
    quantity: "200.2",
    quality_parameters_desc: "Lomba misti potato update"
}
```

**From your last full run:** IDs 513–591 created, updated, deleted — all ✅. `inventory_duration avg=188ms, p(95)=414ms`

---

### Step 6: Supplier Requests

```javascript
group('Supplier Requests', () => {
    callApiGroup(
        BASE_URL,
        API_GROUPS.supplier_requests.filter((e) => e.method !== 'POST'),
        headers,
        'supplier_requests',
        supplierRequestsDuration
    );
});
sleep(5);
```

**Endpoints tested (from `API_GROUPS.supplier_requests`, GET only):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v3/supplier_requests/` | Paginated supplier request list |
| GET | `/api/v3/supplier_requests/200` | Detail of request #200 |

**The `.filter((e) => e.method !== 'POST')` is a safety guard** — in case POST endpoints are added to `API_GROUPS.supplier_requests` in future, they won't accidentally run here without proper payloads.

**From your last full run:** `supplier_requests_duration avg=140ms, p(95)=270ms` — all ✅

---

### Step 7: Supplier Orders

```javascript
group('Supplier Orders', () => {
    callApiGroup(
        BASE_URL,
        API_GROUPS.supplier_orders.filter((e) => e.method !== 'POST'),
        headers,
        'supplier_orders',
        supplierOrdersDuration
    );
});
```

**Endpoints tested (from `API_GROUPS.supplier_orders`, GET only):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v3/supplier_orders/` | Paginated supplier order list |
| GET | `/api/v3/supplier_orders/103` | Detail of order #103 |

**From your last full run:** `supplier_orders_duration avg=143ms, p(95)=222ms` — all ✅

---

### Step 8: Simulate User Think Time

```javascript
sleep(Math.random() * 2 + 1);
```

Waits randomly between 1 and 3 seconds at the end of each iteration.

**Math breakdown:**
```
Math.random()         → 0.0 to 0.999
Math.random() * 2     → 0.0 to 1.999
Math.random() * 2 + 1 → 1.0 to 2.999 seconds
```

**Why randomize?** Real users don't all click at the same time.

```
Without randomization:
  All 10 VUs finish at same millisecond
  → 10 simultaneous requests → artificial spike

With randomization:
  VU1 sleeps 1.2s, VU2 sleeps 2.3s, VU3 sleeps 1.8s...
  → Requests spread naturally → realistic load curve
```

**Note:** Each group also has a `sleep(5)` between it — simulating the time a real supplier spends reading a page before clicking the next one. Total per-iteration sleep: ~15s + 1–3s think time.

---

## Complete Iteration Timeline

```
One VU, one iteration:

[0.0s]  activeVUs.add(__VU)
[0.0s]  POST /api/v1/auth/login/            → ~440ms → token received

[0.5s]  ── Home & Dashboard ──────────────────────────────
        GET /api/v3/supplier_requests       → ~130ms
        GET /api/v3/supplier_orders         → ~140ms
        GET /api/v1/dashboard               → ~155ms
        GET /api/v1/dashboard/top_companies → ~160ms

[1.5s]  sleep(5)

[6.5s]  ── Inventory ────────────────────────────────────
        GET  /api/v1/inventory/             → ~120ms  (list)
        POST /api/v1/inventory/             → ~200ms  (create → id=513)
        PUT  /api/v1/inventory/513          → ~210ms  (update)
        DELETE /api/v1/inventory/513        → ~190ms  (delete)

[8.0s]  sleep(5)

[13.0s] ── Supplier Requests ─────────────────────────────
        GET /api/v3/supplier_requests/      → ~110ms
        GET /api/v3/supplier_requests/200   → ~115ms

[13.5s] sleep(5)

[18.5s] ── Supplier Orders ──────────────────────────────
        GET /api/v3/supplier_orders/        → ~130ms
        GET /api/v3/supplier_orders/103     → ~135ms

[19.0s] sleep(~2.0s random)

[21.0s] ITERATION COMPLETE
        Requests: 1 (auth) + 4 (home) + 4 (inventory) + 2 (supplier req) + 2 (supplier ord) = 13
        Duration: ~21s (including sleeps)
        → VU starts next iteration immediately
```

**From your last full run:** `iteration_duration avg=19.33s, iterations=65` across all 4 scenarios.

---

## How `test.js` Connects Everything

```
script.js → default export → K6 calls runMainTest() per VU
    │
    ├─→ activeVUs (metrics/custom.js)
    │
    ├─→ authenticate() ── auth.js
    │       ├── environment.js: BASE_URL, TEST_USER, API_ENDPOINTS.auth.signIn
    │       ├── metrics/custom.js: signInDuration, dataReceived, dataSent
    │       └── returns: accessToken (from response.data.auth_token)
    │
    ├─→ createAuthHeaders() ── auth.js
    │       └── returns: { auth_token, Content-Type }
    │
    ├─→ group('Home & Dashboard')
    │       └── callApiGroup() ── api.js
    │               ├── environment.js: BASE_URL, API_GROUPS.home
    │               └── metrics: homeDuration, responseTimeTrend, ttfb
    │
    ├─→ group('Inventory')
    │       ├── callApiGroup() ── api.js  (GET list only)
    │       ├── callApi() ── api.js  (POST create)
    │       │       ├── environment.js: API_ENDPOINTS.inventory.create_inventory_item
    │       │       └── environment.js: REQUEST_PAYLOADS.create_inventory_item
    │       ├── ID capture from createRes.json().data.id
    │       ├── callApi() ── api.js  (PUT update with newItemId)
    │       │       └── environment.js: REQUEST_PAYLOADS.update_inventory_item
    │       └── callApi() ── api.js  (DELETE with newItemId)
    │
    ├─→ group('Supplier Requests')
    │       └── callApiGroup() ── api.js
    │               ├── environment.js: BASE_URL, API_GROUPS.supplier_requests
    │               └── metrics: supplierRequestsDuration
    │
    ├─→ group('Supplier Orders')
    │       └── callApiGroup() ── api.js
    │               ├── environment.js: BASE_URL, API_GROUPS.supplier_orders
    │               └── metrics: supplierOrdersDuration
    │
    └─→ sleep(random 1–3s)
```

---

## Key Concepts

| Concept | Meaning | Example |
|---|---|---|
| **group()** | Label related requests for reporting | `group('Inventory', () => {...})` |
| **sleep()** | Pause execution (simulate think time) | `sleep(5)` pauses 5 seconds |
| **VU** | Virtual User — one simulated supplier | 10 VUs = 10 concurrent suppliers |
| **Iteration** | One complete journey | Auth → all 4 groups → sleep → repeat |
| **Orchestration** | Coordinate multiple services | test.js calls auth, api, sleeps in order |
| **ID capture** | Get created resource's ID from response | `createRes.json().data.id → 513` |
| **callApiGroup()** | Test multiple endpoints in one call | All 4 home endpoints in one line |
| **callApi()** | Test single endpoint with specific method/body | POST create inventory item |

---

## Requests Per Iteration Summary

| Group | Endpoints | Method | Count |
|---|---|---|---|
| Auth | `/api/v1/auth/login/` | POST | 1 |
| Home & Dashboard | supplier_requests, supplier_orders, dashboard, top_companies | GET | 4 |
| Inventory | inventory_list | GET | 1 |
| Inventory | create item | POST | 1 |
| Inventory | update item | PUT | 1 |
| Inventory | delete item | DELETE | 1 |
| Supplier Requests | list, detail /200 | GET | 2 |
| Supplier Orders | list, detail /103 | GET | 2 |
| **Total** | | | **13 requests** |

**From your last full run:** 1004 total requests across all 4 scenarios / 65 iterations ≈ **15.4 requests per iteration** (slight variation due to graceful stop mid-iteration).

---

## Why This File Is Important

`test.js` is the **choreographer** of your entire load test:

1. ✅ **Realistic user journey** — follows actual supplier workflow (login → dashboard → inventory → requests → orders)
2. ✅ **Dynamic CRUD** — creates real data, tests update/delete, keeps staging clean
3. ✅ **Authenticated** — all requests carry valid token from login
4. ✅ **Grouped reporting** — each feature section visible separately in output
5. ✅ **Realistic pacing** — `sleep(5)` between sections + random think time
6. ✅ **Delegated logic** — no HTTP or metric code here, all in `api.js`/`auth.js`
7. ✅ **Fail-safe** — exits on auth failure, skips update/delete if create fails

**Every virtual user runs this function repeatedly until their scenario ends.** 🔄

---

## Summary

**`test.js` orchestrates per iteration:**

| Step | Action | Duration (avg) |
|---|---|---|
| 1 | Track active VU | instant |
| 2 | Login | ~440ms |
| 3 | Home & Dashboard (4 GET) | ~154ms each |
| 4 | `sleep(5)` | 5s |
| 5 | Inventory (1 GET + POST + PUT + DELETE) | ~200ms each |
| 6 | `sleep(5)` | 5s |
| 7 | Supplier Requests (2 GET) | ~130ms each |
| 8 | `sleep(5)` | 5s |
| 9 | Supplier Orders (2 GET) | ~140ms each |
| 10 | Think time sleep | 1–3s random |
| **Total** | | **~19–21s** |

**All 4 scenarios (load, stress, spike, soak) execute this same journey — only the VU count and timing differ.**
