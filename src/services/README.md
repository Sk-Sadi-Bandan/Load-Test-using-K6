# Services Module - Complete Explanation

## Overview
The `services` folder contains all **business logic modules** that perform actual work — authentication, API calls, and reporting. Each service handles one specific responsibility.

**Location:** `src/services/`  
**Files:**
- `auth.js` — Authentication and token management
- `api.js` — API request execution and metric tracking
- `report.js` — Test result analysis and reporting

---

## File: `auth.js` (Authentication Service)

### What is This File?
This file handles all **authentication operations**:
- Making login requests to the supplier connect API
- Extracting the auth token from the response
- Validating credentials
- Creating authenticated request headers for subsequent calls

Think of it as the **security checkpoint** of your test — every VU must pass through here before testing any feature.

### Functions

---

#### `authenticate()` — User Login

**Purpose:** Logs in with `TEST_USER` credentials and returns the auth token.  
**Returns:** `string | null` — token string if successful, `null` if login failed.

##### Step 1: Build URL and Payload

```javascript
const signInUrl     = `${BASE_URL}${API_ENDPOINTS.auth.signIn.path}`;
// Result: http://52.220.47.3/api/v1/auth/login/

const signInPayload = JSON.stringify({
    phone: TEST_USER.phone,  // '01567839606'
    pin:   TEST_USER.pin,    // '0000'
});
// Result: '{"phone":"01567839606","pin":"0000"}'
```

##### Step 2: Make POST Request

```javascript
const signInRes = http.post(signInUrl, signInPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: {
        endpoint: 'sign_in',
        api: API_ENDPOINTS.auth.signIn.path,
    },
});
```

The `tags` field links this request to the `sign_in` metric bucket — enables per-endpoint threshold checking in `options.js`.

**HTTP Request:**
```
POST /api/v1/auth/login/ HTTP/1.1
Host: 52.220.47.3
Content-Type: application/json

{"phone":"01567839606","pin":"0000"}
```

**Server Response:**
```json
{
  "success": true,
  "message": "Login successful.",
  "message_bn": "লগইন সফল হয়েছে।",
  "data": {
    "auth_token": "Eo_N07LZ-URWhQzJQdmk...",
    "user_details": { "id": 105, "name": "Sadi supplier 606 (Load test)" }
  }
}
```

##### Step 3: Record Metrics

```javascript
signInDuration.add(signInRes.timings.duration);
dataReceived.add(signInRes.body ? signInRes.body.length : 0);
dataSent.add(signInPayload.length);
```

**From your last full run:** `sign_in_duration avg=474ms, p(95)=853ms` — all 81 logins ✅

##### Step 4: Validate Response

```javascript
const signInSuccess = check(signInRes, {
    'sign in status 200':         (r) => r.status === 200,
    'sign in response time < 5s': (r) => r.timings.duration < 5000,
});
```

Two checks — both must pass for login to be considered successful.

##### Step 5: Handle Failure or Success

```javascript
if (!signInSuccess) {
    failedRequests.add(1);
    errorRate.add(1);
    successRate.add(0);
    console.error(`Sign-in failed: Status ${signInRes.status}, Time: ${signInRes.timings.duration}ms`);
    return null;   // ← test.js exits the iteration on null
}

successfulRequests.add(1);
errorRate.add(0);
successRate.add(1);
```

##### Step 6: Extract Token — `extractToken()`

Token extraction is handled by a dedicated helper:

```javascript
function extractToken(res) {
    try {
        const body = res.json();

        // Try common response shapes in order:
        if (body.access_token)              return body.access_token;
        if (body.token)                     return body.token;
        if (body.data && body.data.auth_token)   return body.data.auth_token;  // ← supplier connect uses this
        if (body.data && body.data.access_token) return body.data.access_token;
        if (body.data && body.data.token)        return body.data.token;

        // Not found — log actual keys so developer can fix quickly
        console.error(
            `No access token received. Response keys: [${Object.keys(body).join(', ')}]` +
            ` | Status: ${res.status}` +
            ` | Body (first 200 chars): ${res.body.substring(0, 200)}`
        );
        return null;
    } catch (e) {
        console.error(`Failed to parse login response as JSON. Status: ${res.status} | Body: ${res.body}`);
        return null;
    }
}
```

