/**
 * EventLogIR - Canonical Intermediate Representation of Event Logs
 *
 * Section 2.1 of the Three-Layer Architecture Contract Specification.
 * This is the substrate-neutral representation used across all layer boundaries.
 *
 * @example
 * ```ts
 * const log: EventLogIR = {
 *   format_version: "1.0",
 *   source_format: "xes",
 *   traces: [
 *     {
 *       case_id: "case-001",
 *       events: [
 *         {
 *           activity: "Register",
 *           timestamp: "2026-04-16T10:00:00Z",
 *           resource: "alice",
 *           attributes: { amount: 100 }
 *         }
 *       ]
 *     }
 *   ],
 *   metadata: {
 *     trace_count: 1,
 *     event_count: 1,
 *     activity_count: 1,
 *     start_time: "2026-04-16T10:00:00Z",
 *     end_time: "2026-04-16T11:00:00Z",
 *     source_hash: "abcd...ef01" // BLAKE3 hex-64
 *   }
 * };
 * ```
 */
import { z } from 'zod';
export declare const LogEventSchema: z.ZodObject<{
    activity: z.ZodString;
    timestamp: z.ZodString;
    resource: z.ZodOptional<z.ZodString>;
    attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    activity: string;
    timestamp: string;
    attributes: Record<string, unknown>;
    resource?: string | undefined;
}, {
    activity: string;
    timestamp: string;
    attributes: Record<string, unknown>;
    resource?: string | undefined;
}>;
/**
 * Single event within a trace.
 *
 * - `timestamp` is ISO-8601 and required; no `null` or placeholder values allowed.
 * - `attributes` captures domain-specific data; use empty object if none.
 */
export type LogEvent = z.infer<typeof LogEventSchema>;
export declare const LogTraceSchema: z.ZodObject<{
    case_id: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        activity: z.ZodString;
        timestamp: z.ZodString;
        resource: z.ZodOptional<z.ZodString>;
        attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        activity: string;
        timestamp: string;
        attributes: Record<string, unknown>;
        resource?: string | undefined;
    }, {
        activity: string;
        timestamp: string;
        attributes: Record<string, unknown>;
        resource?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    events: {
        activity: string;
        timestamp: string;
        attributes: Record<string, unknown>;
        resource?: string | undefined;
    }[];
    case_id: string;
}, {
    events: {
        activity: string;
        timestamp: string;
        attributes: Record<string, unknown>;
        resource?: string | undefined;
    }[];
    case_id: string;
}>;
/**
 * Single trace (process instance) containing an ordered sequence of events.
 *
 * - `case_id` is unique per trace within the log.
 * - `events` is ordered by timestamp (control plane validates this).
 */
export type LogTrace = z.infer<typeof LogTraceSchema>;
export declare const LogMetadataSchema: z.ZodObject<{
    trace_count: z.ZodNumber;
    event_count: z.ZodNumber;
    activity_count: z.ZodNumber;
    start_time: z.ZodString;
    end_time: z.ZodString;
    source_hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    start_time: string;
    end_time: string;
    trace_count: number;
    event_count: number;
    activity_count: number;
    source_hash: string;
}, {
    start_time: string;
    end_time: string;
    trace_count: number;
    event_count: number;
    activity_count: number;
    source_hash: string;
}>;
/**
 * Metadata about the event log.
 *
 * - `trace_count`, `event_count`, `activity_count` are computed during parse.
 * - `start_time` and `end_time` are ISO-8601 and derived from event timestamps.
 * - `source_hash` is BLAKE3(raw_input_bytes) in hex-64 format (128 characters).
 */
export type LogMetadata = z.infer<typeof LogMetadataSchema>;
export declare const EventLogIRSchema: z.ZodObject<{
    format_version: z.ZodLiteral<"1.0">;
    source_format: z.ZodEnum<["xes", "ocel", "json", "csv"]>;
    traces: z.ZodArray<z.ZodObject<{
        case_id: z.ZodString;
        events: z.ZodArray<z.ZodObject<{
            activity: z.ZodString;
            timestamp: z.ZodString;
            resource: z.ZodOptional<z.ZodString>;
            attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }, {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        events: {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }[];
        case_id: string;
    }, {
        events: {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }[];
        case_id: string;
    }>, "many">;
    metadata: z.ZodObject<{
        trace_count: z.ZodNumber;
        event_count: z.ZodNumber;
        activity_count: z.ZodNumber;
        start_time: z.ZodString;
        end_time: z.ZodString;
        source_hash: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        start_time: string;
        end_time: string;
        trace_count: number;
        event_count: number;
        activity_count: number;
        source_hash: string;
    }, {
        start_time: string;
        end_time: string;
        trace_count: number;
        event_count: number;
        activity_count: number;
        source_hash: string;
    }>;
}, "strip", z.ZodTypeAny, {
    traces: {
        events: {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }[];
        case_id: string;
    }[];
    format_version: "1.0";
    source_format: "json" | "xes" | "ocel" | "csv";
    metadata: {
        start_time: string;
        end_time: string;
        trace_count: number;
        event_count: number;
        activity_count: number;
        source_hash: string;
    };
}, {
    traces: {
        events: {
            activity: string;
            timestamp: string;
            attributes: Record<string, unknown>;
            resource?: string | undefined;
        }[];
        case_id: string;
    }[];
    format_version: "1.0";
    source_format: "json" | "xes" | "ocel" | "csv";
    metadata: {
        start_time: string;
        end_time: string;
        trace_count: number;
        event_count: number;
        activity_count: number;
        source_hash: string;
    };
}>;
/**
 * Canonical Intermediate Representation of an event log.
 *
 * This is the contract between:
 * - Control plane (packages/kernel, packages/planner)
 * - Execution substrates (wasm4pm, pm4py-mcp, @wasm4pm/ml)
 *
 * No backend ever receives raw XES, OCEL, or JSON — they receive EventLogIR.
 * No backend returns raw results — they return ResultEnvelope<ModelIR> or similar.
 *
 * **Format Versioning:** `format_version: "1.0"` gates the schema. Version mismatch → error.
 *
 * **Cross-Boundary Invariants:**
 * 1. No raw handles cross boundaries; EventLogIR is fully resolved.
 * 2. Timestamps are always ISO-8601; duration computations use `parse_iso8601_duration()`.
 * 3. `source_hash` is required and non-empty (gap closure: TS-1).
 * 4. `source_format` matches the original input type for provenance.
 */
export type EventLogIR = z.infer<typeof EventLogIRSchema>;
/**
 * Guard function to check if a value is a valid EventLogIR.
 *
 * Validates:
 * - format_version is "1.0"
 * - source_format is one of the allowed values
 * - metadata fields are non-null and finite
 * - traces array is not empty
 *
 * @param value The value to check
 * @returns true if value is a valid EventLogIR, false otherwise
 */
export declare function isEventLogIR(value: unknown): value is EventLogIR;
//# sourceMappingURL=eventlog.d.ts.map