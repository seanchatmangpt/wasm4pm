/**
 * OTEL span → OCEL 2.0 event converter.
 *
 * Converts raw OTLP span exports (as produced by the observability layer)
 * into OCEL 2.0 events compatible with the wasm4pm process miner.
 *
 * Reuses OcelEvent and toOcelJsonl from ocel-bridge.
 */
import { z } from 'zod';
import { type OcelEvent } from './ocel-bridge.js';
export type { OcelEvent };
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
export declare const SpanExportSchema: z.ZodObject<{
    traceId: z.ZodString;
    spanId: z.ZodString;
    name: z.ZodString;
    startTimeUnixNano: z.ZodString;
    endTimeUnixNano: z.ZodString;
    status: z.ZodObject<{
        code: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        code: number;
    }, {
        code: number;
    }>;
    attributes: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    status: {
        code: number;
    };
    name: string;
    attributes: Record<string, unknown>;
    traceId: string;
    spanId: string;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
}, {
    status: {
        code: number;
    };
    name: string;
    attributes: Record<string, unknown>;
    traceId: string;
    spanId: string;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
}>;
export type SpanExport = z.infer<typeof SpanExportSchema>;
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
export declare function spansToOcelEvents(spans: SpanExport[]): OcelEvent[];
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
export declare function spansJsonlToOcelJsonl(jsonl: string): string;
//# sourceMappingURL=span-ocel-bridge.d.ts.map