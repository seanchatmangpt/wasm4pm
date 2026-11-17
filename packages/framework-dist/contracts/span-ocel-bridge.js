/**
 * OTEL span → OCEL 2.0 event converter.
 *
 * Converts raw OTLP span exports (as produced by the observability layer)
 * into OCEL 2.0 events compatible with the wasm4pm process miner.
 *
 * Reuses OcelEvent and toOcelJsonl from ocel-bridge.
 */
import { z } from 'zod';
import { toOcelJsonl } from './ocel-bridge.js';
// ---------------------------------------------------------------------------
// SpanExport — wire shape of an OTLP span record
// ---------------------------------------------------------------------------
/**
 * Minimal OTLP span record as exported from the observability layer.
 * Numeric timestamps are nanoseconds since Unix epoch, encoded as strings
 * to avoid JavaScript integer overflow.
 *
 * Matches the W3C OTLP wire format (HTTP exporter output) — camelCase fields,
 * string-encoded nanosecond timestamps. This is intentionally distinct from
 * RawSpan in self-conformance.ts, which matches the FileSpanExporter's
 * on-disk snake_case format.
 */
export const SpanExportSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    name: z.string(),
    startTimeUnixNano: z.string(),
    endTimeUnixNano: z.string(),
    status: z.object({ code: z.number() }),
    attributes: z.record(z.string(), z.unknown()),
});
// ---------------------------------------------------------------------------
// Span status helpers
// ---------------------------------------------------------------------------
const SPAN_STATUS_LABELS = {
    0: 'UNSET',
    1: 'OK',
    2: 'ERROR',
};
function spanStatusLabel(code) {
    return SPAN_STATUS_LABELS[code] ?? 'UNSET';
}
// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------
/**
 * Converts nanosecond timestamp string to ISO 8601 string.
 * Divides by 1e6 to get milliseconds, then uses Date.toISOString().
 */
function nanoToIso(nanoStr) {
    const ms = Number(BigInt(nanoStr) / BigInt(1000000));
    return new Date(ms).toISOString();
}
/**
 * Converts an array of OTLP SpanExport records into OCEL 2.0 OcelEvent objects.
 *
 * Mapping per span:
 *   - `ocel:eid`       = spanId
 *   - `ocel:activity`  = span name (e.g. "wpm.run", "wasm4pm.ocel.discover")
 *   - `ocel:timestamp` = ISO 8601 derived from endTimeUnixNano (÷1e6 → ms → toISOString)
 *   - `ocel:omap`      = [runId, traceId] where runId = attributes['run.id'] ?? spanId
 *   - `ocel:vmap`      = {
 *       algorithm: attributes['pm.discovery.algorithm'] ?? null,
 *       status:    spanStatus label ("OK" | "ERROR" | "UNSET"),
 *       profile:   attributes['execution.profile'] ?? null,
 *     }
 *
 * @param spans - Array of OTLP span export records
 * @returns Array of OCEL 2.0 event objects in input order
 */
export function spansToOcelEvents(spans) {
    return spans.map((span) => {
        const runId = span.attributes['run.id'] ?? span.spanId;
        return {
            'ocel:eid': span.spanId,
            'ocel:activity': span.name,
            'ocel:timestamp': nanoToIso(span.endTimeUnixNano),
            'ocel:omap': [runId, span.traceId],
            'ocel:vmap': {
                algorithm: span.attributes['pm.discovery.algorithm'] ?? null,
                status: spanStatusLabel(span.status.code),
                profile: span.attributes['execution.profile'] ?? null,
            },
        };
    });
}
/**
 * Parses a JSONL string of SpanExport records, converts each to an OCEL 2.0
 * event, and returns the result as OCEL NDJSON.
 *
 * Blank lines are silently skipped.
 *
 * @param jsonl - Newline-delimited JSON, one SpanExport per line
 * @returns OCEL 2.0 NDJSON, one OcelEvent per line
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 */
export function spansJsonlToOcelJsonl(jsonl) {
    const spans = jsonl
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    return toOcelJsonl(spansToOcelEvents(spans));
}
//# sourceMappingURL=span-ocel-bridge.js.map