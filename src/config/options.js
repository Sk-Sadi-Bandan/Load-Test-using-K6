/**
 * Test Configuration Module
 *
 * This module defines all test scenarios and performance thresholds.
 * Supports running a single scenario via: k6 run -e SCENARIO=load_test main.js
 * Without -e SCENARIO, all four scenarios run in staggered order.
 *
 * @module config/options
 */

/**
 * All scenario definitions
 * Kept separate so individual scenarios can be selected at runtime.
 * @type {Object}
 */
const SCENARIO_DEFS = {
    /**
     * Load Test
     * Ramps up to 10 concurrent users across multiple stages.
     */
    load_test: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '5s',  target: 2  },  // Ramp to 2 VUs
            { duration: '15s', target: 5  },  // Ramp to 5 VUs
            { duration: '30s', target: 10 },  // Ramp to 10 VUs
            { duration: '20s', target: 10 },  // Hold 10 VUs for 20s
            { duration: '5s',  target: 0  },  // Ramp down
        ],
        gracefulRampDown: '10s',
        tags: { test_type: 'load' },
        // Total duration: ~85s (75s stages + 10s gracefulRampDown)
    },

    /**
     * Stress Test
     * Progressive ramp to find the breaking point.
     */
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
        // Starts at 90s (after load test ends at ~85s)
        // Total duration: ~90s (80s stages + 10s gracefulRampDown)
        tags: { test_type: 'stress' },
    },

    /**
     * Spike Test
     * Sudden surge to simulate a burst of traffic.
     */
    spike_test: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '5s',  target: 2  },
            { duration: '20s', target: 10 },
            { duration: '5s',  target: 0  },
        ],
        gracefulRampDown: '5s',
        startTime: '3m10s',
        // Starts at 190s (after stress test ends at ~180s)
        // Total duration: ~35s (30s stages + 5s gracefulRampDown)
        tags: { test_type: 'spike' },
    },

    /**
     * Soak Test
     * Constant load for an extended period to catch memory leaks / degradation.
     */
    soak_test: {
        executor: 'constant-vus',
        vus: 5,
        duration: '1m',
        startTime: '4m10s',
        // Starts at 250s (after spike test ends at ~225s)
        // Total duration: 60s
        tags: { test_type: 'soak' },
    },
};

/**
 * Runtime scenario selection via environment variable.
 *
 * Usage:
 *   k6 run script.js                            → run all 4 scenarios (staggered)
 *   k6 run -e SCENARIO=load_test script.js      → run only load test
 *   k6 run -e SCENARIO=stress_test script.js    → run only stress test
 *   k6 run -e SCENARIO=spike_test script.js     → run only spike test
 *   k6 run -e SCENARIO=soak_test script.js      → run only soak test
 */
const selected = __ENV.SCENARIO;

let activeScenarios;
if (selected) {
    const def = SCENARIO_DEFS[selected];
    if (!def) {
        throw new Error(
            `Unknown scenario: "${selected}". Valid options: ${Object.keys(SCENARIO_DEFS).join(', ')}`
        );
    }
    // Strip startTime so the selected scenario starts immediately when run alone
    const isolated = { ...def };
    delete isolated.startTime;
    activeScenarios = { [selected]: isolated };
} else {
    activeScenarios = SCENARIO_DEFS;
}

/**
 * Exported k6 options
 * @type {Object}
 */
export const options = {
    scenarios: activeScenarios,

    /**
     * Performance thresholds — test fails if any threshold is breached.
     */
    thresholds: {
        // Overall HTTP response time thresholds
        'http_req_duration': [
            'p(50)<1000',  // 50% of requests under 1s
            'p(90)<3000',  // 90% of requests under 3s
            'p(95)<4000',  // 95% of requests under 4s
            'p(99)<5000',  // 99% of requests under 5s
        ],
        'http_req_failed': ['rate<0.10'],   // Less than 10% errors
        'http_reqs':       ['rate>3'],      // At least 3 requests/sec

        // Custom metric thresholds
        'failed_requests': ['count<500'],
        'error_rate':      ['rate<0.10'],
        'success_rate':    ['rate>0.90'],

        // Per-endpoint thresholds (tags set in services/api.js)
        'http_req_duration{endpoint:sign_in}':          ['p(95)<5000'],
        'http_req_duration{endpoint:home}':             ['p(95)<5000'],
        'http_req_duration{endpoint:inventory}':        ['p(95)<5000'],
        'http_req_duration{endpoint:supplier_requests}':['p(95)<5000'],
        'http_req_duration{endpoint:supplier_orders}':  ['p(95)<5000'],
    },
};
