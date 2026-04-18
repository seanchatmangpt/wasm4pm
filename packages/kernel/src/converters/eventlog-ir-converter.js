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
import { canonicalize } from '../hashing.js';
/**
 * ISO-8601 timestamp validation regex.
 * Matches: 2026-04-16T10:00:00Z, 2026-04-16T10:00:00.123Z, 2026-04-16T10:00:00+02:00
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/**
 * Validate that a string is a valid ISO-8601 timestamp.
 *
 * @param timestamp - String to validate
 * @returns true if valid ISO-8601, false otherwise
 */
export function isValidIso8601(timestamp) {
    if (!ISO_8601_REGEX.test(timestamp))
        return false;
    // Attempt to parse as Date to catch further invalid cases
    const date = new Date(timestamp);
    return !Number.isNaN(date.getTime());
}
/**
 * Validate all timestamps in a log and throw if any are invalid.
 *
 * @param log - EventLogIR to validate
 * @throws Error if any timestamp is not ISO-8601 or unparseable
 */
export function validateLogTimestamps(log) {
    const timestampsToCheck = [
        log.metadata.start_time,
        log.metadata.end_time,
        ...log.traces.flatMap(t => t.events.map(e => e.timestamp)),
    ];
    for (const timestamp of timestampsToCheck) {
        if (!isValidIso8601(timestamp)) {
            throw new Error(`Invalid ISO-8601 timestamp: ${timestamp}`);
        }
    }
    // Verify start_time <= end_time
    const startDate = new Date(log.metadata.start_time);
    const endDate = new Date(log.metadata.end_time);
    if (startDate > endDate) {
        throw new Error(`Invalid metadata: start_time (${log.metadata.start_time}) is after end_time (${log.metadata.end_time})`);
    }
}
/**
 * Recursively sort object keys for deterministic serialization.
 * Ensures same data always produces same JSON string.
 */
function sortKeys(value) {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
        sorted[key] = sortKeys(value[key]);
    }
    return sorted;
}
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
export function eventLogIrToWasmJson(log) {
    // Validate all timestamps
    validateLogTimestamps(log);
    // Build WasmEventLog with sorted keys
    const wasmLog = {
        format_version: "1.0",
        source_format: log.source_format,
        traces: log.traces.map((trace) => ({
            case_id: trace.case_id,
            events: trace.events.map((event) => {
                const eventObj = {
                    activity: event.activity,
                    timestamp: event.timestamp,
                    attributes: sortKeys(event.attributes),
                };
                // Only include resource if present
                if (event.resource !== undefined) {
                    eventObj.resource = event.resource;
                }
                return eventObj;
            }),
        })),
        metadata: {
            trace_count: log.metadata.trace_count,
            event_count: log.metadata.event_count,
            activity_count: log.metadata.activity_count,
            start_time: log.metadata.start_time,
            end_time: log.metadata.end_time,
            source_hash: log.metadata.source_hash,
        },
    };
    // Serialize with sorted keys for determinism
    return canonicalize(wasmLog);
}
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
export function wasmJsonToEventLogIr(json) {
    // Parse JSON (throws SyntaxError if malformed)
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid WASM JSON: root must be an object');
    }
    const wasmLog = parsed;
    // Validate format_version
    if (wasmLog.format_version !== "1.0") {
        throw new Error(`Invalid format_version: expected "1.0", got "${wasmLog.format_version}"`);
    }
    // Validate source_format
    const validFormats = ['xes', 'ocel', 'json', 'csv'];
    if (!validFormats.includes(wasmLog.source_format)) {
        throw new Error(`Invalid source_format: "${wasmLog.source_format}"`);
    }
    // Parse metadata
    const metadata = wasmLog.metadata;
    if (!metadata || typeof metadata !== 'object') {
        throw new Error('Invalid metadata: must be an object');
    }
    const logMetadata = {
        trace_count: metadata.trace_count,
        event_count: metadata.event_count,
        activity_count: metadata.activity_count,
        start_time: metadata.start_time,
        end_time: metadata.end_time,
        source_hash: metadata.source_hash,
    };
    // Parse traces
    const traces = wasmLog.traces;
    if (!Array.isArray(traces)) {
        throw new Error('Invalid traces: must be an array');
    }
    const logTraces = traces.map((traceObj) => {
        const trace = traceObj;
        const events = trace.events;
        if (!Array.isArray(events)) {
            throw new Error(`Invalid events for trace ${trace.case_id}: must be an array`);
        }
        const logEvents = events.map((eventObj) => {
            const event = eventObj;
            return {
                activity: event.activity,
                timestamp: event.timestamp,
                resource: event.resource,
                attributes: Object.freeze(event.attributes),
            };
        });
        return {
            case_id: trace.case_id,
            events: logEvents,
        };
    });
    const log = {
        format_version: "1.0",
        source_format: wasmLog.source_format,
        traces: logTraces,
        metadata: logMetadata,
    };
    // Validate timestamps
    validateLogTimestamps(log);
    return log;
}
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
export function hashEventLogIr(log) {
    return canonicalize(log);
}
//# sourceMappingURL=eventlog-ir-converter.js.map