#!/usr/bin/env node
/**
 * Performance Validator Module
 * Validates performance characteristics and scalability
 *
 * Usage:
 *   import { validatePerformance } from './performance.mjs';
 *   const results = await validatePerformance();
 *
 * Or: node validators/performance.mjs
 */
export function validatePerformance(): Promise<{
    surface: string;
    timestamp: string;
    tests: ({
        name: string;
        pass: boolean;
        duration: number;
        memory?: undefined;
    } | {
        name: string;
        pass: boolean;
        duration?: undefined;
        memory?: undefined;
    } | {
        name: string;
        pass: boolean;
        memory: string;
        duration?: undefined;
    })[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=performance.d.mts.map