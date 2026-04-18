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
export function isEventLogIR(value) {
    if (!value || typeof value !== 'object')
        return false;
    const log = value;
    // Check format_version
    if (log.format_version !== "1.0")
        return false;
    // Check source_format
    const validFormats = ["xes", "ocel", "json", "csv"];
    if (!validFormats.includes(log.source_format))
        return false;
    // Check metadata exists and is valid
    if (!log.metadata || typeof log.metadata !== 'object')
        return false;
    const meta = log.metadata;
    if (typeof meta.trace_count !== 'number' || !Number.isFinite(meta.trace_count) ||
        typeof meta.event_count !== 'number' || !Number.isFinite(meta.event_count) ||
        typeof meta.activity_count !== 'number' || !Number.isFinite(meta.activity_count) ||
        typeof meta.source_hash !== 'string' || meta.source_hash.length === 0 ||
        typeof meta.start_time !== 'string' ||
        typeof meta.end_time !== 'string')
        return false;
    // Check traces is a non-empty array
    if (!Array.isArray(log.traces) || log.traces.length === 0)
        return false;
    // Basic trace validation
    for (const trace of log.traces) {
        if (!trace || typeof trace !== 'object')
            return false;
        const t = trace;
        if (typeof t.case_id !== 'string')
            return false;
        if (!Array.isArray(t.events) || t.events.length === 0)
            return false;
        // Basic event validation
        for (const event of t.events) {
            if (!event || typeof event !== 'object')
                return false;
            const e = event;
            if (typeof e.activity !== 'string')
                return false;
            if (typeof e.timestamp !== 'string')
                return false;
            if (e.resource !== undefined && typeof e.resource !== 'string')
                return false;
            if (typeof e.attributes !== 'object')
                return false;
        }
    }
    return true;
}
//# sourceMappingURL=eventlog.js.map