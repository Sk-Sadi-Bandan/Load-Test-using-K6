# Documentation Summary

## Overview
Complete documentation for the Supplier Connect K6 load testing project. All modules include detailed explanations with real-world examples and actual test data from your runs.

---

## 📚 Documentation Files

### Module Documentation

#### `src/config/README.md` — Configuration Module
**Covers:**
- **options.js** — 4 test scenarios (load, stress, spike, soak), runtime scenario selection via `--env SCENARIO=`, performance thresholds with rationale
- **environment.js** — Staging server `http://52.220.47.3`, test user credentials, all supplier connect endpoints, API groups

**When to read:** To understand how the test is configured, how to run individual scenarios, and what the thresholds mean.

---

#### `src/metrics/README.md` — Metrics Module
**Covers:**
- **custom.js** — All 14 custom metrics (Counter, Trend, Rate, Gauge types), per-endpoint duration trends (sign_in, home, inventory, supplier_requests, supplier_orders), `ENDPOINT_METRICS` lookup map, actual values from your test runs

**When to read:** To understand what data is collected during each test and how to interpret the numbers in the summary output.

---

#### `src/modules/README.md` — Modules
**Covers:**
- **test.js** — 8-step user journey, dynamic inventory CRUD (create → capture ID → update → delete), GET filtering logic, iteration timeline with actual timing (~19s per iteration), requests-per-iteration breakdown (13 requests)

**When to read:** To understand what each virtual user does during a test iteration and how the 4 feature groups connect.

---

#### `src/services/README.md` — Services Module
**Covers:**
- **auth.js** — Login flow, `extractToken()` with multi-key fallback (`data.auth_token`), `createAuthHeaders()`, actual 474ms avg sign-in time
- **api.js** — `callApi()` with all HTTP methods + return value usage for ID capture, `callApiGroup()` batch execution, metric tagging
- **report.js** — Timestamped HTML/JSON reports, `analyzeBreakpoint()` with error/latency thresholds, actual console output from your last run

**When to read:** To understand how HTTP requests are made and validated, how the auth token flows, and how reports are generated.

---

## 📊 What's Documented

| Module | File | Key Content |
|---|---|---|
| Config | `options.js` | 4 scenarios, `--env SCENARIO=` usage, thresholds |
| Config | `environment.js` | Staging URL, credentials, endpoints, groups |
| Metrics | `custom.js` | 14 metrics, 5 duration trends, ENDPOINT_METRICS map |
| Modules | `test.js` | 8-step journey, CRUD cycle, iteration timeline |
| Services | `auth.js` | Login, token extraction, header creation |
| Services | `api.js` | HTTP methods, ID capture, batch calls |
| Services | `report.js` | Timestamped reports, breakpoint analysis |

---

## 🎯 How to Use This Documentation

### I want to understand...

**How to run a specific scenario:**
→ `src/config/README.md` — options.js section — `--env SCENARIO=` commands

**Why authentication was failing and how it was fixed:**
→ `src/services/README.md` — auth.js section — `extractToken()` explanation and `data.auth_token` key

**How inventory CRUD works without hardcoding IDs:**
→ `src/modules/README.md` — Step 5 Inventory section — ID capture from create response

**What the thresholds mean and why `rate>3` was chosen:**
→ `src/config/README.md` — Thresholds section — includes rationale based on actual test throughput

**What the per-group metrics in the summary table represent:**
→ `src/metrics/README.md` — Per-Endpoint Duration Metrics section

**How to interpret p(95) and other percentiles:**
→ `src/metrics/README.md` — Understanding Percentiles section — uses your actual sign_in_duration values

**Why `⚠️ ELEVATED ERROR RATE` appeared in earlier runs:**
→ `src/services/README.md` — report.js section — breakpoint analysis progression across 3 runs

**How all files connect and data flows:**
→ `src/modules/README.md` — Connection diagram

---

## 📁 Project File Structure

