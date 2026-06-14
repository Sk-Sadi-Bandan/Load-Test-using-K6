 /**
 * Environment Configuration Module
 * 
 * Centralized management of environment-specific configurations
 * Follows DRY principle by having single source of truth for URLs and endpoints
 * 
 * @module config/environment
 */

/**
 * Base API URL for all requests
 * DEMO: Using staging environment for testing
 * @constant {string}
 */
export const BASE_URL = 'http://52.220.47.3';

/**
 * Test user credentials for authentication
 * @constant {Object}
 */
export const TEST_USER = {
    phone: '01567839606',
    pin: '0000',
};

/**
 * POST request payloads for various endpoints
 * @constant {Object}
 */
export const REQUEST_PAYLOADS = {
    scratchIncentive: {
        // POST /api/v1/incentives/scratch
    },
    registration: {
        name: "Sadi supplier 606 (Load test)",
        phone: "01567839606",
        address: "nokhailam",
        sourcing_area_id: 10,
        pin: "0000",
        bkash_number: "01749653931",
        profile_image_url: "https://ifarmer-spply-chain.s3.ap-southeast-1.amazonaws.com/staging/profile_images/105-fahhh.png",
        nid_front_url: "https://ifarmer-spply-chain.s3.ap-southeast-1.amazonaws.com/staging/users/nidfront/105-1780378390-1ec79596-front-54937_nid_front.jpg",
        nid_back_url: "https://ifarmer-spply-chain.s3.ap-southeast-1.amazonaws.com/staging/users/nidback/105-1780378390-cb3a20dc-back-54937_nid_back.jpg",
        bank_id: 103,
        bank_name: "BRAC BANK ",
        branch_id: 99342,
        branch_name: "TANGAIL new",
        account_name: "sadi qa",
        account_number: "12345678901234322",
        routing_number: "090260374332132"
    },
    create_inventory_item: {
        name: "Potato",
        picture_url: "https://ifarmer-spply-chain.s3.ap-southeast-1.amazonaws.com/staging/inventory/products/80-Sweet%20Potato.jpg",
        price: "500.0",
        company_name: "Syngenta",
        unit_id: 1,
        quantity: "100.2",
        quality_parameters_desc: "Lomba misti potato"
    },
    update_inventory_item: {
        name: "Potato Update",
        price: "300.0",
        company_name: "Pran",
        quantity: "200.2",
        quality_parameters_desc: "Lomba misti potato update"
    }
};

/**
 * API Endpoints organized by functional groups
 * Each endpoint includes path and HTTP method
 * This structure allows easy extension of new endpoints
 * Following DRY by centralized endpoint definitions
 * 
 * @constant {Object}
 */
export const API_ENDPOINTS = {
    /**
     * Authentication endpoints
     */
    auth: {
        signIn: { path: '/api/v1/auth/login/', method: 'POST' },
    },

    /**
     * Supplier registration endpoints
     */
    supplier_reg: {
        registration: { path: '/api/v1/registrations/', method: 'POST' },
    },

    /**
     * Homepage, Supplier request, Supplier order related endpoints
     */
    home: {
        supplier_requests: { path: '/api/v3/supplier_requests?page=1&per_page=1&query=', method: 'GET' },
        supplier_orders: { path: '/api/v3/supplier_orders?page=1&per_page=15&query=', method: 'GET' },
        dashboard: { path: "/api/v1/dashboard", method: 'GET' },
        top_companies: { path: "/api/v1/dashboard/top_companies", method: 'GET' },
    },

    /**
     * Inventory endpoints with various category filters
     */
    inventory: {
        inventory_list: { path: '/api/v1/inventory/', method: 'GET' },
        create_inventory_item: { path: '/api/v1/inventory/', method: 'POST' },
        update_inventory_item: { path: '/api/v1/inventory/{inv_id}', method: 'PUT' },
        inventory_item: { path: '/api/v1/inventory/{inv_id}', method: 'GET' },
        delete_inventory_item: { path: '/api/v1/inventory/{inv_id}', method: 'DELETE' },
    },

    /**
     * Supplier requests related endpoints
     */
    supplier_requests: {
        supplier_requests: { path: '/api/v3/supplier_requests/', method: 'GET' },
        supplier_request_detail: { path: '/api/v3/supplier_requests/200', method: 'GET' },
    },

    /**
     * Supplier orders related endpoints
     */
    supplier_orders: {
        supplier_orders: { path: '/api/v3/supplier_orders/', method: 'GET' },
        supplier_order_detail: { path: '/api/v3/supplier_orders/103', method: 'GET' },
    },
};

/**
 * API Groups mapping for test execution
 * Organizes endpoints by functional sections
 * 
 * @constant {Object}
 */
export const API_GROUPS = {
    supplier_reg: [
        API_ENDPOINTS.supplier_reg.registration,
    ],
    home: [
        API_ENDPOINTS.home.supplier_requests,
        API_ENDPOINTS.home.supplier_orders,
        API_ENDPOINTS.home.dashboard,
        API_ENDPOINTS.home.top_companies,
    ],
    inventory: [
        API_ENDPOINTS.inventory.inventory_list,
        API_ENDPOINTS.inventory.create_inventory_item,
        API_ENDPOINTS.inventory.update_inventory_item,
        API_ENDPOINTS.inventory.inventory_item,
        API_ENDPOINTS.inventory.delete_inventory_item,
    ],
    supplier_requests: [
        API_ENDPOINTS.supplier_requests.supplier_requests,
        API_ENDPOINTS.supplier_requests.supplier_request_detail,
    ],
    supplier_orders: [
        API_ENDPOINTS.supplier_orders.supplier_orders,
        API_ENDPOINTS.supplier_orders.supplier_order_detail,
    ],
};
