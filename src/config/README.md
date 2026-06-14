# Configuration Module - Complete Explanation

## Overview
The `config` folder contains all centralized configuration for the load test. This follows the **DRY (Don't Repeat Yourself)** principle by storing all configuration values in one place, making them easy to update and maintain.

**Location:** `src/config/`  
**Files:**
- `options.js` - Test scenarios and performance thresholds
- `environment.js` - API base URL, credentials, endpoints, and request payloads

---

## File: `options.js` (Test Configuration & Thresholds)

### What is This File?
This file defines **HOW** your test runs - the scenarios, duration, virtual user count, and performance acceptance criteria (thresholds).

Think of it as your **test blueprint** - tells K6:
- How many virtual users to simulate
- How long to run the test
- When to ramp up/down
- What performance is acceptable
- Which scenario to run (via `--env SCENARIO=`)

### Key Features
✅ **4 test scenarios** — load, stress, spike, soak  
✅ **Runtime scenario selection** — run one or all via `--env SCENARIO=load_test`  
✅ **Graceful ramp-down** — pause before dropping VUs  
✅ **Comprehensive thresholds** — percentile-based per-endpoint metrics  

### Scenario Selection at Runtime

```powershell
# Run all 4 scenarios (staggered, total ~5m10s)
k6 run script.js

# Run only load test
k6 run --env SCENARIO=load_test script.js

# Run only stress test
k6 run --env SCENARIO=stress_test script.js

# Run only spike test
k6 run --env SCENARIO=spike_test script.js

# Run only soak test
k6 run --env SCENARIO=soak_test script.js
```

When a single scenario is selected, `startTime` is automatically removed so it starts immediately without waiting.

---

### Scenarios Explained

#### Load Test
```javascript
load_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
        { duration: '5s',  target: 2  },  // Ramp to 2 VUs
        { duration: '15s', target: 5  },  // Ramp to 5 VUs
        { duration: '30s', target: 10 },  // Ramp to 10 VUs
        { duration: '20s', target: 10 },  // Hold 10 VUs
        { duration: '5s',  target: 0  },  // Ramp down
    ],
    gracefulRampDown: '10s',
    tags: { test_type: 'load' },
}
```

**What it does:** Gradually increases to 10 concurrent users. Simulates realistic gradual traffic buildup — like normal business hours usage growing through the day.

**Timeline:**
```
0:00   0 VUs (start)
0:05   2 VUs
0:20   5 VUs
0:50   10 VUs (peak)
1:10   Begin ramp-down
1:15   Test complete (~85s total)
```

---

#### Stress Test
```javascript
stress_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
        { duration: '20s', target: 3 },
        { duration: '20s', target: 5 },
        { duration: '20s', target: 7 },
        { duration: '20s', target: 0 },
    ],
    gracefulRampDown: '10s',
    startTime: '1m30s',
    tags: { test_type: 'stress' },
}
```

**What it does:** Progressive load increase to find the breaking point. Tests performance degradation at each step — 3 → 5 → 7 VUs.

**Timeline:**
```
1:30   Stress test starts (after load test)
1:50   3 VUs
2:10   5 VUs
2:30   7 VUs (maximum)
2:50   Begin ramp-down
3:10   Stress test complete
```

---

#### Spike Test
```javascript
spike_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
        { duration: '5s',  target: 2  },   // Sudden spike
        { duration: '20s', target: 10 },   // Hold spike
        { duration: '5s',  target: 0  },   // Sudden drop
    ],
    gracefulRampDown: '5s',
    startTime: '3m10s',
    tags: { test_type: 'spike' },
}
```

**What it does:** Sudden 10 VU surge to test burst traffic handling. Simulates a real-world scenario like a flash announcement causing sudden user surge.

**Timeline:**
```
3:10   Spike test starts
3:15   10 VUs (sudden surge)
3:35   Begin rapid drop
3:40   Spike test complete
```

---

#### Soak Test
```javascript
soak_test: {
    executor: 'constant-vus',
    vus: 5,
    duration: '1m',
    startTime: '4m10s',
    tags: { test_type: 'soak' },
}
```

**What it does:** Constant 5 VUs for 1 minute. Tests stability over time — catches memory leaks, connection pool exhaustion, or gradual performance degradation.

**Timeline:**
```
4:10   Soak test starts, 5 VUs immediately
5:10   Soak test complete
Total runtime: ~5m10s
```

---

### Full Test Suite Timeline

```
0:00 ──── Load Test ────────────────── 1:15
                    1:30 ── Stress Test ──── 3:10
                                       3:10 ─ Spike ─ 3:40
                                                  4:10 ── Soak ── 5:10
```

---

### Thresholds (Acceptance Criteria)

Thresholds are **hard performance requirements** — if ANY threshold is not met, the entire test fails. Think of them as quality gates.

```javascript
thresholds: {
    // Overall response time
    'http_req_duration': [
        'p(50)<2000',   // Median under 2s
        'p(90)<3000',   // 90% under 3s
        'p(95)<4000',   // 95% under 4s
        'p(99)<5000',   // 99% under 5s
    ],
    'http_req_failed': ['rate<0.10'],    // Less than 10% errors
    'http_reqs':       ['rate>3'],       // At least 3 requests/sec

    // Custom metrics
    'failed_requests': ['count<500'],
    'error_rate':      ['rate<0.10'],
    'success_rate':    ['rate>0.90'],

    // Per-endpoint thresholds
    'http_req_duration{endpoint:sign_in}':           ['p(95)<5000'],
    'http_req_duration{endpoint:home}':              ['p(95)<5000'],
    'http_req_duration{endpoint:inventory}':         ['p(95)<5000'],
    'http_req_duration{endpoint:supplier_requests}': ['p(95)<5000'],
    'http_req_duration{endpoint:supplier_orders}':   ['p(95)<5000'],
}
```

#### Understanding Percentiles

```
1000 requests sorted by response time (fastest → slowest):

[══════════════ 50% ══════════════|══════ 50% ══════]
                                  ^ p(50) = median

[════════════════════ 90% ════════════════|══ 10% ══]
                                          ^ p(90)

[══════════════════════════ 95% ══════════════|═ 5%═]
                                              ^ p(95)

[═══════════════════════════════════ 99% ══════|═1%═]
                                               ^ p(99)
```

| Percentile | Meaning | Example (1000 requests) |
|---|---|---|
| p(50) | Median — half faster, half slower | 500 requests below this time |
| p(90) | 9 out of 10 users get this speed | 900 requests below this time |
| p(95) | Only 5 in 100 see slowness | 950 requests below this time |
| p(99) | Even the slowest 1% | 990 requests below this time |

#### Threshold Operators

| Operator | Meaning | Example |
|---|---|---|
| `<` | Less than | `p(95)<4000` → must be under 4s |
| `>` | Greater than | `rate>3` → must be over 3 req/s |
| `<=` | Less than or equal | `p(95)<=4000` |
| `>=` | Greater than or equal | `rate>=3` |

#### Why `rate>3` for `http_reqs`?

Each VU takes ~19s per full iteration (login + 4 groups + 15s sleep). With 10 VUs: `10 × (1/19s) ≈ 0.53 iterations/s`. Each iteration makes ~13 requests, so `0.53 × 13 ≈ 7 req/s` at peak, ~4.6 req/s average across the test. Setting `rate>3` is realistic — it catches genuine system failure without being too strict for an intentionally sleep-heavy test.

---

## File: `environment.js` (API Configuration & Credentials)

### What is This File?
This file stores all **environment-specific values**:
- Base API URL (staging)
- Test user credentials
- API request payloads (POST/PUT bodies)
- All API endpoints organized by feature group
- Endpoint groupings for batch test execution

Think of it as your **settings and API catalog** — change the URL once, it affects the entire test.

### Key Features
✅ **Staging environment** — `http://52.220.47.3`  
✅ **Supplier Connect endpoints** — auth, home, inventory, supplier requests, supplier orders  
✅ **Dynamic inventory CRUD** — create → update → delete cycle using captured IDs  
✅ **Organized by feature** — easy to extend  

---

### Line-by-Line Explanation

#### Base URL
```javascript
export const BASE_URL = 'http://52.220.47.3';
```

**What it is:** Staging server IP for all API calls.

**Why centralized?** Change ONE line to switch environments:
```javascript
// Staging
BASE_URL = 'http://52.220.47.3'

// Production
BASE_URL = 'https://**********.ifarmer.asia'
```

---

#### Test User Credentials
```javascript
export const TEST_USER = {
    phone: '01567839606',
    pin:   '0000',
};
```

**What it is:** Login credentials for the load test user (Sadi supplier 606).

**Why separate?** Security best practice — credentials in config, not scattered through test code.

**Login response shape:**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "auth_token": "eyJ...",
    "user_details": { "id": 105, ... }
  }
}
```
Token is at `data.auth_token` — extracted in `auth.js`.

---

#### Request Payloads
```javascript
export const REQUEST_PAYLOADS = {
    registration: {
        name: "Sadi supplier 606 (Load test)",
        phone: "01567839606",
        address: "nokhailam",
        sourcing_area_id: 10,
        pin: "0000",
        bkash_number: "01749653931",
        // ... bank details, NID URLs
    },
    create_inventory_item: {
        name: "Potato",
        price: "500.0",
        company_name: "Syngenta",
        unit_id: 1,
        quantity: "100.2",
        quality_parameters_desc: "Lomba misti potato"
    },
    update_inventory_item: {
        name: "Potato Update",
        price: "300.0",
        company_name: "Pran",
        quantity: "200.2",
        quality_parameters_desc: "Lomba misti potato update"
    }
}
```

**Why separate?** Clean, reusable request bodies — no hardcoding data inside test logic:
```javascript
// Without payloads (messy):
callApi(url, headers, 'inventory', metric, 'POST',
    JSON.stringify({ name: "Potato", price: "500.0", ... }))