**Why a helper function?** The supplier connect API returns the token at `data.auth_token` — a non-standard key. The helper tries multiple shapes so a future API change won't break the entire test silently; instead it logs the actual response keys.

**Your API's token location:** `response.data.auth_token` ✅

---

#### `createAuthHeaders(accessToken)` — Header Builder

**Purpose:** Wraps the token in the HTTP header format the supplier connect API expects.

```javascript
export function createAuthHeaders(accessToken) {
    return {
        'auth_token':     accessToken,
        'Content-Type':  'application/json',
    };
}
```

**Input:** token string from `authenticate()`  
**Output:**
```javascript
{
    'auth_token':    'Eo_N07LZ-URWhQzJQdmk...',
    'Content-Type':  'application/json'
}
```

These headers are passed to every API call in `test.js`. If the header key changes in future, update this one function and it propagates everywhere — DRY principle.

---

## File: `api.js` (API Service)

### What is This File?
This file handles all **API request operations**:
- Executing HTTP requests (GET, POST, PUT, DELETE, PATCH)
- Tagging requests for per-endpoint metric filtering
- Validating responses with `check()`
- Recording all performance metrics
- Returning the response object for callers that need it (e.g. inventory create → capture ID)

Think of it as the **universal request executor** that every test endpoint goes through.

---

### Function: `callApi()` — Single Request

**Purpose:** Makes ONE API request with any HTTP method, records metrics, validates response.

**Signature:**
```javascript
export function callApi(
    url,                 // Full URL including BASE_URL + path
    headers,             // Auth headers from createAuthHeaders()
    endpointTag,         // String tag: 'home', 'inventory', 'sign_in', etc.
    durationMetric,      // Trend metric object (homeDuration, inventoryDuration, etc.)
    method = 'GET',      // HTTP method — defaults to GET
    body = null          // JSON string for POST/PUT/PATCH — null for GET/DELETE
)
```

**Returns:** k6 response object — used by `test.js` to capture inventory ID from create response.

#### Key Parts

**1. Extract clean API path for metric tagging**
```javascript
const apiPath = url.replace(BASE_URL_PATTERN, '').split('?')[0];
// "http://52.220.47.3/api/v1/inventory/?..." → "/api/v1/inventory/"
```

This path appears in the per-API breakdown table in your summary report.

**2. Execute request by method**
```javascript
switch(method.toUpperCase()) {
    case 'POST':   res = http.post(url, body, requestOptions);   break;
    case 'PUT':    res = http.put(url, body, requestOptions);    break;
    case 'DELETE': res = http.del(url, requestOptions);          break;
    case 'PATCH':  res = http.patch(url, body, requestOptions);  break;
    case 'GET':
    default:       res = http.get(url, requestOptions);          break;
}
```

**3. Record performance metrics**
```javascript
responseTimeTrend.add(res.timings.duration);   // Overall response time
ttfb.add(res.timings.waiting);                  // Time to first byte
durationMetric.add(res.timings.duration);       // Per-endpoint duration (homeDuration, etc.)
dataReceived.add(res.body ? res.body.length : 0);
```

**4. Validate and track success/failure**
```javascript
const success = check(res, {
    'status is 200':        (r) => r.status === 200,
    'response time < 5s':   (r) => r.timings.duration < 5000,
});

check(res, {
    [`API:${apiPath}:success`]: (r) => r.status === 200,
});

if (!success) {
    failedRequests.add(1);
    errorRate.add(1);
    successRate.add(0);
    endpointFailureCount.add(1, { endpoint: endpointTag, status: res.status.toString() });
    apiFailureCount.add(1, { api: apiPath, group: endpointTag });
} else {
    successfulRequests.add(1);
    errorRate.add(0);
    successRate.add(1);
    endpointSuccessCount.add(1, { endpoint: endpointTag, status: '200' });
    apiSuccessCount.add(1, { api: apiPath, group: endpointTag });
}
```

The tagged counters (`endpointSuccessCount`, `apiSuccessCount`) are what powers the per-group and per-API breakdown tables in your console summary.

**5. Return response**
```javascript
return res;
```

`test.js` uses this return value in the inventory section:
```javascript
const createRes = callApi(createUrl, headers, 'inventory', inventoryDuration, 'POST', createPayload);
const newItemId = createRes.json().data.id;  // capture ID for PUT/DELETE
```

---

### Function: `callApiGroup()` — Batch Requests

