# K6 Load Testing — Supplier Connect

---

## 📁 Project Structure

```
k6 load testing in Supplier Connect/
│
├── script.js                    - Main entry point
│
├── src/
│   ├── config/
│   │   ├── options.js           - Test scenarios & thresholds
│   │   └── environment.js       - Staging URL, credentials, endpoints, payloads
│   │
│   ├── metrics/
│   │   └── custom.js            - Custom metric definitions (14 metrics)
│   │
│   ├── services/
│   │   ├── auth.js              - Authentication & token extraction
│   │   ├── api.js               - HTTP request execution & metric tracking
│   │   └── report.js            - Timestamped HTML/JSON report generation
│   │
│   └── modules/
│       └── test.js              - User journey orchestration
│
└── performance_test_report/
    └── summary_YYYY-MM-DD_HH-MM-SS.html   - Generated after each run
    └── summary_YYYY-MM-DD_HH-MM-SS.json
```

---

## 🚀 Running Tests

```powershell
# Run all 4 scenarios (~5m10s total)
k6 run script.js

# Run a single scenario
k6 run --env SCENARIO=load_test    script.js
k6 run --env SCENARIO=stress_test  script.js
k6 run --env SCENARIO=spike_test   script.js
k6 run --env SCENARIO=soak_test    script.js
```

**Note:** On Windows PowerShell, always use `--env` (not `-e`) to avoid conflicts with built-in cmdlets.

---

## 🎯 Test Scenarios

| Scenario | VU Range | Duration | Start Time | Purpose |
|---|---|---|---|---|
| **load_test** | 0 → 10 VUs | 75s | 0:00 | Realistic gradual traffic |
| **stress_test** | 0 → 7 VUs | 80s | 1m30s | Find performance limits |
| **spike_test** | 0 → 10 VUs | 30s | 3m10s | Handle sudden burst |
| **soak_test** | 5 constant VUs | 60s | 4m10s | Stability over time |

When a single scenario is selected via `--env SCENARIO=`, `startTime` is automatically removed so it starts immediately.

---

## 📊 What Gets Tested (Per Iteration)

Each virtual user runs this journey (~19s per iteration):

| Step | Endpoint(s) | Method | Purpose |
|---|---|---|---|
| Login | `/api/v1/auth/login/` | POST | Get auth token |
| Dashboard | 4 home endpoints | GET | Home & stats |
| Inventory | List + Create + Update + Delete | GET/POST/PUT/DELETE | Full CRUD cycle |
| Supplier Requests | List + Detail | GET | Read requests |
| Supplier Orders | List + Detail | GET | Read orders |

**Inventory CRUD:** Creates a real item → captures its ID from the response → updates it → deletes it. Staging stays clean.

---

## ✅ Latest Test Results (All 4 Scenarios)

```
load_test   ✓  stress_test ✓  spike_test ✓  soak_test ✓

Total requests:  1004   Failed: 0
Success rate:    100%   Error rate: 0.00%
p(95) latency:   434ms  Max: 888ms
Runtime:         5m28s
```

**Per-endpoint p(95):**
```
Sign In:           853ms   (threshold: 5000ms)
Home/Dashboard:    296ms
Inventory:         414ms
Supplier Requests: 270ms
Supplier Orders:   222ms
```

---

## 🔧 Configuration

### Staging Environment
- **Server:** `http://52.220.47.3`
- **Test User:** phone `01567839606`, pin `0000`

### Performance Thresholds
All requests must pass:
- `p(95) < 4000ms` overall
- `error_rate < 10%`
- `success_rate > 90%`
- `http_reqs > 3/s`
- Per-endpoint `p(95) < 5000ms`

### Switching Environments
Change one line in `environment.js`:
```javascript
export const BASE_URL = 'http://52.220.47.3';        // staging
// export const BASE_URL = 'https://api.supplierconnect.ifarmer.asia'; // production
```

---

## 💡 Architecture

### Key Principles
- **Single Responsibility** — each module does one thing (`auth.js` only authenticates, `api.js` only makes requests)
- **DRY** — all endpoints defined once in `environment.js`, all metrics defined once in `custom.js`
- **Separation of Concerns** — `test.js` orchestrates; services implement

### Module Responsibilities

| Module | Does One Thing |
|---|---|
| `options.js` | Defines scenarios and thresholds |
| `environment.js` | Stores all URLs, credentials, endpoints, payloads |
| `custom.js` | Defines all 14 custom metrics |
| `auth.js` | Logs in and returns auth token |
| `api.js` | Makes HTTP requests and records metrics |
| `report.js` | Generates timestamped reports |
| `test.js` | Orchestrates the full user journey |

---

## 🏗️ How to Extend

### Add a New Endpoint
```javascript
// 1. environment.js — add the endpoint
API_ENDPOINTS.supplier_reg = {
    registration: { path: '/api/v1/registrations/', method: 'POST' }
};
API_GROUPS.supplier_reg = [API_ENDPOINTS.supplier_reg.registration];

// 2. metrics/custom.js — add a duration trend
export const registrationDuration = new Trend('registration_duration', true);
ENDPOINT_METRICS['supplier_reg'] = registrationDuration;

// 3. modules/test.js — add a group
import { registrationDuration } from '../metrics/custom.js';
group('Supplier Registration', () => {
    callApi(
        `${BASE_URL}${API_ENDPOINTS.supplier_reg.registration.path}`,
        headers, 'supplier_reg', registrationDuration,
        'POST', JSON.stringify(REQUEST_PAYLOADS.registration)
    );
});
```

### Add a New Scenario
```javascript
// options.js — add to SCENARIO_DEFS
volume_test: {
    executor: 'constant-vus',
    vus: 20,
    duration: '5m',
    startTime: '6m',
    tags: { test_type: 'volume' },
}
// Run with: k6 run --env SCENARIO=volume_test script.js
```

---

## 📚 Documentation

| File | Contents |
|---|---|
| `src/config/README.md` | `options.js` + `environment.js` explained |
| `src/metrics/README.md` | All 14 metrics, types, actual values |
| `src/modules/README.md` | Per-iteration flow, CRUD cycle, timing |
| `src/services/README.md` | auth.js, api.js, report.js explained |
| `FLOW.md` | Complete execution flow start-to-finish |
| `performance_analysis_report.md` | Latest test run analysis |

---

## ⚠️ Known Limitations

- **Max tested VU count:** 10 concurrent users. Performance at 20+ VUs has not yet been validated.
- **Supplier registration** (`/api/v1/registrations/`) is defined in config but not yet exercised in `test.js` — needs a `registrationDuration` metric before adding.
- **Hardcoded detail IDs:** `/api/v3/supplier_requests/200` and `/api/v3/supplier_orders/103` are fixed IDs. If these records are deleted from staging, those detail calls will fail.
- **Inventory item name:** All iterations create an item named "Potato". Under high VU counts this is fine (each is immediately deleted), but could cause confusion in staging logs.

---

## 🎉 Summary

| Attribute | Value |
|---|---|
| Scenarios | 4 (load, stress, spike, soak) |
| Endpoints covered | 11 unique paths + dynamic inventory IDs |
| CRUD operations | Full create→update→delete per iteration |
| Latest result | 1004 requests, 0 failures, 100% success |
| Reports | Timestamped HTML + JSON per run |
| Architecture | SOLID + DRY, 7 focused modules |
