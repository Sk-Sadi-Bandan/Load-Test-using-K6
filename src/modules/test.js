/**
 * Test Modules - Main Test Flow
 *
 * Orchestrates the main test execution
 * Follows Separation of Concerns by delegating to specialized modules
 *
 * @module modules/test
 */

import { group, sleep } from 'k6';
import { authenticate, createAuthHeaders } from '../services/auth.js';
import { callApi, callApiGroup } from '../services/api.js';
import { BASE_URL, API_GROUPS, API_ENDPOINTS, REQUEST_PAYLOADS } from '../config/environment.js';
import {
    activeVUs,
    homeDuration,
    inventoryDuration,
    supplierRequestsDuration,
    supplierOrdersDuration,
} from '../metrics/custom.js';

/**
 * Executes the main test scenario
 *
 * @function
 * @returns {void}
 *
 * Test flow:
 * 1. Track active virtual user
 * 2. Authenticate with credentials
 * 3. Test Home & Dashboard endpoints
 * 4. Test Inventory endpoints (list → create → capture ID → update → delete)
 * 5. Test Supplier Requests endpoints (read)
 * 6. Test Supplier Orders endpoints (read)
 * 7. Simulate user think time
 */
export function runMainTest() {
    activeVUs.add(__VU);

    const accessToken = authenticate();
    if (!accessToken) return;

    const headers = createAuthHeaders(accessToken);

    // ── Home & Dashboard ──────────────────────────────────────────────────────
    group('Home & Dashboard', () => {
        callApiGroup(BASE_URL, API_GROUPS.home, headers, 'home', homeDuration);
    });
    sleep(5);

    // ── Inventory ─────────────────────────────────────────────────────────────
    group('Inventory', () => {

        // 1. GET inventory list (only clean GET without path param)
        callApiGroup(
            BASE_URL,
            API_GROUPS.inventory.filter((e) => e.method === 'GET' && !e.path.includes('{')),
            headers,
            'inventory',
            inventoryDuration
        );

        // 2. POST create — callApi returns the k6 response object
        const createUrl     = `${BASE_URL}${API_ENDPOINTS.inventory.create_inventory_item.path}`;
        const createPayload = JSON.stringify(REQUEST_PAYLOADS.create_inventory_item);
        const createRes     = callApi(createUrl, headers, 'inventory', inventoryDuration, 'POST', createPayload);

        // 3. Capture the new item's ID from the create response
        //    API response shape: { data: { id: 123, ... } }  ← adjust key path if different
        let newItemId = null;
        try {
            const body = createRes.json();
            // Try common response shapes — update the key path to match your API
            newItemId =
                (body.data && body.data.id)   ? body.data.id   :   // { data: { id } }
                (body.id)                      ? body.id         :   // { id }
                (body.item && body.item.id)    ? body.item.id   :   // { item: { id } }
                null;

            if (!newItemId) {
                console.warn(
                    `Inventory create succeeded but ID not found. ` +
                    `Response keys: [${Object.keys(body).join(', ')}]. ` +
                    `Skipping update/delete for this iteration.`
                );
            }
        } catch (e) {
            console.error(`Failed to parse create inventory response: ${e}`);
        }

        // 4. PUT update + DELETE — only run if we have a valid ID
        if (newItemId) {
            // PUT update
            const updateUrl     = `${BASE_URL}${API_ENDPOINTS.inventory.update_inventory_item.path.replace('{inv_id}', newItemId)}`;
            const updatePayload = JSON.stringify(REQUEST_PAYLOADS.update_inventory_item);
            callApi(updateUrl, headers, 'inventory', inventoryDuration, 'PUT', updatePayload);

            // DELETE — removes the item created in this iteration (keeps staging clean)
            const deleteUrl = `${BASE_URL}${API_ENDPOINTS.inventory.delete_inventory_item.path.replace('{inv_id}', newItemId)}`;
            callApi(deleteUrl, headers, 'inventory', inventoryDuration, 'DELETE');
        }
    });
    sleep(5);

    // ── Supplier Requests ─────────────────────────────────────────────────────
    group('Supplier Requests', () => {
        callApiGroup(
            BASE_URL,
            API_GROUPS.supplier_requests.filter((e) => e.method !== 'POST'),
            headers,
            'supplier_requests',
            supplierRequestsDuration
        );
    });
    sleep(5);

    // ── Supplier Orders ───────────────────────────────────────────────────────
    group('Supplier Orders', () => {
        callApiGroup(
            BASE_URL,
            API_GROUPS.supplier_orders.filter((e) => e.method !== 'POST'),
            headers,
            'supplier_orders',
            supplierOrdersDuration
        );
    });

    // Simulate user think time (1-3 seconds)
    sleep(Math.random() * 2 + 1);
}
