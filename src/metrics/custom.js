/**
 * Custom Metrics Module
 * 
 * Initializes all custom k6 metrics for tracking performance data
 * Follows Single Responsibility Principle - handles only metric creation
 * 
 * @module metrics/custom
 */

import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

/**
 * Request success/failure counters
 * These counters use tags to track per-endpoint success/failure
 */
export const failedRequests = new Counter('failed_requests');
export const successfulRequests = new Counter('successful_requests');

/**
 * Per-endpoint success/failure counters
 * Track which specific APIs are succeeding or failing
 */
export const endpointSuccessCount = new Counter('endpoint_success_count');
export const endpointFailureCount = new Counter('endpoint_failure_count');

/**
 * Per-API path tracking
 * These counters track individual API paths for detailed breakdown
 */
export const apiSuccessCount = new Counter('api_success');
export const apiFailureCount = new Counter('api_failure');

/**
 * Success and error rate metrics
 */
export const errorRate = new Rate('error_rate');
export const successRate = new Rate('success_rate');

/**
 * Response time trend metrics
 */
export const responseTimeTrend = new Trend('response_time_ms');
export const ttfb = new Trend('time_to_first_byte');

/**
 * Per-endpoint duration metrics
 * These allow analyzing performance of specific endpoints
 */
export const signInDuration = new Trend('sign_in_duration', true);
export const homeDuration = new Trend('home_duration', true);
export const inventoryDuration = new Trend('inventory_duration', true);
export const supplierRequestsDuration = new Trend('supplier_requests_duration', true);
export const supplierOrdersDuration = new Trend('supplier_orders_duration', true);

/**
 * Active virtual users gauge
 * Tracks concurrent user count
 */
export const activeVUs = new Gauge('active_vus');

/**
 * Data transfer metrics
 */
export const dataReceived = new Counter('data_received_bytes');
export const dataSent = new Counter('data_sent_bytes');

/**
 * Metric mapping for dynamic metric tracking
 * Maps endpoint names to their corresponding trend metrics
 * Follows DRY principle by centralizing metric references
 */
export const ENDPOINT_METRICS = {
    sign_in: signInDuration,
    home: homeDuration,
    inventory: inventoryDuration,
    supplier_requests: supplierRequestsDuration,
    supplier_orders: supplierOrdersDuration,
};
