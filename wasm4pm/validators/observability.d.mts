#!/usr/bin/env node
/**
 * Observability Validator Module
 * Validates logging, tracing, and observability features
 *
 * Usage:
 *   import { validateObservability } from './observability.mjs';
 *   const results = await validateObservability();
 *
 * Or: node validators/observability.mjs
 */
export function validateObservability(): Promise<{
    surface: string;
    timestamp: string;
    tests: {
        name: string;
        pass: boolean;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}>;
//# sourceMappingURL=observability.d.mts.map