# Metrics Module - Complete Explanation

## Overview
The `metrics` folder contains all **custom metric definitions** for the load test. Metrics are the "scoreboard" that measures performance during testing. This module defines what data gets collected, how it's organized, and how it flows through the test.

**Location:** `src/metrics/`  
**Files:**
- `custom.js` — All custom K6 metric definitions and endpoint metric mappings

**Key Principle:** Follows **Single Responsibility Principle** — only defines metrics, doesn't record them (that's `api.js` and `auth.js`'s job).

---

## File: `custom.js` (Custom Metrics Definitions)

### What is This File?
This file defines all the **custom metrics** that K6 tracks during your supplier connect load test. Metrics measure how well the API performs under load.

Think of it as the **instrument panel** of your test:
- **Speed:** Response time metrics (how fast?)
- **Reliability:** Success/failure counters (does it work?)
- **Volume:** Data transfer tracking (how much data?)
- **Load:** Active user gauge (how many concurrent users?)

### Why Custom Metrics?
K6 provides built-in metrics (`http_req_duration`, `http_req_failed`), but custom metrics let you:
1. **Track per-endpoint performance** (is inventory slower than home?)
2. **Measure business reliability** (supplier request success rate)
3. **Create specific thresholds** (p(95) for sign-in < 5s)
4. **Generate custom reports** (the HTML summary at end of test)

---

### Import Statement

```javascript
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
```

**The 4 K6 Metric Types:**

| Type | Measures | Use Case | Example Output |
|------|----------|----------|----------------|
| **Counter** | Running total (only increases) | Total successes/failures | `failedRequests = 31` |
| **Trend** | Distribution & percentiles | Response times | `p(95)=431ms` |
| **Rate** | Percentage (0–100%) | Success/error percentage | `errorRate = 0.00%` |
| **Gauge** | Current snapshot value | Active VUs right now | `activeVUs = 10` |

**Visual difference:**
```
Counter:  0 → 1 → 2 → 5 → 8 → 31 → ...  (only goes up)
Rate:     0% → 0% → 0% → 0.00% → ...    (fluctuates 0-100%)
Gauge:    2 → 5 → 10 → 10 → 7 → 1 → 0  (up and down with VU stages)
Trend:    [392ms, 422ms, 431ms, 445ms]   (stores all values for percentiles)
```

---

### Metrics Defined

#### 1. Request Success/Failure Counters

```javascript
export const failedRequests    = new Counter('failed_requests');
export const successfulRequests = new Counter('successful_requests');
```

**What it does:** Tracks absolute number of passing vs failing requests.

**Recorded in `api.js` and `auth.js`:**
```javascript
if (response.status === 200) {
    successfulRequests.add(1);
} else {
    failedRequests.add(1);
}
```

**From your last full test run:**
```
failedRequests     = 0      ✅
successfulRequests = 1004   ✅
```

**Why track absolute count?** "0 failures" is clearer than "0.00% error rate" when reporting to stakeholders.

---

#### 2. Per-Endpoint Success/Failure Counters

```javascript
export const endpointSuccessCount = new Counter('endpoint_success_count');
export const endpointFailureCount = new Counter('endpoint_failure_count');
```

**What it does:** Counts success/failure with endpoint tags, enabling per-endpoint breakdown.

**How tagged in `api.js`:**
```javascript
endpointSuccessCount.add(1, { endpoint: 'inventory', status: '200' });
endpointFailureCount.add(1, { endpoint: 'inventory', status: '404' });
```

**From your last full run:**
```
endpoint_success_count = 1004  (all 4 scenarios combined)
endpoint_failure_count = 0
```

---

#### 3. Per-API Path Counters

```javascript
export const apiSuccessCount = new Counter('api_success');
export const apiFailureCount = new Counter('api_failure');
```

**What it does:** Tracks success/failure per exact API path — powers the per-API breakdown table in your summary report.

**From your last full run (sample):**
```
✅ /api/v1/auth/login/                   → 81 success, 0 failed
✅ /api/v1/dashboard                     → 81 success, 0 failed
✅ /api/v1/inventory/                    → 158 success, 0 failed
✅ /api/v1/inventory/513..591            → 2 each, all success
✅ /api/v3/supplier_requests/            → 75 success, 0 failed
✅ /api/v3/supplier_orders/              → 67 success, 0 failed
```

