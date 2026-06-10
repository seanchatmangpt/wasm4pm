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

// ── Zod schemas (source of truth for runtime validation) ──────────────────────

export const LogEventSchema = z.object({
  activity: z.string(),
  timestamp: z.string(),
  resource: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()),
});

/**
 * Single event within a trace.
 *
 * - `timestamp` is ISO-8601 and required; no `null` or placeholder values allowed.
 * - `attributes` captures domain-specific data; use empty object if none.
 */
export type LogEvent = z.infer<typeof LogEventSchema>;

export const LogTraceSchema = z.object({
  case_id: z.string(),
  events: z.array(LogEventSchema),
});

/**
 * Single trace (process instance) containing an ordered sequence of events.
 *
 * - `case_id` is unique per trace within the log.
 * - `events` is ordered by timestamp (control plane validates this).
 */
export type LogTrace = z.infer<typeof LogTraceSchema>;

export const LogMetadataSchema = z.object({
  trace_count: z.number(),
  event_count: z.number(),
  activity_count: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  source_hash: z.string(),
});

/**
 * Metadata about the event log.
 *
 * - `trace_count`, `event_count`, `activity_count` are computed during parse.
 * - `start_time` and `end_time` are ISO-8601 and derived from event timestamps.
 * - `source_hash` is BLAKE3(raw_input_bytes) in hex-64 format (128 characters).
 */
export type LogMetadata = z.infer<typeof LogMetadataSchema>;

export const EventLogIRSchema = z.object({
  format_version: z.literal('1.0'),
  source_format: z.enum(['xes', 'ocel', 'json', 'csv']),
  traces: z.array(LogTraceSchema),
  metadata: LogMetadataSchema,
});

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
export function isEventLogIR(value: unknown): value is EventLogIR {
  if (!value || typeof value !== 'object') return false;

  const log = value as Record<string, unknown>;

  // Check format_version
  if (log.format_version !== '1.0') return false;

  // Check source_format
  const validFormats = ['xes', 'ocel', 'json', 'csv'];
  if (!validFormats.includes(log.source_format as string)) return false;

  // Check metadata exists and is valid
  if (!log.metadata || typeof log.metadata !== 'object') return false;
  const meta = log.metadata as Record<string, unknown>;
  if (
    typeof meta.trace_count !== 'number' ||
    !Number.isFinite(meta.trace_count) ||
    typeof meta.event_count !== 'number' ||
    !Number.isFinite(meta.event_count) ||
    typeof meta.activity_count !== 'number' ||
    !Number.isFinite(meta.activity_count) ||
    typeof meta.source_hash !== 'string' ||
    meta.source_hash.length === 0 ||
    typeof meta.start_time !== 'string' ||
    typeof meta.end_time !== 'string'
  )
    return false;

  // Check traces is a non-empty array
  if (!Array.isArray(log.traces) || log.traces.length === 0) return false;

  // Basic trace validation
  for (const trace of log.traces) {
    if (!trace || typeof trace !== 'object') return false;
    const t = trace as Record<string, unknown>;
    if (typeof t.case_id !== 'string') return false;
    if (!Array.isArray(t.events) || t.events.length === 0) return false;

    // Basic event validation
    for (const event of t.events) {
      if (!event || typeof event !== 'object') return false;
      const e = event as Record<string, unknown>;
      if (typeof e.activity !== 'string') return false;
      if (typeof e.timestamp !== 'string') return false;
      if (e.resource !== undefined && typeof e.resource !== 'string') return false;
      if (typeof e.attributes !== 'object') return false;
    }
  }

  return true;
}
