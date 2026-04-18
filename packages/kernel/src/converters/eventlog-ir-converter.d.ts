/**
 * eventlog-ir-converter.ts
 *
 * Converts between EventLogIR (canonical substrate-neutral representation)
 * and WASM-compatible JSON format for pm4wasm integration.
 *
 * Key invariants:
 * - EventLogIR attributes use standard XES keys (concept:name, time:timestamp, org:resource)
 * - WASM JSON uses canonical key ordering for deterministic hashing
 * - Timestamps validated as ISO-8601 format
 * - Round-trip losslessness: EventLogIR → WASM JSON → EventLogIR is byte-identical
 *   (except computed metadata fields like source_hash which are regenerated)
 */
import type { EventLogIR } from '@pictl/contracts';
/**
 * WASM-compatible JSON representation of an event log.
 * Mirrors EventLogIR structure but optimized for WASM serialization.
 */
export interface WasmEventLog {
    format_version: "1.0";
    source_format: "xes" | "ocel" | "json" | "csv";
    traces: Array<{
        case_id: string;
        events: Array<{
            activity: string;
            timestamp: string;
            resource?: string;
            attributes: Record<string, unknown>;
        }>;
    }>;
    metadata: {
        trace_count: number;
        event_count: number;
        activity_count: number;
        start_time: string;
        end_time: string;
        source_hash: string;
    };
}
/**
 * Validate that a string is a valid ISO-8601 timestamp.
 *
 * @param timestamp - String to validate
 * @returns true if valid ISO-8601, false otherwise
 */
export declare function isValidIso8601(timestamp: string): boolean;
/**
 * Validate all timestamps in a log and throw if any are invalid.
 *
 * @param log - EventLogIR to validate
 * @throws Error if any timestamp is not ISO-8601 or unparseable
 */
export declare function validateLogTimestamps(log: EventLogIR): void;
/**
 * Convert EventLogIR to WASM-compatible JSON.
 *
 * Process:
 * 1. Validate all timestamps are ISO-8601
 * 2. Create WasmEventLog with canonically ordered attributes
 * 3. Return stringified JSON (deterministic, sorted keys)
 *
 * @param log - EventLogIR to convert
 * @returns JSON string representation of WasmEventLog (sorted keys)
 * @throws Error if any timestamp is invalid
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
 *     source_hash: "abcd...ef01"
 *   }
 * };
 *
 * const json = eventLogIrToWasmJson(log);
 * // json is deterministic: same log → same JSON string
 * ```
 */
export declare function eventLogIrToWasmJson(log: EventLogIR): string;
/**
 * Convert WASM-compatible JSON back to EventLogIR.
 *
 * Process:
 * 1. Parse JSON string
 * 2. Validate format_version is "1.0"
 * 3. Reconstruct EventLogIR with ReadonlyArray types
 * 4. Validate all timestamps
 *
 * Supports round-trip: EventLogIR → JSON → EventLogIR (bit-identical)
 * except metadata fields like source_hash which are recomputed by callers.
 *
 * @param json - JSON string representation of WasmEventLog
 * @returns EventLogIR
 * @throws SyntaxError if JSON is invalid
 * @throws Error if format_version != "1.0" or timestamps are invalid
 *
 * @example
 * ```ts
 * const json = eventLogIrToWasmJson(originalLog);
 * const reconstructed = wasmJsonToEventLogIr(json);
 * // reconstructed.traces === originalLog.traces (deep equal)
 * ```
 */
export declare function wasmJsonToEventLogIr(json: string): EventLogIR;
/**
 * Compute canonical hash of EventLogIR for verification.
 *
 * Uses canonicalize() which ensures deterministic ordering of all keys,
 * then hashes the result with SHA-256.
 *
 * Same log → same hash, always. Different logs → different hash (with negligible collision probability).
 *
 * @param log - EventLogIR to hash
 * @returns SHA-256 hex hash of canonicalized EventLogIR
 *
 * @example
 * ```ts
 * const hash1 = hashEventLogIr(log);
 * const hash2 = hashEventLogIr(log);
 * assert(hash1 === hash2); // Always identical
 * ```
 */
export declare function hashEventLogIr(log: EventLogIR): string;
//# sourceMappingURL=eventlog-ir-converter.d.ts.map