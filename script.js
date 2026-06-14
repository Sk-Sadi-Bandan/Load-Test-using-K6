/**
 * K6 Load Testing Script - Main Entry Point
 *
 * Main test orchestrator — imports and runs all modular components.
 * Architecture follows SOLID and DRY principles.
 *
 * Module structure:
 *   config/     — configuration management
 *   metrics/    — custom metrics
 *   services/   — business logic
 *   modules/    — test flow orchestration
 *   script.js   — main entry point  ← you are here
 *
 * @module script
 */

import { options }               from './src/config/options.js';
import { runMainTest }           from './src/modules/test.js';
import { generateSummaryReport } from './src/services/report.js';

export { options };

/**
 * Default export — k6 calls this for every virtual user iteration.
 */
export default function () {
    runMainTest();
}

/**
 * Called by k6 once at the end of the test run.
 * Generates HTML / JSON / stdout reports.
 *
 * @param {Object} data - Complete test metrics from k6
 */
export function handleSummary(data) {
    return generateSummaryReport(data);
}
