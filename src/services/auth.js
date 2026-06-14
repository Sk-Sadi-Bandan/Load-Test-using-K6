/**
 * Authentication Service Module
 *
 * Handles all authentication-related operations
 * Follows Single Responsibility Principle - only manages authentication
 *
 * @module services/auth
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, TEST_USER, API_ENDPOINTS } from '../config/environment.js';
import {
    signInDuration,
    dataReceived,
    dataSent,
    successfulRequests,
    failedRequests,
    errorRate,
    successRate,
    apiSuccessCount,
    apiFailureCount,
    endpointSuccessCount,
    endpointFailureCount,
} from '../metrics/custom.js';

/**
 * Extracts the access token from the login response body.
 *
 * Different API versions may nest the token differently. This function
 * tries the most common key patterns so the rest of the code stays clean.
 *
 * Checked in order:
 *   response.access_token
 *   response.token
 *   response.data.access_token
 *   response.data.token
 *
 * @param {Response} res - k6 HTTP response object
 * @returns {string|null} Token string, or null if not found
 */
function extractToken(res) {
    try {
        const body = res.json();

        if (body.access_token)              return body.access_token;
        if (body.token)                     return body.token;
        if (body.data && body.data.auth_token)   return body.data.auth_token;  // ← ETA ADD KORO
        if (body.data && body.data.access_token) return body.data.access_token;
        if (body.data && body.data.token)        return body.data.token;

        console.error(`No access token received. Response keys: ...`);
        return null;
    } catch (e) {
        console.error(`Failed to parse login response as JSON. Status: ${res.status} | Body: ${res.body}`);
        return null;
    }
}

/**
 * Authenticates user and returns access token.
 *
 * @function
 * @returns {string|null} Access token if successful, null otherwise
 */
export function authenticate() {
    const signInUrl     = `${BASE_URL}${API_ENDPOINTS.auth.signIn.path}`;
    const signInPayload = JSON.stringify({
        phone: TEST_USER.phone,
        pin:   TEST_USER.pin,
    });
    const signInHeaders = { 'Content-Type': 'application/json' };

    // Send login request
    const signInRes = http.post(signInUrl, signInPayload, {
        headers: signInHeaders,
        tags: {
            endpoint: 'sign_in',
            api: API_ENDPOINTS.auth.signIn.path,
        },
    });

    // Track metrics
    signInDuration.add(signInRes.timings.duration);
    dataReceived.add(signInRes.body ? signInRes.body.length : 0);
    dataSent.add(signInPayload.length);

    // Validate response
    const signInSuccess = check(signInRes, {
        'sign in status 200':        (r) => r.status === 200,
        'sign in response time < 5s': (r) => r.timings.duration < 5000,
    });

    check(signInRes, {
        [`API:${API_ENDPOINTS.auth.signIn.path}:success`]: (r) => r.status === 200,
    });

    if (!signInSuccess) {
        failedRequests.add(1);
        errorRate.add(1);
        successRate.add(0);
        apiFailureCount.add(1, { api: API_ENDPOINTS.auth.signIn.path, group: 'sign_in' });
        endpointFailureCount.add(1, { endpoint: 'sign_in', status: signInRes.status.toString() });
        console.error(`Sign-in failed: Status ${signInRes.status}, Time: ${signInRes.timings.duration}ms`);
        return null;
    }

    // Track success
    successfulRequests.add(1);
    errorRate.add(0);
    successRate.add(1);
    apiSuccessCount.add(1, { api: API_ENDPOINTS.auth.signIn.path, group: 'sign_in' });
    endpointSuccessCount.add(1, { endpoint: 'sign_in', status: '200' });

    // Extract token (handles multiple possible key names)
    return extractToken(signInRes);
}

/**
 * Creates authenticated request headers.
 *
 * @function
 * @param {string} accessToken - The authentication token
 * @returns {Object} Headers object with authentication token
 */
export function createAuthHeaders(accessToken) {
    return {
        'auth_token': accessToken,   // ← 'token' chilo, 'auth_token' koro
        'Content-Type': 'application/json',
    };
}
