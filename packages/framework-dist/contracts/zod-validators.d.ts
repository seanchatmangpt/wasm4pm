/**
 * zod-validators.ts — Runtime validation schemas for @wasm4pm/contracts
 *
 * Zod is NOT a declared dependency of this package (no external dep bloat).
 * These validators are implemented as plain TypeScript structural validators
 * with the same API surface as Zod's safeParse / parse — so they can be
 * swapped for real Zod schemas if the dep is ever added.
 *
 * Schemas covered (priority order):
 *   1. ReceiptSchema            — Receipt + sub-types
 *   2. ConformanceResultSchema  — FitnessResult / ConformanceEvaluation
 *   3. EventLogSchema           — EventLogIR / LogTrace / LogEvent
 *
 * Corresponding wasm4pm-compat bindings (for reference):
 *   /Users/sac/wasm4pm-compat/bindings/zod_schemas.ts
 *   - ReceiptSchema (line 689), ConformanceResultSchema (line 119)
 *   - EventLogSchema (line 269), EventSchema (line 248), TraceSchema (line 752)
 */
import { z } from 'zod';
import type { Receipt } from './receipt.js';
import type { FitnessResult } from './conformance-bridge.js';
import type { EventLogIR } from './eventlog.js';
export interface ParseSuccess<T> {
    success: true;
    data: T;
}
export declare const ParseErrorSchema: z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodObject<{
        issues: z.ZodArray<z.ZodObject<{
            path: z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: (string | number)[];
            message: string;
        }, {
            path: (string | number)[];
            message: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        issues: {
            path: (string | number)[];
            message: string;
        }[];
    }, {
        issues: {
            path: (string | number)[];
            message: string;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    success: false;
    error: {
        issues: {
            path: (string | number)[];
            message: string;
        }[];
    };
}, {
    success: false;
    error: {
        issues: {
            path: (string | number)[];
            message: string;
        }[];
    };
}>;
export type ParseError = z.infer<typeof ParseErrorSchema>;
export type ParseResult<T> = ParseSuccess<T> | ParseError;
/**
 * Parse and validate a Receipt at runtime.
 *
 * Mirrors wasm4pm-compat ReceiptSchema.safeParse().
 */
export declare function parseReceipt(value: unknown): ParseResult<Receipt>;
/**
 * Assert a value is a valid Receipt or throw a descriptive error.
 */
export declare function assertReceipt(value: unknown): Receipt;
/**
 * Parse and validate a FitnessResult at runtime.
 *
 * Mirrors wasm4pm-compat ConformanceResultSchema / TokenReplayResultSchema.
 */
export declare function parseFitnessResult(value: unknown): ParseResult<FitnessResult>;
/**
 * Assert a value is a valid FitnessResult or throw.
 */
export declare function assertFitnessResult(value: unknown): FitnessResult;
/**
 * Parse and validate an EventLogIR at runtime.
 *
 * Mirrors wasm4pm-compat EventLogSchema.safeParse().
 * All 60 algorithms ingest EventLogIR — catching bad input here prevents
 * runtime panics or silent corruption in WASM.
 */
export declare function parseEventLogIR(value: unknown): ParseResult<EventLogIR>;
/**
 * Assert a value is a valid EventLogIR or throw.
 */
export declare function assertEventLogIR(value: unknown): EventLogIR;
export type { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo, } from './receipt.js';
export type { FitnessResult, ConformanceEvaluation, ConformanceDimension, DimensionResult, } from './conformance-bridge.js';
export type { EventLogIR, LogTrace, LogEvent, LogMetadata, } from './eventlog.js';
//# sourceMappingURL=zod-validators.d.ts.map