// With payloads (clean):
callApi(url, headers, 'inventory', metric, 'POST',
    JSON.stringify(REQUEST_PAYLOADS.create_inventory_item))
```

---

#### API Endpoints
```javascript
export const API_ENDPOINTS = {
    auth: {
        signIn: { path: '/api/v1/auth/login/', method: 'POST' },
    },
    home: {
        supplier_requests: { path: '/api/v3/supplier_requests?page=1&per_page=1&query=', method: 'GET' },
        supplier_orders:   { path: '/api/v3/supplier_orders?page=1&per_page=15&query=', method: 'GET' },
        dashboard:         { path: '/api/v1/dashboard', method: 'GET' },
        top_companies:     { path: '/api/v1/dashboard/top_companies', method: 'GET' },
    },
    inventory: {
        inventory_list:        { path: '/api/v1/inventory/',           method: 'GET'    },
        create_inventory_item: { path: '/api/v1/inventory/',           method: 'POST'   },
        update_inventory_item: { path: '/api/v1/inventory/{inv_id}',   method: 'PUT'    },
        inventory_item:        { path: '/api/v1/inventory/{inv_id}',   method: 'GET'    },
        delete_inventory_item: { path: '/api/v1/inventory/{inv_id}',   method: 'DELETE' },
    },
    supplier_requests: {
        supplier_requests:      { path: '/api/v3/supplier_requests/',    method: 'GET' },
        supplier_request_detail:{ path: '/api/v3/supplier_requests/200', method: 'GET' },
    },
    supplier_orders: {
        supplier_orders:      { path: '/api/v3/supplier_orders/',    method: 'GET' },
        supplier_order_detail:{ path: '/api/v3/supplier_orders/103', method: 'GET' },
    },
};
```

**Structure benefits:**
- **Self-documenting** — clear what each endpoint does
- **Method included** — GET/POST/PUT/DELETE visible at a glance
- **Path placeholders** — `{inv_id}` replaced at runtime after create

**Note on `{inv_id}`:** Inventory PUT/DELETE/GET-by-id paths contain `{inv_id}`. These are NOT called via `callApiGroup` directly. Instead, `test.js` captures the ID from the create response and substitutes it:
```javascript
const id = createRes.json().data.id;
const url = path.replace('{inv_id}', id);
```

---

#### API Groups
```javascript
export const API_GROUPS = {
    supplier_reg:      [ API_ENDPOINTS.supplier_reg.registration ],
    home:              [ /* 4 home endpoints */ ],
    inventory:         [ /* 5 inventory endpoints */ ],
    supplier_requests: [ /* 2 supplier request endpoints */ ],
    supplier_orders:   [ /* 2 supplier order endpoints */ ],
};
```

**What it is:** Arrays of endpoints grouped by feature — used with `callApiGroup()` for batch execution.

**Why useful?**
```javascript
// Without groups — 4 separate calls:
callApi(`${BASE_URL}/api/v3/supplier_requests...`, headers, ...)
callApi(`${BASE_URL}/api/v3/supplier_orders...`,   headers, ...)
callApi(`${BASE_URL}/api/v1/dashboard`,            headers, ...)
callApi(`${BASE_URL}/api/v1/dashboard/top_companies`, headers, ...)