---

#### 4. Success and Error Rate Metrics

```javascript
export const errorRate   = new Rate('error_rate');
export const successRate = new Rate('success_rate');
```

**What it does:** Tracks **percentages** — how much of all traffic is succeeding or failing.

**How it works:**
```javascript
// Each request adds 0 (good) or 1 (bad):
if (response.status === 200) {
    errorRate.add(0);    // not an error
    successRate.add(1);  // a success
} else {
    errorRate.add(1);    // is an error
    successRate.add(0);  // not a success
}
// K6 computes: errorRate = (sum of 1s) / (total calls)
```

**From your last full run:**
```
✓ error_rate   = 0.00%   (threshold: <10%)
✓ success_rate = 100.00% (threshold: >90%)
```

**Counter vs Rate:**
```
failedRequests = 0        → absolute count
errorRate      = 0.00%    → relative percentage
Both say the same thing, different format for different audiences.
```

---

#### 5. Response Time Trend Metrics

```javascript
export const responseTimeTrend = new Trend('response_time_ms');
export const ttfb              = new Trend('time_to_first_byte');
```

**`responseTimeTrend`:** Total time from sending request to receiving the complete response.

**`ttfb` (Time To First Byte):** Time until the server sends the very first byte back.

**Timeline of a single request:**
```
Send request ──┬──────────────────────────────────────────┐
               │ Network latency                          │
               ├──────────────────────────────────────    │
               │ Server processing                        │
               ├──────────────────────────────────────    │ Total
               │ Send first byte  ← TTFB ends here        │ response
               ├──────────────────────────────────────    │ time
               │ Download response body                   │
Receive complete ─────────────────────────────────────────┘
```

**From your last full run:**
```
response_time_ms:
  avg: 161ms   p(90): 304ms   p(95): 359ms   max: 781ms

time_to_first_byte:
  avg: 132ms   p(90): 199ms   p(95): 215ms   max: 693ms
```

**Diagnosing issues using both metrics:**

| Scenario | Response Time | TTFB | Problem |
|---|---|---|---|
| Both high | p(95)=2000ms | p(95)=1900ms | Server is slow |
| Response high, TTFB low | p(95)=2000ms | p(95)=100ms | Response body too large |
| Both low | p(95)=431ms | p(95)=215ms | ✅ All good (your current state) |

---

#### 6. Per-Endpoint Duration Metrics

```javascript
export const signInDuration          = new Trend('sign_in_duration',          true);
export const homeDuration            = new Trend('home_duration',              true);
export const inventoryDuration       = new Trend('inventory_duration',         true);
export const supplierRequestsDuration = new Trend('supplier_requests_duration', true);
export const supplierOrdersDuration  = new Trend('supplier_orders_duration',   true);
```

**What it does:** Separate response time tracking per feature group — shows which group is fast or slow independently.

**Why separate?**
```
Without per-endpoint metrics:
  responseTimeTrend avg = 186ms  ← hides variation

With per-endpoint metrics:
  sign_in_duration     avg = 474ms  ← slowest (authentication overhead)
  home_duration        avg = 154ms  ← fast
  inventory_duration   avg = 209ms  ← slightly slower (CRUD operations)
  supplier_requests    avg = 140ms  ← fastest
  supplier_orders      avg = 143ms  ← fast
  
Discovery: Sign-in is 3× slower than other endpoints.
```

**The `true` parameter — high resolution mode:**
```javascript
new Trend('sign_in_duration', true)
// Enables: p(99.99), p(99.999) — extreme outlier detection
// Useful for critical endpoints like login
```

**From your last full run:**
```
sign_in_duration:           avg=474ms   p(95)=853ms
home_duration:              avg=154ms   p(95)=296ms
inventory_duration:         avg=188ms   p(95)=414ms
supplier_requests_duration: avg=140ms   p(95)=270ms
supplier_orders_duration:   avg=143ms   p(95)=222ms
```

---

#### 7. Active Virtual Users Gauge

```javascript
export const activeVUs = new Gauge('active_vus');
```

**What it does:** Captures **how many VUs are running right now** — a snapshot, not a total.

**Recorded in `test.js`:**
```javascript
activeVUs.add(__VU);  // __VU is k6's built-in current VU number
```