**Purpose:** Iterates an array of endpoints and calls `callApi()` for each — avoids repetitive loop code in `test.js`.

**Signature:**
```javascript
export function callApiGroup(
    baseUrl,              // BASE_URL
    endpoints,            // Array of { path, method } objects
    headers,              // Auth headers
    groupTag,             // Metric tag string
    metricReference,      // Duration trend metric
    requestBody = null    // Optional shared body for POST/PUT endpoints
)
```

**How it works:**
```javascript
endpoints.forEach(endpoint => {
    const fullUrl = `${baseUrl}${endpoint.path}`;
    const method  = endpoint.method || 'GET';
    callApi(fullUrl, headers, groupTag, metricReference, method, requestBody);
});
```

**Example — home group:**
```javascript
callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration);

// Internally executes:
// GET http://52.220.47.3/api/v3/supplier_requests?page=1&per_page=1&query=
// GET http://52.220.47.3/api/v3/supplier_orders?page=1&per_page=15&query=
// GET http://52.220.47.3/api/v1/dashboard
// GET http://52.220.47.3/api/v1/dashboard/top_companies
```

**Why not just loop in `test.js`?** Keeps `test.js` clean and readable — the orchestrator describes what to test, `api.js` handles how.

---

## File: `report.js` (Reporting Service)

### What is This File?
This file **analyzes test results** and generates reports at the end of each test run:
- Timestamped HTML and JSON reports (never overwrites previous runs)
- Console summary with per-group and per-API breakdown tables
- Breakpoint analysis — detects error rate and latency thresholds

Think of it as the **report card generator** that runs once when the test finishes.

---

### Function: `generateTimestamp()`

Creates a unique timestamp string for report file naming.

**Format:** `YYYY-MM-DD_HH-MM-SS`

**Example:**
```
Input:  June 8, 2026 at 5:28:00 PM
Output: "2026-06-08_17-28-00"
```

**Used for:** Unique filenames so every run is preserved:
```
performance_test_report/summary_2026-06-08_17-28-00.html
performance_test_report/summary_2026-06-08_17-28-00.json
```

---

### Function: `generateSummaryReport(data)`

**Purpose:** Main report generator — called automatically by K6 via `handleSummary()` in `script.js` at the end of every test run.

**What it does:**

```javascript
export function generateSummaryReport(data) {
    const timestamp         = generateTimestamp();
    const metrics           = data.metrics;
    const breakpointAnalysis = analyzeBreakpoint(metrics);

    printConsoleSummary(metrics, breakpointAnalysis);

    return {
        [`performance_test_report/summary_${timestamp}.html`]: htmlReport(data),
        [`performance_test_report/summary_${timestamp}.json`]: JSON.stringify(data, null, 2),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}
```

**Output files per run:**
```
performance_test_report/
├── summary_2026-06-08_17-28-00.html  ← Interactive k6-reporter dashboard
└── summary_2026-06-08_17-28-00.json  ← Full raw metrics
```

Opening the HTML file in a browser gives a visual dashboard with charts and threshold pass/fail indicators.

---

### Function: `printConsoleSummary(metrics, breakpointAnalysis)`

Prints the formatted summary you see at the end of every test run.

**Your actual console output (last full run):**
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
   GROUP         │ REQUESTS │ SUCCESS │ FAILED │ AVG     │ p95
   ✅ SIGN_IN     │       81 │      81 │      0 │  474ms  │  853ms
   ✅ HOME        │        0 │       0 │      0 │  154ms  │  296ms
   ...

📋 PER-API BREAKDOWN:
   ✅ /api/v1/auth/login/         │  81 │  81 │  0
   ✅ /api/v1/dashboard           │  81 │  81 │  0
   ✅ /api/v1/inventory/          │ 158 │ 158 │  0
   ✅ /api/v1/inventory/513       │   2 │   2 │  0
   ...

⏱️ RESPONSE TIME PERCENTILES:
   p(50): 0.00ms
   p(90): 400.39ms
   p(95): 434.35ms
   p(99): 0.00ms
   Max: 887.94ms

🎯 BREAKPOINT ANALYSIS:
   ✅ Error rate acceptable: 0.00%
   ✅ Latency acceptable: p(95) = 434.35ms
   📈 Throughput: 3.06 requests/second
   📦 Data Received: 7.01 MB
