#!/usr/bin/env node
/**
 * HTTP Service Validator Module
 * Validates HTTP API endpoints
 *
 * Usage:
 *   import { validateHTTP } from './http.mjs';
 *   const results = await validateHTTP('http://localhost:3000');
 *
 * Or: node validators/http.mjs [baseUrl]
 */
export function validateHTTP(baseUrl?: string): Promise<{
    surface: string;
    baseUrl: string;
    timestamp: string;
    tests: {
        name: string;
        pass: any;
        code: number;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=http.d.mts.map