**How it changes across your load test stages:**
```
Stage 1 (5s ramp):   activeVUs → 2
Stage 2 (15s ramp):  activeVUs → 5
Stage 3 (30s ramp):  activeVUs → 10
Stage 4 (20s hold):  activeVUs → 10  (peak)
Stage 5 (5s ramp down): activeVUs → 0
```

**From your last full run:**
```
active_vus: avg=4  min=1  max=10
```

**Why useful?** Correlate errors with VU count:
```
10 VUs → 0.00% errors   ✅ (your result — system handles load fine)
```

---

#### 8. Data Transfer Metrics

```javascript
export const dataReceived = new Counter('data_received_bytes');
export const dataSent     = new Counter('data_sent_bytes');
```

**What it does:** Tracks network bandwidth usage in bytes.

**Recorded in `api.js` and `auth.js`:**
```javascript
dataReceived.add(res.body ? res.body.length : 0);
dataSent.add(payloadSize);
```

**From your last full run (all 4 scenarios):**
```
data_received_bytes = 6,487,467 bytes  (6.5 MB received)
data_sent_bytes     = 2,916 bytes      (2.9 KB sent)
data_received       = 7.3 MB total     (k6 built-in, includes headers)
data_sent           = 231 KB total
```

**Why the big difference (sent vs received)?**
API responses (JSON data) are much larger than requests (small JSON payloads). Normal for read-heavy APIs.

**Why track?**
- Identify unexpectedly large responses
- Bandwidth cost estimation (cloud providers charge per GB)
- Spot uncompressed endpoints (should use GZIP)

---

#### 9. Endpoint Metrics Mapping

```javascript
export const ENDPOINT_METRICS = {
    sign_in:           signInDuration,
    home:              homeDuration,
    inventory:         inventoryDuration,
    supplier_requests: supplierRequestsDuration,
    supplier_orders:   supplierOrdersDuration,
};
```

**What it does:** A lookup table connecting endpoint tag names to their trend metrics — used inside `api.js` for clean, DRY metric recording.

**Without this map (bad — repetitive):**
```javascript
if (endpointTag === 'sign_in')           signInDuration.add(duration);
else if (endpointTag === 'home')         homeDuration.add(duration);
else if (endpointTag === 'inventory')    inventoryDuration.add(duration);
else if (endpointTag === 'supplier_requests') supplierRequestsDuration.add(duration);
else if (endpointTag === 'supplier_orders')   supplierOrdersDuration.add(duration);
// 5 conditions, must update every time you add an endpoint
```

**With this map (good — one line):**
```javascript
ENDPOINT_METRICS[endpointTag]?.add(duration);
// Clean, DRY — map handles the lookup automatically
```

**Note:** The map keys (`sign_in`, `home`, `inventory`, etc.) must match exactly the `endpointTag` strings passed in `test.js` to `callApi()` and `callApiGroup()`. If a tag has no matching key, the `?.` (optional chaining) safely skips recording.

---

## Understanding Percentiles (Trend Metrics)

Percentiles show where a value falls in the full distribution of results — more meaningful than averages because they're not distorted by outliers.

**Real example from your test:**
```
sign_in_duration values (31 iterations × ~1 request each):
[390, 392, 400, 415, 422, 424, 425, 426, 427, 428, 430, 431,
 432, 433, 434, 436, 438, 440, 445, 450, 455, 460, 462, 465,
 470, 480, 490, 497, 500, 522, 564]  (ms, sorted)

avg    = 440ms   ← single average
p(50)  = 431ms   ← half the logins were faster than this
p(90)  = 486ms   ← 9 out of 10 logins were under this
p(95)  = 522ms   ← 95% of logins were under this
p(99)  = 564ms   ← even the slowest logins were under this
max    = 564ms   ← single worst case
```

**Why percentiles beat averages:**
```
10 requests: [100, 110, 100, 105, 110, 100, 105, 110, 100, 5000ms]

avg    = 594ms  ← one slow request ruins the average
p(95)  = 110ms  ← real experience for 95% of users
p(99)  = 5000ms ← catches the outlier explicitly
```

---

## How Metrics Flow Through the Test

