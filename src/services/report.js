/**
 * Reporting Module
 * 
 * Handles test result summary and analysis
 * Follows Single Responsibility Principle - only manages reporting
 * Provides detailed performance insights and breakpoint analysis
 * Maintains historical reports with timestamps for audit trail
 * 
 * @module services/report
 */

import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

/**
 * Generates a timestamp string for report file naming
 * Format: YYYY-MM-DD_HH-MM-SS
 * 
 * @function
 * @returns {string} Formatted timestamp
 * 
 * @private
 */
function generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${date}_${hours}-${minutes}-${seconds}`;
}

/**
 * Generates comprehensive test summary report with timestamp-based history
 * 
 * This function creates multiple report formats (HTML, JSON, stdout)
 * and provides detailed performance analysis and breakpoint detection
 * Reports are saved with timestamps to maintain full history
 * 
 * @function
 * @param {Object} data - Complete test data from k6
 * @returns {Object} Report object with multiple formats
 * 
 * @example
 * export function handleSummary(data) {
 *   return generateSummaryReport(data);
 * }
 */
export function generateSummaryReport(data) {
    // Generate timestamp for unique report naming
    const timestamp = generateTimestamp();
    
    // Extract metrics from test data
    const metrics = data.metrics;
    
    // Analyze system breakpoint indicators
    const breakpointAnalysis = analyzeBreakpoint(metrics);
    
    // Print console summary
    printConsoleSummary(metrics, breakpointAnalysis, data);

    // Return multiple report formats with timestamp-based paths
    return {
        [`performance_test_report/summary_${timestamp}.html`]: htmlReport(data),
        [`performance_test_report/summary_${timestamp}.json`]: JSON.stringify(data, null, 2),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}

/**
 * Prints formatted summary to console
 * 
 * Displays key metrics in a readable format for quick analysis
 * 
 * @function
 * @param {Object} metrics - k6 metrics object
 * @param {string} breakpointAnalysis - Breakpoint analysis text
 * @param {Object} data - Full k6 data object for endpoint breakdown
 * 
 * @private
 */
function printConsoleSummary(metrics, breakpointAnalysis, data) {
    console.log('\n========================================');
    console.log('PERFORMANCE TEST SUMMARY');
    console.log('========================================\n');
    
    console.log('📊 OVERALL METRICS:');
    
    // Safely access metrics with fallbacks
    const totalRequests = metrics.http_reqs?.values?.count || 0;
    const requestRate = metrics.http_reqs?.values?.rate ?? 0;
    const failedRequests = metrics.http_req_failed?.values?.passes ?? 0;
    const errorRate = metrics.error_rate?.values?.rate ?? 0;
    const successRate = metrics.success_rate?.values?.rate ?? 100;
    
    // Get per-endpoint success/failure counts
    const endpointSuccess = metrics.endpoint_success_count?.values?.count ?? 0;
    const endpointFailure = metrics.endpoint_failure_count?.values?.count ?? 0;
    
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Request Rate: ${requestRate.toFixed(2)} req/s`);
    console.log(`   Failed Requests: ${failedRequests}`);
    console.log(`   ✅ Successful API Calls (200): ${endpointSuccess}`);
    console.log(`   ❌ Failed API Calls (non-200): ${endpointFailure}`);
    console.log(`   Error Rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`   Success Rate: ${(successRate * 100).toFixed(2)}%\n`);
    
    // Print per-endpoint breakdown with group data
    printEndpointBreakdown(metrics, data);
    
    console.log('⏱️  RESPONSE TIME PERCENTILES:');
    const p50 = metrics.http_req_duration?.values?.['p(50)'] ?? 0;
    const p90 = metrics.http_req_duration?.values?.['p(90)'] ?? 0;
    const p95 = metrics.http_req_duration?.values?.['p(95)'] ?? 0;
    const p99 = metrics.http_req_duration?.values?.['p(99)'] ?? 0;
    const maxDuration = metrics.http_req_duration?.values?.max ?? 0;
    
    console.log(`   p(50): ${p50.toFixed(2)}ms`);
    console.log(`   p(90): ${p90.toFixed(2)}ms`);
    console.log(`   p(95): ${p95.toFixed(2)}ms`);
    console.log(`   p(99): ${p99.toFixed(2)}ms`);
    console.log(`   Max: ${maxDuration.toFixed(2)}ms\n`);
    
    console.log('🎯 BREAKPOINT ANALYSIS:');
    console.log(breakpointAnalysis);
    console.log('\n========================================\n');
}

/**
 * Prints per-endpoint success/failure breakdown
 * Shows which specific API endpoints succeeded or failed
 * 
 * @function
 * @param {Object} metrics - k6 metrics object
 * @private
 */
function printEndpointBreakdown(metrics, data) {
    console.log('🔍 PER-GROUP BREAKDOWN:');
    console.log('   ─────────────────────────────────────────────────────────────────────────');
    console.log('   GROUP         │ REQUESTS │ SUCCESS │ FAILED │ AVG     │ p95');
    console.log('   ─────────────────────────────────────────────────────────────────────────');
    
    // Extract group check data from k6's root_group
    const groupChecks = {};
    if (data.root_group && data.root_group.groups) {
        Object.values(data.root_group.groups).forEach(group => {
            if (group.checks) {
                let totalPasses = 0;
                let totalFails = 0;
                Object.values(group.checks).forEach(check => {
                    // Use 'status is 200' check to count requests
                    if (check.name === 'status is 200') {
                        totalPasses = check.passes || 0;
                        totalFails = check.fails || 0;
                    }
                });
                groupChecks[group.name] = { passes: totalPasses, fails: totalFails };
            }
        });
    }
    
    // Map of display names to group names and metric keys
    const endpointConfig = [
        { display: 'SIGN_IN', metric: 'sign_in_duration', group: null },
        { display: 'HOME', metric: 'home_duration', group: 'Home & Retailer' },
        { display: 'COMMUNITY', metric: 'community_duration', group: 'Community' },
        { display: 'ORDERS', metric: 'orders_duration', group: 'Orders' },
        { display: 'CART', metric: 'cart_duration', group: 'Cart' }
    ];
    
    // Get sign-in count from root_group checks
    let signInPasses = 0;
    let signInFails = 0;
    if (data.root_group && data.root_group.checks) {
        Object.values(data.root_group.checks).forEach(check => {
            if (check.name === 'sign in status 200') {
                signInPasses = check.passes || 0;
                signInFails = check.fails || 0;
            }
        });
    }
    
    endpointConfig.forEach(({ display, metric, group }) => {
        const durationMetric = metrics[metric];
        const avg = durationMetric?.values?.avg || 0;
        const p95 = durationMetric?.values?.['p(95)'] || 0;
        
        let passes, fails;
        if (display === 'SIGN_IN') {
            passes = signInPasses;
            fails = signInFails;
        } else {
            passes = groupChecks[group]?.passes || 0;
            fails = groupChecks[group]?.fails || 0;
        }
        
        const total = passes + fails;
        const status = fails > 0 ? '❌' : '✅';
        
        const endpointName = display.padEnd(12);
        const reqStr = String(total).padStart(8);
        const successStr = String(passes).padStart(7);
        const failedStr = String(fails).padStart(6);
        const avgStr = `${avg.toFixed(0)}ms`.padStart(7);
        const p95Str = `${p95.toFixed(0)}ms`;
        
        console.log(`   ${status} ${endpointName}│ ${reqStr} │ ${successStr} │ ${failedStr} │ ${avgStr} │ ${p95Str}`);
    });
    
    // Get total success/failure from custom counters
    const totalSuccess = metrics.endpoint_success_count?.values?.count || 0;
    const totalFailure = metrics.endpoint_failure_count?.values?.count || 0;
    
    console.log('   ─────────────────────────────────────────────────────────────────────────');
    console.log(`   TOTAL: ${totalSuccess + totalFailure} requests (${totalSuccess} success, ${totalFailure} failed)\\n`);
    
    // Print per-API breakdown
    printPerApiBreakdown(metrics, data);
}

/**
 * Prints detailed per-API path breakdown
 * Shows individual API endpoint statistics
 * 
 * @function
 * @param {Object} metrics - k6 metrics object
 * @private
 */
function printPerApiBreakdown(metrics, data) {
    console.log('📋 PER-API BREAKDOWN:');
    console.log('   ──────────────────────────────────────────────────────────────────────────────────────');
    console.log('   API PATH                                              │ REQUESTS │ SUCCESS │ FAILED');
    console.log('   ──────────────────────────────────────────────────────────────────────────────────────');
    
    // Extract per-API stats from checks in root_group
    const apiStats = {};
    
    // Helper function to recursively find checks
    function extractApiChecks(group) {
        if (group.checks) {
            Object.values(group.checks).forEach(check => {
                // Match check names like "API:/api/v1/retailers/sign_in:success"
                const match = check.name?.match(/^API:(.+):success$/);
                if (match) {
                    const apiPath = match[1];
                    if (!apiStats[apiPath]) {
                        apiStats[apiPath] = { success: 0, failed: 0 };
                    }
                    apiStats[apiPath].success += check.passes || 0;
                    apiStats[apiPath].failed += check.fails || 0;
                }
            });
        }
        // Recurse into nested groups
        if (group.groups) {
            Object.values(group.groups).forEach(subGroup => extractApiChecks(subGroup));
        }
    }
    
    // Extract from root_group
    if (data && data.root_group) {
        extractApiChecks(data.root_group);
    }
    
    // Sort APIs by path and display
    const sortedApis = Object.keys(apiStats).sort();
    
    if (sortedApis.length === 0) {
        console.log('   No per-API data available');
    } else {
        sortedApis.forEach(apiPath => {
            const stats = apiStats[apiPath];
            const total = stats.success + stats.failed;
            const status = stats.failed > 0 ? '❌' : '✅';
            
            // Truncate long paths
            const displayPath = apiPath.length > 50 ? '...' + apiPath.slice(-47) : apiPath.padEnd(50);
            const reqStr = String(total).padStart(8);
            const successStr = String(stats.success).padStart(7);
            const failedStr = String(stats.failed).padStart(6);
            
            console.log(`   ${status} ${displayPath} │ ${reqStr} │ ${successStr} │ ${failedStr}`);
        });
    }
    
    console.log('   ──────────────────────────────────────────────────────────────────────────────────────\\n');
}

/**
 * Analyzes metrics to detect system breaking points
 * 
 * Evaluates error rates and response times to determine:
 * - System health status
 * - Performance degradation points
 * - Throughput capacity
 * 
 * This follows DRY and SRP by centralizing analysis logic
 * 
 * @function
 * @param {Object} metrics - k6 metrics object
 * @returns {string} Formatted analysis text
 * 
 * @private
 */
function analyzeBreakpoint(metrics) {
    let analysis = '';
    
    // Safely extract error rate
    const errorRate = (metrics.error_rate?.values?.rate ?? 0) * 100;
    if (errorRate > 10) {
        analysis += `   ⚠️  HIGH ERROR RATE: ${errorRate.toFixed(2)}% - System is under severe stress\n`;
    } else if (errorRate > 5) {
        analysis += `   ⚠️  ELEVATED ERROR RATE: ${errorRate.toFixed(2)}% - Approaching limits\n`;
    } else {
        analysis += `   ✅ Error rate acceptable: ${errorRate.toFixed(2)}%\n`;
    }
    
    // Safely extract response time metrics
    const p95 = metrics.http_req_duration?.values?.['p(95)'] ?? 0;
    const p99 = metrics.http_req_duration?.values?.['p(99)'] ?? 0;
    
    if (p95 > 5000) {
        analysis += `   ⚠️  CRITICAL LATENCY: p(95) = ${p95.toFixed(2)}ms - Performance degraded\n`;
    } else if (p95 > 3000) {
        analysis += `   ⚠️  HIGH LATENCY: p(95) = ${p95.toFixed(2)}ms - Consider this the stress point\n`;
    } else {
        analysis += `   ✅ Latency acceptable: p(95) = ${p95.toFixed(2)}ms\n`;
    }
    
    // Display throughput metrics
    const reqRate = metrics.http_reqs?.values?.rate ?? 0;
    analysis += `   📈 Throughput: ${reqRate.toFixed(2)} requests/second\n`;
    
    // Display data transfer metrics
    const dataReceivedMB = (metrics.data_received?.values?.count || 0) / (1024 * 1024);
    analysis += `   📦 Data Received: ${dataReceivedMB.toFixed(2)} MB\n`;
    
    return analysis;
}
