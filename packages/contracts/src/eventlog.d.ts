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
/**
 * Single event within a trace.
 *
 * - `timestamp` is ISO-8601 and required; no `null` or placeholder values allowed.
 * - `attributes` captures domain-specific data; use empty object if none.
 */
export interface LogEvent {
    activity: string;
    timestamp: string;
    resource?: string;
    attributes: Readonly<Record<string, unknown>>;
}
/**
 * Single trace (process instance) containing an ordered sequence of events.
 *
 * - `case_id` is unique per trace within the log.
 * - `events` is ordered by timestamp (control plane validates this).
 */
export interface LogTrace {
    case_id: string;
    events: ReadonlyArray<LogEvent>;
}
/**
 * Metadata about the event log.
 *
 * - `trace_count`, `event_count`, `activity_count` are computed during parse.
 * - `start_time` and `end_time` are ISO-8601 and derived from event timestamps.
 * - `source_hash` is BLAKE3(raw_input_bytes) in hex-64 format (128 characters).
 */
export interface LogMetadata {
    trace_count: number;
    event_count: number;
    activity_count: number;
    start_time: string;
    end_time: string;
    source_hash: string;
}
/**
 * Canonical Intermediate Representation of an event log.
 *
 * This is the contract between:
 * - Control plane (packages/kernel, packages/planner)
 * - Execution substrates (wasm4pm, pm4py-mcp, @pictl/ml)
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
export interface EventLogIR {
    readonly format_version: "1.0";
    readonly source_format: "xes" | "ocel" | "json" | "csv";
    readonly traces: ReadonlyArray<LogTrace>;
    readonly metadata: LogMetadata;
}
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