```
custom.js defines all metrics
       │
       ├─→ auth.js imports:
       │   signInDuration, dataReceived, dataSent,
       │   successfulRequests, failedRequests,
       │   errorRate, successRate,
       │   apiSuccessCount, apiFailureCount,
       │   endpointSuccessCount, endpointFailureCount
       │
       │   Records during login:
       │   signInDuration.add(res.timings.duration)  → 431ms
       │   dataReceived.add(res.body.length)          → 1248 bytes
       │   successfulRequests.add(1)
       │   successRate.add(1)
       │   errorRate.add(0)
       │
       └─→ api.js imports all of the above + ENDPOINT_METRICS
           
           Records during each callApi():
           responseTimeTrend.add(res.timings.duration)
           ttfb.add(res.timings.waiting)
           ENDPOINT_METRICS[endpointTag]?.add(duration)
           ├─ 'home'              → homeDuration.add(154ms)
           ├─ 'inventory'         → inventoryDuration.add(209ms)
           ├─ 'supplier_requests' → supplierRequestsDuration.add(140ms)
           └─ 'supplier_orders'   → supplierOrdersDuration.add(143ms)
           
           dataReceived.add(res.body.length)
           successfulRequests / failedRequests
           errorRate / successRate
           endpointSuccessCount / endpointFailureCount
           apiSuccessCount / apiFailureCount

After test completes:
       │
       ├─→ K6 checks metrics against thresholds (options.js)
       │   ✓ error_rate < 0.10?        → 0.00% ✅
       │   ✓ success_rate > 0.90?      → 100% ✅
       │   ✓ http_req_duration p(95)?  → 434ms ✅
       │   ✓ failed_requests < 500?    → 0 ✅
       │
       └─→ report.js reads all metrics → generates HTML summary
           Shows per-group table (SIGN_IN, HOME, INVENTORY, ...)
           Shows per-API table (/api/v1/auth/login/, ...)
           Shows percentile breakdown (p50, p90, p95, p99)
```

---

## Key Takeaways

**Metric type selection guide:**

| When to use | Type | Supplier Connect example |
|---|---|---|
| Count total occurrences | **Counter** | `failedRequests`, `dataReceived` |
| Show percentage | **Rate** | `errorRate` (0.00%), `successRate` (100%) |
| Analyze distribution | **Trend** | `inventoryDuration` p(95)=414ms |
| Monitor current state | **Gauge** | `activeVUs` = 10 at peak |

**Best practices followed in this project:**

1. **Both absolute and percentage** — `failedRequests=0` AND `errorRate=0.00%`
2. **Per-endpoint breakdown** — 5 separate duration trends, not just one global metric
3. **High-resolution mode** — `true` on all duration trends for precise percentiles
4. **DRY mapping** — `ENDPOINT_METRICS` lookup table instead of repeated if-else

**Metric → Threshold → Report pipeline:**
```
custom.js  →  api.js / auth.js  →  options.js  →  report.js
(define)      (record)             (validate)      (visualize)
```

---

## Summary

**`custom.js` is the foundation of all performance visibility:**

| Metric | Type | Tracks |
|---|---|---|
| `failedRequests` / `successfulRequests` | Counter | Absolute request counts |
| `endpointSuccessCount` / `endpointFailureCount` | Counter | Per-endpoint counts (tagged) |
| `apiSuccessCount` / `apiFailureCount` | Counter | Per-API path counts (tagged) |
| `errorRate` / `successRate` | Rate | Failure/success percentages |
| `responseTimeTrend` | Trend | Overall response time distribution |
| `ttfb` | Trend | Time to first byte (server speed) |
| `signInDuration` | Trend | Login endpoint performance |
| `homeDuration` | Trend | Home/dashboard performance |
| `inventoryDuration` | Trend | Inventory CRUD performance |
| `supplierRequestsDuration` | Trend | Supplier requests performance |
| `supplierOrdersDuration` | Trend | Supplier orders performance |
| `activeVUs` | Gauge | Concurrent users right now |
| `dataReceived` / `dataSent` | Counter | Bandwidth usage in bytes |
| `ENDPOINT_METRICS` | Map | DRY tag → trend metric lookup |

**From your last full run (all 4 scenarios, 1004 requests):**
```
All metrics green ✅
0 failures | 0.00% error rate | 100% success rate
p(95) = 434ms across all endpoints
7.3 MB data received in 5m28s
```
