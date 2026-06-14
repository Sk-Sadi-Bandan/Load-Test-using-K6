/**
 * API Service Module
 * 
 * Handles all API request operations
 * Follows Single Responsibility Principle - only manages API interactions
 * Follows DRY principle by centralizing request logic
 * 
 * @module services/api
 */

import http from 'k6/http';
import { check } from 'k6';
import {
    responseTimeTrend,
    ttfb,
    dataReceived,
    successfulRequests,
    failedRequests,
    errorRate,
    successRate,
    endpointSuccessCount,
    endpointFailureCount,
    apiSuccessCount,
    apiFailureCount,
    ENDPOINT_METRICS
} from '../metrics/custom.js';
import { BASE_URL } from '../config/environment.js';

// Pattern to remove base URL from full URL for clean API path tracking
const BASE_URL_PATTERN = new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);


/**
 * Makes an API request with automatic metric tracking
 * Supports GET, POST, PUT, DELETE and other HTTP methods
 * 
 * This function encapsulates all API call logic including:
 * - Request execution (supports all HTTP methods)
 * - Validation
 * - Metric tracking
 * - Error logging
 * 
 * Follows DRY by centralizing API call logic
 * Follows Open/Closed Principle by accepting endpoint and metric parameters
 * 
 * @function
 * @param {string} url - Full API endpoint URL
 * @param {Object} headers - Request headers including authentication
 * @param {string} endpointTag - Endpoint identifier for metric tagging
 * @param {Object} durationMetric - Trend metric for endpoint-specific duration tracking
 * @param {string} [method='GET'] - HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
 * @param {Object|string|null} [body=null] - Request body for POST/PUT/PATCH requests
 * 
 * @returns {Object} Response object from k6 http request
 * 
 * @example
 * const response = callApi(
 *   'https://api.example.com/endpoint',
 *   { token: 'abc123', 'Content-Type': 'application/json' },
 *   'auth',
 *   authDuration,
 *   'POST',
 *   JSON.stringify({ phone: '+1234567890', pin: '123456' })
 * );
 */
export function callApi(url, headers, endpointTag, durationMetric, method = 'GET', body = null) {
    // Extract clean API path for tracking (remove base URL and query params)
    const apiPath = url.replace(BASE_URL_PATTERN, '').split('?')[0];
    
    // Execute HTTP request based on method
    let res;
    const requestOptions = { 
        headers,
        tags: { 
            endpoint: endpointTag,
            api: apiPath  // Per-API tagging
        }
    };

    switch(method.toUpperCase()) {
        case 'POST':
            res = http.post(url, body, requestOptions);
            break;
        case 'PUT':
            res = http.put(url, body, requestOptions);
            break;
        case 'DELETE':
            res = http.del(url, requestOptions);
            break;
        case 'PATCH':
            res = http.patch(url, body, requestOptions);
            break;
        case 'GET':
        default:
            res = http.get(url, requestOptions);
            break;
    }

    // Track response metrics
    responseTimeTrend.add(res.timings.duration);
    ttfb.add(res.timings.waiting);
    durationMetric.add(res.timings.duration);
    dataReceived.add(res.body ? res.body.length : 0);

    // Validate response
    const success = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 5s': (r) => r.timings.duration < 5000,
    });
    
    // Track per-API success using dynamic check name
    check(res, {
        [`API:${apiPath}:success`]: (r) => r.status === 200,
    });
    
    // Handle response failure
    if (!success) {
        failedRequests.add(1);
        errorRate.add(1);
        successRate.add(0);
        endpointFailureCount.add(1, { endpoint: endpointTag, status: res.status.toString(), url: url });
        apiFailureCount.add(1, { api: apiPath, group: endpointTag });
        // console.error(`API failed: ${url} | Status: ${res.status} | Time: ${res.timings.duration}ms | Method: ${method}`);
        // console.error(`Response body: ${res.body}`);
    } else {
        // Track successful response
        successfulRequests.add(1);
        errorRate.add(0);
        successRate.add(1);
        endpointSuccessCount.add(1, { endpoint: endpointTag, status: res.status.toString(), url: url });
        apiSuccessCount.add(1, { api: apiPath, group: endpointTag });
    }

    // Log slow requests for performance analysis
    // if (res.timings.duration > 3000) {
    //     console.warn(`SLOW REQUEST: ${url} | ${res.timings.duration}ms | Status: ${res.status} | Method: ${method}`);
    // }

    return res;
}

/**
 * Makes multiple API calls for a group of endpoints
 * 
 * Abstracts the pattern of calling multiple endpoints in sequence
 * Automatically extracts method and path from endpoint objects
 * Follows DRY by centralizing loop logic
 * 
 * @function
 * @param {string} baseUrl - Base URL for API
 * @param {Array<Object>} endpoints - Array of endpoint objects with {path, method} properties
 * @param {Object} headers - Request headers
 * @param {string} groupTag - Tag for metric grouping
 * @param {Object} metricReference - Metric object for tracking duration
 * @param {string} [requestBody=null] - Body data for POST/PUT/PATCH requests
 * 
 * @example
 * callApiGroup(
 *   'https://api.example.com',
 *   [API_ENDPOINTS.homeRetailer.retailerDetails, API_ENDPOINTS.homeRetailer.homepage],
 *   headers,
 *   'home',
 *   homeDuration
 * );
 */
export function callApiGroup(baseUrl, endpoints, headers, groupTag, metricReference, requestBody = null) {
    endpoints.forEach(endpoint => {
        const fullUrl = `${baseUrl}${endpoint.path}`;
        const method = endpoint.method || 'GET';
        callApi(fullUrl, headers, groupTag, metricReference, method, requestBody);
    });
}