// With groups — one line:
callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration);
```

**Note:** `supplier_reg` group exists in config but is not currently exercised in `test.js`. A dedicated registration section can be added when a `registrationDuration` metric is added to `custom.js`.

---

### Key Takeaways

| Item | Purpose | Value |
|---|---|---|
| `BASE_URL` | Staging server | `http://52.220.47.3` |
| `TEST_USER` | Login credentials | phone `01567839606`, pin `0000` |
| `REQUEST_PAYLOADS` | POST/PUT bodies | registration, create/update inventory |
| `API_ENDPOINTS` | Individual endpoint definitions | path + method per endpoint |
| `API_GROUPS` | Batch endpoint collections | home, inventory, supplier_requests, supplier_orders |

---

## Connection to Other Files

```
script.js
  ├── options.js       → K6 scenarios + thresholds
  └── test.js
        ├── environment.js  → BASE_URL, API_GROUPS, API_ENDPOINTS, REQUEST_PAYLOADS
        ├── auth.js         → authenticate() using TEST_USER + API_ENDPOINTS.auth.signIn
        └── api.js          → callApi() + callApiGroup() using BASE_URL

auth.js
  └── environment.js   → BASE_URL, TEST_USER, API_ENDPOINTS.auth.signIn

api.js
  └── environment.js   → BASE_URL (for URL construction and metric tagging)

report.js
  └── (no config import — summarizes metrics collected during test run)
```

---

## Summary

**`options.js`** = **When, How, and Success Criteria**
- **When:** 4 staggered scenarios across ~5m10s
- **How:** VU counts, ramp stages, start times
- **Success:** Thresholds that must all pass

**`environment.js`** = **What, Where, and With What Data**
- **What:** Supplier Connect API endpoints (auth, home, inventory, requests, orders)
- **Where:** Staging server `http://52.220.47.3`
- **With What:** Test user credentials and request payloads

Together they define your complete test configuration:
1. ✅ **Supplier Connect focused** — all endpoints match actual project
2. ✅ **Organized by feature** — easy to find and extend
3. ✅ **Single source of truth** — change BASE_URL once to switch environments
4. ✅ **DRY** — no duplication across files
5. ✅ **Dynamic CRUD** — inventory create→update→delete using live IDs
