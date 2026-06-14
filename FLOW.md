# Complete K6 Test Execution Flow

## Overview
This document shows **exactly what happens** when you run `k6 run script.js` — from the very first millisecond until the final report is generated.

**Project:** Supplier Connect Load Testing  
**Staging Server:** `http://52.220.47.3`  
**Test User:** Sadi supplier 606 (phone: 01567839606)

---

## Table of Contents
1. [Phase 0: Startup & Initialization](#phase-0-startup--initialization)
2. [Phase 1: Load Test (0:00 – 1:15)](#phase-1-load-test-000--115)
3. [Phase 2: Stress Test (1:30 – 3:10)](#phase-2-stress-test-130--310)
4. [Phase 3: Spike Test (3:10 – 3:40)](#phase-3-spike-test-310--340)
5. [Phase 4: Soak Test (4:10 – 5:10)](#phase-4-soak-test-410--510)
6. [Phase 5: Report Generation](#phase-5-report-generation)
7. [Complete Execution Diagram](#complete-execution-diagram)

---

## Phase 0: Startup & Initialization

### What You Type
```powershell
k6 run script.js
# or for a single scenario:
k6 run --env SCENARIO=load_test script.js
```

### What Happens

#### Step 1: K6 Reads `script.js`
```javascript
import { options }               from './src/config/options.js';
import { runMainTest }           from './src/modules/test.js';
import { generateSummaryReport } from './src/services/report.js';
```

K6 follows every import chain and loads all files into memory:

```
Files loaded:
├── script.js
├── src/config/options.js
├── src/config/environment.js      (imported by auth.js, api.js, test.js)
├── src/metrics/custom.js          (imported by auth.js, api.js)
├── src/services/auth.js           (imported by test.js)
├── src/services/api.js            (imported by test.js)
├── src/services/report.js
└── src/modules/test.js
```

#### Step 2: K6 Reads Test Configuration from `options.js`

```javascript
// If --env SCENARIO=load_test:
activeScenarios = {
    load_test: {
        executor: 'ramping-vus',
        stages: [
            { duration: '5s',  target: 2  },
            { duration: '15s', target: 5  },
            { duration: '30s', target: 10 },
            { duration: '20s', target: 10 },
            { duration: '5s',  target: 0  },
        ],
        gracefulRampDown: '10s',
        // startTime stripped when running alone
    }
}

// If no --env SCENARIO (all 4):
activeScenarios = { load_test, stress_test, spike_test, soak_test }
// startTime values preserved for staggered execution
```

#### Step 3: K6 Reads Thresholds
```javascript
thresholds: {
    'http_req_duration':                             ['p(50)<2000', 'p(90)<3000', 'p(95)<4000', 'p(99)<5000'],
    'http_req_failed':                               ['rate<0.10'],
    'http_reqs':                                     ['rate>3'],
    'failed_requests':                               ['count<500'],
    'error_rate':                                    ['rate<0.10'],
    'success_rate':                                  ['rate>0.90'],
    'http_req_duration{endpoint:sign_in}':           ['p(95)<5000'],
    'http_req_duration{endpoint:home}':              ['p(95)<5000'],
    'http_req_duration{endpoint:inventory}':         ['p(95)<5000'],
    'http_req_duration{endpoint:supplier_requests}': ['p(95)<5000'],
    'http_req_duration{endpoint:supplier_orders}':   ['p(95)<5000'],
}
```

#### Step 4: Console Output
```
     execution: local
        script: script.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 1m25s max duration
              * load_test: Up to 10 looping VUs for 1m15s over 5 stages
```

---

## Phase 1: Load Test (0:00 – 1:15)

**Goal:** Gradually increase to 10 concurrent users, hold, ramp down.  
**Total duration:** ~85s (75s stages + 10s gracefulRampDown)

### VU Ramp Profile
```
VUs
 |
10|         ╱══════╲
 |        ╱         ╲
 5|       ╱           ╲
 |      ╱             ╲
 2|    ╱               ╲
 |   ╱                 ╲
 0|__╱___________________╲__  time
  0  5s  20s   50s  70s  75s
  ↑  ↑   ↑     ↑    ↑    ↑
  0  2   5     10   10   0 VUs
```

### Per-VU Execution — One Complete Iteration (~19s)

```
VU#1, Iteration 1:

[0.0s] activeVUs.add(1)

[0.0s] ── authenticate() ─ auth.js ──────────────────────────────
        POST http://52.220.47.3/api/v1/auth/login/
        Body: {"phone":"01567839606","pin":"0000"}
        Tags: {endpoint:'sign_in', api:'/api/v1/auth/login/'}
        
        Response: {
          "success": true,
          "data": {
            "auth_token": "Eo_N07LZ-URWhQzJQdmk...",
            "user_details": {"id": 105}
          }
        }
        
        extractToken() → body.data.auth_token → "Eo_N07LZ..."
        
        Metrics recorded:
        ├── signInDuration.add(431ms)
        ├── dataReceived.add(1248 bytes)
        ├── dataSent.add(46 bytes)
        ├── successfulRequests.add(1)
        ├── successRate.add(1)
        └── errorRate.add(0)
        
        check: 'sign in status 200' ✓
        check: 'sign in response time < 5s' ✓
        
        Return: "Eo_N07LZ-URWhQzJQdmk..."

[0.4s] headers = { auth_token: "Eo_N07LZ...", Content-Type: "application/json" }

[0.4s] ── group('Home & Dashboard') ─ api.js ──────────────────
        callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration)
        
        Endpoint 1: GET /api/v3/supplier_requests?page=1&per_page=1&query=
          Tags: {endpoint:'home', api:'/api/v3/supplier_requests'}
          → 130ms → check ✓
          homeDuration.add(130), responseTimeTrend.add(130), ttfb.add(105)
        
        Endpoint 2: GET /api/v3/supplier_orders?page=1&per_page=15&query=
          → 140ms → check ✓
          homeDuration.add(140)
        
        Endpoint 3: GET /api/v1/dashboard
          → 155ms → check ✓
          homeDuration.add(155)
        
        Endpoint 4: GET /api/v1/dashboard/top_companies
          → 160ms → check ✓
          homeDuration.add(160)

[1.0s] sleep(5)

[6.0s] ── group('Inventory') ─ api.js ────────────────────────
        
        Step 1: GET /api/v1/inventory/  (list — no path param, clean GET)
          Tags: {endpoint:'inventory', api:'/api/v1/inventory/'}
          → 120ms → check ✓
          inventoryDuration.add(120)
        
        Step 2: POST /api/v1/inventory/
          Body: {
            "name":"Potato","price":"500.0","company_name":"Syngenta",
            "unit_id":1,"quantity":"100.2",
            "quality_parameters_desc":"Lomba misti potato"
          }
          → 210ms → check ✓
          inventoryDuration.add(210)
          
          createRes = response object (returned by callApi)
          newItemId = createRes.json().data.id → 513
        
        Step 3: PUT /api/v1/inventory/513
          Body: {"name":"Potato Update","price":"300.0","company_name":"Pran",...}
          → 205ms → check ✓
          inventoryDuration.add(205)
        
        Step 4: DELETE /api/v1/inventory/513
          → 195ms → check ✓
          inventoryDuration.add(195)
          (item removed — staging stays clean)

[7.0s] sleep(5)

[12.0s] ── group('Supplier Requests') ─ api.js ───────────────
        callApiGroup(BASE_URL,
          API_GROUPS.supplier_requests.filter(e => e.method !== 'POST'),
          headers, 'supplier_requests', supplierRequestsDuration)
        
        Endpoint 1: GET /api/v3/supplier_requests/
          → 110ms → check ✓
          supplierRequestsDuration.add(110)
        
        Endpoint 2: GET /api/v3/supplier_requests/200
          → 115ms → check ✓
          supplierRequestsDuration.add(115)

[12.5s] sleep(5)

[17.5s] ── group('Supplier Orders') ─ api.js ─────────────────
        Endpoint 1: GET /api/v3/supplier_orders/
          → 130ms → check ✓
          supplierOrdersDuration.add(130)
        
        Endpoint 2: GET /api/v3/supplier_orders/103
          → 135ms → check ✓
          supplierOrdersDuration.add(135)

[18.0s] sleep(1.8s)  ← random 1–3s think time

[19.8s] ITERATION COMPLETE
        Requests: 1+4+4+2+2 = 13
        VU#1 starts iteration 2 immediately
```

### Multiple VUs Running in Parallel

```
Time 0:05 onwards — 2 VUs active:
VU#1: auth→home→sleep5→inventory→sleep5→requests→sleep5→orders→sleep
VU#2: auth→home→sleep5→inventory→sleep5→requests→sleep5→orders→sleep
(each VU runs its own independent loop, creating concurrent load)

Time 0:20 — 5 VUs active
Time 0:50 — 10 VUs active (peak)
Time 1:10 — ramping down
Time 1:15 — 0 VUs

Across 75s + ~25 iterations:
  Inventory IDs created: 445, 446, 447 ... (each iteration creates a new item)
  All items deleted at end of their iteration → staging stays clean
```

### Load Test Actual Results (your run)
```
Requests:     389 total, 0 failed
Success rate: 100.00%
Error rate:   0.00%
p(95):        428ms
Max:          564ms
Iterations:   25 complete
```

---

## Phase 2: Stress Test (1:30 – 3:10)

**startTime: 1m30s** — begins 90s after script starts (load test ends at ~85s, 5s gap).  
**Goal:** Progressive load increase to measure degradation at each VU step.

### VU Profile
```
VUs
 |
 7|                    ╱╲
 |                   ╱  ╲
 5|              ╱╲╱    ╲
 |             ╱        ╲
 3|         ╱╲╱          ╲
 |        ╱               ╲
 0|_______╱_________________╲___  time
  1:30  1:50  2:10  2:30  2:50  3:10
```

### What Happens
```
1:30 — Stress test starts, 0 VUs
1:50 — 3 VUs active
         Same 13-request iteration loop
         avg response ~440ms (close to load test)

2:10 — 5 VUs active
         Concurrent requests increasing
         avg response ~460ms

2:30 — 7 VUs active (maximum)
         All 7 VUs hitting endpoints simultaneously
         Sign-in queue increases slightly
         avg sign_in ~490ms, p(95) ~530ms

2:50 — Begin ramp-down
3:10 — 0 VUs, stress test complete
```

Each VU still runs the full journey: auth → home → sleep5 → inventory CRUD → sleep5 → supplier requests → sleep5 → supplier orders → think time.

---

## Phase 3: Spike Test (3:10 – 3:40)

**startTime: 3m10s** — begins 190s after script starts (stress test ends ~180s).  
**Goal:** Sudden traffic surge — can the system handle a burst?

### VU Profile
```
VUs
 |
10|     ╱══════╲
 |    ╱         ╲
 2|  ╱           ╲
 |_╱_____________╲_  time
 3:10 3:15  3:35 3:40
```

### What Happens
```
3:10 — Spike test starts, 0 VUs
3:15 — Sudden jump to 2 VUs (5s ramp — steep)
3:15 — Then ramp continues toward 10 VUs
        
        At 10 VUs simultaneously:
        ├── 10 POST /api/v1/auth/login/ in parallel
        ├── Server handles burst login requests
        ├── sign_in p(95) reaches ~853ms (your actual result)
        └── All requests still succeed (no failures)

3:35 — Begin rapid drop (5s ramp down)
3:40 — 0 VUs, spike test complete

Key observation from your run: Even during the spike,
success rate remained 100%. The staging server handles
10 concurrent users without degradation.
```

---

## Phase 4: Soak Test (4:10 – 5:10)

**startTime: 4m10s** — begins 250s after script starts (spike test ends ~225s).  
**Goal:** Constant 5-VU load for 1 minute — verify no degradation over time.

### VU Profile
```
VUs
 |
 5|     ╔═══════════════════╗
 |     ║                   ║
 |     ║                   ║
 0|_____╝___________________╚___  time
  4:10                       5:10
```

### What Happens
```
4:10 — Soak test starts, 5 VUs immediately (constant-vus executor)
        No ramp-up — all 5 VUs start at the same time
        
        All 5 VUs run continuous iterations:
        ├── VU#1: auth→home→inventory→requests→orders→sleep... repeat
        ├── VU#2: (same, offset by a few seconds)
        ├── VU#3: (same)
        ├── VU#4: (same)
        └── VU#5: (same)
        
        Metrics over 60 seconds:
        ├── Response times stay consistent (no creeping degradation)
        ├── No memory accumulation
        └── Inventory IDs continue incrementing (580, 581...)

5:10 — Soak test complete

Key observation from your run: Performance stays consistent
throughout. p(95) at end of soak ≈ p(95) at start. No
degradation detected — staging server is stable.
```

---

## Phase 5: Report Generation

**Triggered:** K6 calls `handleSummary(data)` in `script.js` after all scenarios complete.

### Step 1: `generateSummaryReport(data)` — `report.js`

```javascript
const timestamp = generateTimestamp();
// → "2026-06-08_17-28-00"

const metrics           = data.metrics;
const breakpointAnalysis = analyzeBreakpoint(metrics);
printConsoleSummary(metrics, breakpointAnalysis);

return {
    [`performance_test_report/summary_${timestamp}.html`]: htmlReport(data),
    [`performance_test_report/summary_${timestamp}.json`]: JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
};
```

### Step 2: `analyzeBreakpoint()` Classifies Results

```
error_rate = 0.00%  → ✅ Error rate acceptable: 0.00%
p(95) = 434ms       → ✅ Latency acceptable: p(95) = 434.35ms
throughput = 3.06/s → 📈 Throughput: 3.06 requests/second
data received = 7MB → 📦 Data Received: 7.01 MB
```

Thresholds:
```
error_rate < 5%   → ✅ acceptable
error_rate 5–10%  → ⚠️ ELEVATED ERROR RATE
error_rate > 10%  → ⚠️ HIGH ERROR RATE
p(95) < 3000ms    → ✅ acceptable
p(95) 3–5s        → ⚠️ HIGH LATENCY
p(95) > 5s        → ⚠️ CRITICAL LATENCY
```

### Step 3: Console Summary Printed

```
========================================
PERFORMANCE TEST SUMMARY
========================================
📊 OVERALL METRICS:
   Total Requests: 1004
   Request Rate: 3.06 req/s
   Failed Requests: 0
   ✅ Successful API Calls (200): 1004
   ❌ Failed API Calls (non-200): 0
   Error Rate: 0.00%
   Success Rate: 100.00%

🔍 PER-GROUP BREAKDOWN:
   GROUP              │ REQUESTS │ SUCCESS │ FAILED │ AVG    │ p95
   ✅ SIGN_IN          │       81 │      81 │      0 │  474ms │  853ms
   ✅ HOME             │        0 │       0 │      0 │  154ms │  296ms
   ...

📋 PER-API BREAKDOWN:
   ✅ /api/v1/auth/login/           │  81 │  81 │  0
   ✅ /api/v1/dashboard             │  81 │  81 │  0
   ✅ /api/v1/inventory/            │ 158 │ 158 │  0
   ✅ /api/v1/inventory/513         │   2 │   2 │  0
   ...
   ✅ /api/v3/supplier_requests/200 │  75 │  75 │  0
   ✅ /api/v3/supplier_orders/103   │  66 │  66 │  0

⏱️  RESPONSE TIME PERCENTILES:
   p(50):  ~120ms
   p(90):  400ms
   p(95):  434ms
   Max:    888ms

🎯 BREAKPOINT ANALYSIS:
   ✅ Error rate acceptable: 0.00%
   ✅ Latency acceptable: p(95) = 434.35ms
   📈 Throughput: 3.06 requests/second
   📦 Data Received: 7.01 MB
```

### Step 4: K6 Checks All Thresholds

```
✓ http_req_duration p(50)<2000   → ~120ms   ✅
✓ http_req_duration p(90)<3000   → 400ms    ✅
✓ http_req_duration p(95)<4000   → 434ms    ✅
✓ http_req_duration p(99)<5000   → ~500ms   ✅
✓ http_req_failed rate<0.10      → 0.00%    ✅
✓ http_reqs rate>3               → 3.06/s   ✅
✓ failed_requests count<500      → 0        ✅
✓ error_rate rate<0.10           → 0.00%    ✅
✓ success_rate rate>0.90         → 100%     ✅
✓ {endpoint:sign_in} p(95)<5000  → 853ms    ✅
✓ {endpoint:home} p(95)<5000     → 296ms    ✅
✓ {endpoint:inventory} p(95)<5000 → 414ms   ✅
✓ {endpoint:supplier_requests}   → 270ms    ✅
✓ {endpoint:supplier_orders}     → 222ms    ✅

RESULT: load_test ✓  stress_test ✓  spike_test ✓  soak_test ✓
```

### Step 5: Report Files Written

```
performance_test_report/
└── summary_2026-06-08_17-28-00.html  ← open in browser for visual dashboard
└── summary_2026-06-08_17-28-00.json  ← full raw metrics

HTML report includes:
├── Executive summary
├── Threshold pass/fail table
├── Response time charts
├── VU count over time
├── Per-endpoint breakdown
└── Error log (empty if all pass)
```

### Step 6: K6 Exits

```
running (5m28.6s), 00/10 VUs, 65 complete and 16 interrupted iterations
load_test   ✓ [======================================] 00/10 VUs  1m15s
stress_test ✓ [======================================] 0/7 VUs    1m20s
spike_test  ✓ [======================================] 01/10 VUs  30s
soak_test   ✓ [======================================] 5 VUs      1m0s

Exit code: 0  (all thresholds passed)
```

---

## Complete Execution Diagram

```
═══════════════════════════════════════════════════════════════════
            SUPPLIER CONNECT K6 EXECUTION FLOW
═══════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────┐
│ STARTUP (< 1 second)                                         │
└──────────────────────────────────────────────────────────────┘

  k6 run --env SCENARIO=load_test script.js
      │
      ├── Load all JS modules into memory
      ├── Parse options.js → strip startTime for single scenario
      ├── Read thresholds
      └── K6 ready

┌──────────────────────────────────────────────────────────────┐
│ VU ITERATION LOOP  (runs for every VU, every iteration)      │
└──────────────────────────────────────────────────────────────┘

  script.js → default export → runMainTest()
      │
      ├── activeVUs.add(__VU)                  [metrics/custom.js]
      │
      ├── auth.js: authenticate()
      │   ├── environment.js: BASE_URL + API_ENDPOINTS.auth.signIn.path
      │   ├── environment.js: TEST_USER.phone + pin
      │   ├── POST /api/v1/auth/login/
      │   ├── extractToken() → response.data.auth_token
      │   ├── custom.js: signInDuration, dataReceived, dataSent
      │   ├── custom.js: successfulRequests, errorRate, successRate
      │   └── return: "Eo_N07LZ-..." or null → exit iteration
      │
      ├── auth.js: createAuthHeaders(token)
      │   └── return: { auth_token, Content-Type }
      │
      ├── group('Home & Dashboard')
      │   └── api.js: callApiGroup(BASE_URL, API_GROUPS.home, ...)
      │       ├── GET /api/v3/supplier_requests?...
      │       ├── GET /api/v3/supplier_orders?...
      │       ├── GET /api/v1/dashboard
      │       ├── GET /api/v1/dashboard/top_companies
      │       └── each: check status+time, record homeDuration, ttfb, etc.
      │   └── sleep(5)
      │
      ├── group('Inventory')
      │   ├── api.js: callApiGroup(GET-only, no {inv_id} paths)
      │   │   └── GET /api/v1/inventory/                   [list]
      │   │
      │   ├── api.js: callApi(..., 'POST', createPayload)   [create]
      │   │   └── createRes returned → newItemId = createRes.json().data.id
      │   │
      │   ├── api.js: callApi(path.replace('{inv_id}', newItemId), 'PUT')
      │   │   └── PUT /api/v1/inventory/513                [update]
      │   │
      │   └── api.js: callApi(path.replace('{inv_id}', newItemId), 'DELETE')
      │       └── DELETE /api/v1/inventory/513             [cleanup]
      │   └── sleep(5)
      │
      ├── group('Supplier Requests')
      │   └── api.js: callApiGroup(GET-only filter)
      │       ├── GET /api/v3/supplier_requests/
      │       └── GET /api/v3/supplier_requests/200
      │   └── sleep(5)
      │
      ├── group('Supplier Orders')
      │   └── api.js: callApiGroup(GET-only filter)
      │       ├── GET /api/v3/supplier_orders/
      │       └── GET /api/v3/supplier_orders/103
      │
      └── sleep(random 1–3s)   ← think time, distributes load naturally

  Iteration complete (~19s). VU repeats until scenario duration ends.

┌──────────────────────────────────────────────────────────────┐
│ METRICS COLLECTED (continuously during all scenarios)        │
└──────────────────────────────────────────────────────────────┘

  metrics/custom.js accumulates:
  ├── signInDuration        → [431, 425, 440, ...]  (all login times)
  ├── homeDuration          → [130, 140, 155, 160, ...] (all home times)
  ├── inventoryDuration     → [120, 210, 205, 195, ...] (all CRUD times)
  ├── supplierRequestsDuration → [110, 115, ...]
  ├── supplierOrdersDuration   → [130, 135, ...]
  ├── responseTimeTrend     → all request times combined
  ├── ttfb                  → all first-byte times
  ├── successfulRequests    → 1004 (counter, full run)
  ├── failedRequests        → 0
  ├── errorRate             → 0.00%
  ├── successRate           → 100%
  ├── activeVUs             → gauge (current: max 10)
  ├── dataReceived          → 6,487,467 bytes (6.5 MB)
  └── dataSent              → 2,916 bytes

┌──────────────────────────────────────────────────────────────┐
│ SCENARIO TIMING (full run)                                   │
└──────────────────────────────────────────────────────────────┘

  0:00 ──── load_test (0→2→5→10→10→0 VUs) ────── 1:15
                      1:30 ── stress_test (0→3→5→7→0) ── 3:10
                                             3:10 ─ spike ─ 3:40
                                                       4:10 ── soak ── 5:10
  ├── Total: 5m28s
  ├── 65 complete iterations across all scenarios
  └── 16 interrupted (graceful stop caught mid-iteration)

┌──────────────────────────────────────────────────────────────┐
│ REPORT GENERATION (at 5:28)                                  │
└──────────────────────────────────────────────────────────────┘

  handleSummary(data)  ← called by K6
      │
      └── report.js: generateSummaryReport(data)
          ├── generateTimestamp() → "2026-06-08_17-28-00"
          ├── analyzeBreakpoint()
          │   ├── error_rate 0.00% → ✅ acceptable
          │   └── p(95) 434ms     → ✅ acceptable
          ├── printConsoleSummary() → formatted table output
          └── return:
              ├── performance_test_report/summary_2026-06-08_17-28-00.html
              ├── performance_test_report/summary_2026-06-08_17-28-00.json
              └── stdout (k6 built-in text summary)

  K6 checks all 14 thresholds → all pass → exit code 0

═══════════════════════════════════════════════════════════════

FILE DEPENDENCIES:

  script.js
      ├── src/config/options.js
      ├── src/modules/test.js
      │       ├── src/services/auth.js
      │       │       ├── src/config/environment.js
      │       │       └── src/metrics/custom.js
      │       ├── src/services/api.js
      │       │       └── src/metrics/custom.js
      │       ├── src/config/environment.js
      │       └── src/metrics/custom.js
      └── src/services/report.js

═══════════════════════════════════════════════════════════════
```

---

## Summary: Complete Journey

### What Happens From Start to Finish

| Phase | Time | What Happens |
|---|---|---|
| Startup | 0ms | Load all modules, parse options |
| Load Test | 0:00–1:15 | 0→10 VUs, 25 iterations, all ✅ |
| Stress Test | 1:30–3:10 | 0→3→5→7 VUs, progressive load |
| Spike Test | 3:10–3:40 | Sudden 10 VU burst, system holds |
| Soak Test | 4:10–5:10 | Constant 5 VUs, stability verified |
| Report | 5:28 | HTML+JSON generated, all thresholds ✅ |

### Key Facts From Your Runs

- **Total requests (full run):** 1004 across 65 iterations
- **Inventory items created and deleted:** IDs 445→591
- **Sign-in performance:** avg 474ms, peak p(95) 853ms (under spike load)
- **Fastest endpoint:** supplier_requests avg 140ms
- **Slowest endpoint:** sign_in avg 474ms (authentication overhead — normal)
- **Staging server stability:** No degradation during soak test
- **Breaking point:** Not reached — all scenarios passed at these VU levels

### What Each Iteration Tests

Every single VU iteration covers the full supplier workflow:
1. **Login** → auth token
2. **Dashboard** → 4 home endpoints
3. **Inventory** → list + create + update + delete (full CRUD)
4. **Supplier Requests** → list + detail
5. **Supplier Orders** → list + detail
