/**
 * OTEL span → OCEL 2.0 event converter.
 *
 * Converts raw OTLP span exports (as produced by the observability layer)
 * into OCEL 2.0 events compatible with the wasm4pm process miner.
 *
 * Reuses OcelEvent and toOcelJsonl from ocel-bridge.
 */

import { type OcelEvent, toOcelJsonl } from './ocel-bridge.js';

// ---------------------------------------------------------------------------
// Re-export OcelEvent for consumers of this module
// ---------------------------------------------------------------------------

export type { OcelEvent };

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
export type SpanExport = {
  /** W3C trace ID (32 hex chars) */
  traceId: string;
  /** Span ID (16 hex chars) */
  spanId: string;
  /** Span name, e.g. "wpm.run" or "wasm4pm.ocel.discover" */
  name: string;
  /** Start time as nanoseconds since epoch (string to avoid overflow) */
  startTimeUnixNano: string;
  /** End time as nanoseconds since epoch (string to avoid overflow) */
  endTimeUnixNano: string;
  /** Span status — code 0=UNSET, 1=OK, 2=ERROR */
  status: { code: number };
  /** Arbitrary span attributes */
  attributes: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Span status helpers
// ---------------------------------------------------------------------------

const SPAN_STATUS_LABELS: Record<number, string> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

function spanStatusLabel(code: number): string {
  return SPAN_STATUS_LABELS[code] ?? 'UNSET';
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Converts nanosecond timestamp string to ISO 8601 string.
 * Divides by 1e6 to get milliseconds, then uses Date.toISOString().
 */
function nanoToIso(nanoStr: string): string {
  const ms = Number(BigInt(nanoStr) / BigInt(1_000_000));
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
export function spansToOcelEvents(spans: SpanExport[]): OcelEvent[] {
  return spans.map((span) => {
    const runId = (span.attributes['run.id'] as string | undefined) ?? span.spanId;
    return {
      'ocel:eid': span.spanId,
      'ocel:activity': span.name,
      'ocel:timestamp': nanoToIso(span.endTimeUnixNano),
      'ocel:omap': [runId, span.traceId],
      'ocel:vmap': {
        algorithm: (span.attributes['pm.discovery.algorithm'] as string | undefined) ?? null,
        status: spanStatusLabel(span.status.code),
        profile: (span.attributes['execution.profile'] as unknown) ?? null,
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
export function spansJsonlToOcelJsonl(jsonl: string): string {
  const spans = jsonl
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SpanExport);
  return toOcelJsonl(spansToOcelEvents(spans));
}