```

---

### Function: `analyzeBreakpoint(metrics)`

Automatically detects performance stress levels and labels them.

**Error rate thresholds:**
```
< 5%  → ✅ Error rate acceptable: 0.00%
5-10% → ⚠️  ELEVATED ERROR RATE: 8.56% - Approaching limits
> 10% → ⚠️  HIGH ERROR RATE: 15.71% - System is under severe stress
```

**Latency thresholds (p95):**
```
< 3000ms → ✅ Latency acceptable: p(95) = 434ms
3-5s     → ⚠️  HIGH LATENCY: p(95) = 3500ms - Consider this the stress point
> 5s     → ⚠️  CRITICAL LATENCY: p(95) = 6000ms - System degraded
```

**Your test progression (3 runs before final fix):**
```
Run 1 (INV_ID=1):  ⚠️  ELEVATED ERROR RATE: 8.56%
Run 2 (INV_ID=81): ⚠️  HIGH ERROR RATE: 15.71%
Run 3 (dynamic):   ✅ Error rate acceptable: 0.00%  ← all fixed
```

---

## How Services Connect

```
test.js (orchestrator)
    │
    ├─→ auth.js: authenticate()
    │       ├─ POST /api/v1/auth/login/
    │       ├─ extractToken() → body.data.auth_token
    │       ├─ Records: signInDuration, dataReceived, dataSent
    │       ├─ Records: successfulRequests, errorRate, successRate
    │       └─ Returns: auth_token string
    │
    ├─→ auth.js: createAuthHeaders(token)
    │       └─ Returns: { auth_token, Content-Type }
    │
    ├─→ api.js: callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration)
    │       └─ Loops → callApi() × 4 endpoints
    │               ├─ Records: responseTimeTrend, ttfb, homeDuration, dataReceived
    │               ├─ check(): status 200, response < 5s
    │               └─ Records: successfulRequests, errorRate, endpointSuccessCount, apiSuccessCount
    │
    ├─→ api.js: callApiGroup(...inventory list GET only...)
    │       └─ callApi() × 1 endpoint
    │
    ├─→ api.js: callApi(createUrl, ..., 'POST', createPayload)
    │       └─ Returns createRes → test.js captures createRes.json().data.id
    │
    ├─→ api.js: callApi(updateUrl with newItemId, ..., 'PUT', updatePayload)
    ├─→ api.js: callApi(deleteUrl with newItemId, ..., 'DELETE')
    │
    ├─→ api.js: callApiGroup(...supplier_requests GET...)
    ├─→ api.js: callApiGroup(...supplier_orders GET...)
    │
    └─→ script.js: handleSummary(data) → report.js: generateSummaryReport(data)
            ├─ generateTimestamp()  → "2026-06-08_17-28-00"
            ├─ analyzeBreakpoint()  → "✅ Error rate acceptable: 0.00%"
            ├─ printConsoleSummary() → formatted console output
            └─ Returns: { HTML file, JSON file, stdout }
```

---

## Summary

| File | Responsibility | Key Functions |
|---|---|---|
| **auth.js** | Authentication | `authenticate()`, `extractToken()`, `createAuthHeaders()` |
| **api.js** | HTTP requests + metrics | `callApi()`, `callApiGroup()` |
| **report.js** | Analysis + reporting | `generateSummaryReport()`, `analyzeBreakpoint()`, `printConsoleSummary()`, `generateTimestamp()` |

### Capabilities at a Glance

| Capability | Implementation |
|---|---|
| Token extraction | Tries `data.auth_token`, `data.access_token`, `token`, `access_token` — logs actual keys if none match |
| HTTP methods | GET, POST, PUT, DELETE, PATCH via switch in `callApi()` |
| ID capture | `callApi()` returns response → `test.js` reads `createRes.json().data.id` |
| Per-endpoint metrics | `endpointTag` + `durationMetric` parameter route metrics to correct trend |
| Per-API breakdown | `apiPath` extracted from URL, used as tag in `apiSuccessCount`/`apiFailureCount` |
| Timestamped reports | `generateTimestamp()` → unique filename per run, no overwrites |
| Breakpoint detection | Error rate and p(95) latency classified into healthy/elevated/critical |
| Staging cleanup | Inventory DELETE at end of each iteration removes created items |

**Services are where authentication, requests, and analysis actually happen.** 🔧