```
k6 load testing in Supplier Connect/
│
├── script.js                    ← Main entry point
│
└── src/
    ├── config/
    │   ├── README.md            ← Config documentation
    │   ├── options.js           ← Scenarios + thresholds
    │   └── environment.js       ← URLs, endpoints, payloads
    │
    ├── metrics/
    │   ├── README.md            ← Metrics documentation
    │   └── custom.js            ← Metric definitions
    │
    ├── modules/
    │   ├── README.md            ← Test flow documentation
    │   └── test.js              ← User journey orchestration
    │
    └── services/
        ├── README.md            ← Services documentation
        ├── auth.js              ← Authentication
        ├── api.js               ← HTTP requests
        └── report.js            ← Result reporting
```

---

## 🚀 Quick Command Reference

```powershell
# Run all 4 scenarios (~5m10s total)
k6 run script.js

# Run individual scenarios
k6 run --env SCENARIO=load_test    script.js   # ~1m25s
k6 run --env SCENARIO=stress_test  script.js   # ~1m30s
k6 run --env SCENARIO=spike_test   script.js   # ~45s
k6 run --env SCENARIO=soak_test    script.js   # ~1m30s
```

Reports saved to: `performance_test_report/summary_YYYY-MM-DD_HH-MM-SS.html`

---

## ✅ Key Concepts

### Metric Types
| Type | Tracks | Supplier Connect Example |
|---|---|---|
| **Counter** | Running total | `failedRequests = 0` |
| **Trend** | Distribution + percentiles | `inventoryDuration p(95) = 414ms` |
| **Rate** | Percentage | `successRate = 100.00%` |
| **Gauge** | Current snapshot | `activeVUs = 10` at peak |

### Percentiles
```
p(50) = median — half of requests faster than this
p(90) = 9 out of 10 requests faster than this
p(95) = 95% of requests faster than this  ← main threshold
p(99) = even slowest 1% faster than this
```

### Test Scenarios
| Scenario | Purpose | Max VUs | Duration |
|---|---|---|---|
| Load | Realistic gradual traffic | 10 | 75s |
| Stress | Find performance limits | 7 | 80s |
| Spike | Handle sudden burst | 10 | 30s |
| Soak | Stability over time | 5 | 60s |

### SOLID + DRY in This Project
| Principle | Where Applied |
|---|---|
| **SRP** — Single Responsibility | `custom.js` only defines metrics; `api.js` only makes requests |
| **DRY** — Don't Repeat Yourself | `ENDPOINT_METRICS` map; `callApiGroup()` eliminates per-endpoint loops |
| **Separation of Concerns** | `test.js` orchestrates; `auth.js`, `api.js` implement |
| **Single Source of Truth** | All URLs/endpoints in `environment.js`; change `BASE_URL` once |

---

## 📈 Your Test Results at a Glance

**Last full run (all 4 scenarios):**

```
✅ 4/4 scenarios passed
Total requests:  1004
Success rate:    100.00%
Error rate:      0.00%
p(95) latency:   434ms
Max response:    888ms
Data received:   7.3 MB
Runtime:         5m28s
```

**Per-endpoint performance:**
```
Sign In:           avg 474ms  p(95) 853ms
Home/Dashboard:    avg 154ms  p(95) 296ms
Inventory (CRUD):  avg 188ms  p(95) 414ms
Supplier Requests: avg 140ms  p(95) 270ms
Supplier Orders:   avg 143ms  p(95) 222ms
```

**Inventory dynamic IDs tested:** 445→591 across all runs (create → update → delete per iteration)

---

## 📖 Reading Order by Goal

### New to K6
1. `src/config/README.md` — understand scenarios and thresholds
2. `src/modules/README.md` — understand what each VU does
3. `src/services/README.md` — understand how requests and auth work
4. `src/metrics/README.md` — understand the numbers in test output

### Debugging a Test Issue
1. `src/services/README.md` auth.js section — token extraction
2. `src/modules/README.md` — filter logic and ID capture
3. `src/config/README.md` — threshold configuration

### Adding New Endpoints
1. `src/config/README.md` — add to `API_ENDPOINTS` and `API_GROUPS`
2. `src/metrics/README.md` — add a new duration trend if needed
3. `src/modules/README.md` — add group call in `test.js`
