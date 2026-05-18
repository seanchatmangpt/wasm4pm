/**
 * OCEL 2.0 bridge for wasm4pm receipts.
 *
 * Converts a wasm4pm `Receipt` into mcpp-compatible OCEL 2.0 JSONL rows
 * (the format that mcpp's ONTO-P09 writes to `.mcpp/events.jsonl`).
 *
 * Each receipt produces three ordered events:
 *   1. algorithm.start   — algorithm commenced
 *   2. algorithm.complete — algorithm finished
 *   3. admitted | refused — mcpp admission verdict derived from status
 */

import type { Receipt } from './receipt.js';

// ---------------------------------------------------------------------------
// OCEL 2.0 event type
// ---------------------------------------------------------------------------

/**
 * Single OCEL 2.0 event row as written to `.mcpp/events.jsonl`.
 * Keys follow the `ocel:` prefix convention from the OCEL 2.0 spec.
 */
export type OcelEvent = {
  /** Unique event identifier */
  'ocel:eid': string;
  /** Activity label (verb phrase describing what happened) */
  'ocel:activity': string;
  /** ISO-8601 timestamp */
  'ocel:timestamp': string;
  /** Object references — IDs of objects involved in this event */
  'ocel:omap': string[];
  /** Value map — additional key/value attributes */
  'ocel:vmap': Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Receipt → OCEL events
// ---------------------------------------------------------------------------

/**
 * Converts a wasm4pm `Receipt` into three OCEL 2.0 events suitable for
 * mcpp's AAT-Live process miner.
 *
 * Event sequence:
 *   1. `algorithm.start`    — records algorithm identity at start_time
 *   2. `algorithm.complete` — records outcome metrics at end_time
 *   3. `admitted` | `refused` — mcpp admission verdict at end_time
 *
 * @param receipt - A completed wasm4pm execution receipt
 * @param argr - Optional Actor-Resolved Gap Rate metrics to include in the
 *               `algorithm.complete` event's vmap for mcpp ARGR correlation
 * @returns Array of three OcelEvent objects in chronological order
 */
export function receiptToOcelEvents(
  receipt: Receipt,
  argr?: { rate: number; handoverDensity: number },
): OcelEvent[] {
  const runRef = receipt.run_id;

  const startEvent: OcelEvent = {
    'ocel:eid': `${receipt.run_id}-start`,
    'ocel:activity': 'algorithm.start',
    'ocel:timestamp': receipt.start_time,
    'ocel:omap': [runRef],
    'ocel:vmap': {
      algorithm: receipt.algorithm.name,
      version: receipt.algorithm.version,
    },
  };

  const completeEvent: OcelEvent = {
    'ocel:eid': `${receipt.run_id}-complete`,
    'ocel:activity': 'algorithm.complete',
    'ocel:timestamp': receipt.end_time,
    'ocel:omap': [runRef],
    'ocel:vmap': {
      status: receipt.status,
      traces: receipt.summary.traces_processed,
      variants: receipt.summary.variants_discovered,
      'mcpp.conformance.fitness': receipt.status === 'success' ? 1.0 : 0.0,
      'mcpp.conformance.precision': receipt.status === 'success' ? 1.0 : 0.0,
      'run.id': receipt.run_id,
      ...(argr !== undefined ? {
        'powl.gap.argr': argr.rate,
        'powl.gap.handover_density': argr.handoverDensity,
      } : {}),
    },
  };

  const verdictActivity = receipt.status === 'success' ? 'admitted' : 'refused';
  const verdictVmap: Record<string, unknown> = {
    fitness: null,
    algorithm: receipt.algorithm.name,
    'mcpp.claim.source': 'wasm4pm',
  };
  if (verdictActivity === 'refused') {
    verdictVmap['mcpp.refusal_class'] = 'ConformanceBelowThreshold';
  }
  const verdictEvent: OcelEvent = {
    'ocel:eid': `${receipt.run_id}-verdict`,
    'ocel:activity': verdictActivity,
    'ocel:timestamp': receipt.end_time,
    'ocel:omap': [runRef],
    'ocel:vmap': verdictVmap,
  };

  return [startEvent, completeEvent, verdictEvent];
}

// ---------------------------------------------------------------------------
// Serialisation / deserialisation helpers
// ---------------------------------------------------------------------------

/**
 * Serialises an array of OcelEvent objects to NDJSON (newline-delimited JSON).
 * Each event becomes one line; the result ends without a trailing newline.
 *
 * Compatible with the format mcpp's ONTO-P09 writes to `.mcpp/events.jsonl`.
 *
 * @param events - Array of OcelEvent objects to serialise
 * @returns NDJSON string with one event per line
 */
export function toOcelJsonl(events: OcelEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

/**
 * Parses an NDJSON string produced by mcpp into an array of OcelEvent objects.
 * Blank lines are silently skipped.
 *
 * @param ndjson - Newline-delimited JSON as written by mcpp's ONTO-P09
 * @returns Parsed array of OcelEvent objects
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 */
export function fromMcppJsonl(ndjson: string): OcelEvent[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OcelEvent);
}

// ---------------------------------------------------------------------------
// OCEL event structure validation
// ---------------------------------------------------------------------------

/**
 * The five required OCEL 2.0 keys that must be present on every event.
 * Presence is checked by `isValidOcelEvent`.
 */
const REQUIRED_OCEL_KEYS: ReadonlyArray<keyof OcelEvent> = [
  'ocel:eid',
  'ocel:activity',
  'ocel:timestamp',
  'ocel:omap',
  'ocel:vmap',
];

/**
 * Type guard that validates a parsed value has the minimal OCEL 2.0 event structure.
 *
 * Checks:
 * - All five required `ocel:` keys are present
 * - `ocel:eid` and `ocel:activity` and `ocel:timestamp` are non-empty strings
 * - `ocel:omap` is an array
 * - `ocel:vmap` is a non-null object
 *
 * Gap closure: `fromMcppJsonl` was previously a blind cast (`as OcelEvent`).
 * Callers that need validated events should pass each parsed event through this guard.
 *
 * @param value - The parsed JSON value to validate
 * @returns true if value satisfies the OcelEvent structure
 */
export function isValidOcelEvent(value: unknown): value is OcelEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ev = value as Record<string, unknown>;
  for (const key of REQUIRED_OCEL_KEYS) {
    if (!(key in ev)) return false;
  }
  if (typeof ev['ocel:eid'] !== 'string' || ev['ocel:eid'].length === 0) return false;
  if (typeof ev['ocel:activity'] !== 'string' || ev['ocel:activity'].length === 0) return false;
  if (typeof ev['ocel:timestamp'] !== 'string' || ev['ocel:timestamp'].length === 0) return false;
  if (!Array.isArray(ev['ocel:omap'])) return false;
  if (!ev['ocel:vmap'] || typeof ev['ocel:vmap'] !== 'object' || Array.isArray(ev['ocel:vmap']))
    return false;
  return true;
}

/**
 * Parses and validates an NDJSON string, throwing a `TypeError` for any line
 * whose parsed value does not satisfy the OCEL 2.0 event structure.
 *
 * Stricter variant of `fromMcppJsonl` for contexts where every event must be
 * structurally sound (e.g. before handing events to the process miner).
 *
 * @param ndjson - Newline-delimited JSON as written by mcpp's ONTO-P09
 * @returns Validated array of OcelEvent objects
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 * @throws {TypeError} if a parsed JSON value does not satisfy the OCEL 2.0 structure
 */
export function fromMcppJsonlStrict(ndjson: string): OcelEvent[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, idx) => {
      const parsed = JSON.parse(line) as unknown;
      if (!isValidOcelEvent(parsed)) {
        throw new TypeError(
          `OCEL event at line ${idx + 1} is missing required ocel: keys or has wrong types`
        );
      }
      return parsed;
    });
}

// ---------------------------------------------------------------------------
// mcpp native format → OCEL 2.0 adapter
// ---------------------------------------------------------------------------

/**
 * The wire shape mcpp emits from crates/mcpp-server/src/ocel.rs.
 * Keys are flat (no `ocel:` prefix).
 */
type McppNativeEvent = {
  id: string;
  activity: string;
  time: string;
  outcome: string;
  session_id: string;
  part_name: string;
  attrs: Record<string, unknown>;
  objects?: Record<string, string[]>;
};

/**
 * Returns true if the parsed value looks like an mcpp native event
 * (has the flat `id`, `activity`, `time` keys).
 */
function isMcppNativeEvent(value: unknown): value is McppNativeEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['activity'] === 'string' &&
    typeof v['time'] === 'string'
  );
}

/**
 * Adapts a single mcpp native event to wasm4pm's OcelEvent format.
 *
 * Mapping:
 *   `id`          → `ocel:eid`
 *   `activity`    → `ocel:activity`
 *   `time`        → `ocel:timestamp` (normalises `+00:00` → `Z`)
 *   `objects`     → `ocel:omap` (flattens typed map to id array; type info is lossy)
 *   `attrs`       → merged into `ocel:vmap`
 *   `outcome`, `session_id`, `part_name` → merged into `ocel:vmap`
 */
function adaptMcppNativeEvent(ev: McppNativeEvent): OcelEvent {
  const flatIds = ev.objects ? Object.values(ev.objects).flat() : [];
  return {
    'ocel:eid': ev.id,
    'ocel:activity': ev.activity,
    'ocel:timestamp': ev.time.replace('+00:00', 'Z'),
    'ocel:omap': flatIds,
    'ocel:vmap': {
      ...ev.attrs,
      outcome: ev.outcome,
      session_id: ev.session_id,
      part_name: ev.part_name,
    },
  };
}

/**
 * Parses an NDJSON string produced by mcpp's native emitter (flat keys, no `ocel:` prefix)
 * and adapts each event to wasm4pm's OCEL 2.0 format (`ocel:`-prefixed keys).
 *
 * Key mapping applied per event:
 *   - `id` → `ocel:eid`
 *   - `activity` → `ocel:activity`
 *   - `time` → `ocel:timestamp` (timezone offset `+00:00` normalised to `Z`)
 *   - `objects` (typed map) → `ocel:omap` (flattened to `string[]`; type info is lost)
 *   - `attrs` + `outcome` + `session_id` + `part_name` → merged into `ocel:vmap`
 *
 * Blank lines are silently skipped.
 *
 * @param ndjson - Newline-delimited JSON as written by mcpp's ONTO-P09 native emitter
 * @returns Array of adapted OcelEvent objects in wasm4pm OCEL 2.0 format
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 */
export function fromMcppNativeJsonl(ndjson: string): OcelEvent[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as unknown;
      if (isMcppNativeEvent(parsed)) {
        return adaptMcppNativeEvent(parsed);
      }
      // If the line happens to already be in ocel: format, pass it through
      return parsed as OcelEvent;
    });
}

/**
 * Parses and validates an NDJSON string produced by mcpp's native emitter, adapting
 * each event from mcpp's flat format to wasm4pm's OCEL 2.0 format, then throwing a
 * `TypeError` for any event that does not satisfy the OCEL 2.0 structure after adaptation.
 *
 * Stricter variant of `fromMcppNativeJsonl` for contexts where every adapted event must
 * be structurally sound before being handed to the process miner.
 *
 * @param ndjson - Newline-delimited JSON as written by mcpp's ONTO-P09 native emitter
 * @returns Validated array of adapted OcelEvent objects
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 * @throws {TypeError} if an event cannot be adapted to a valid OCEL 2.0 structure
 */
export function fromMcppNativeJsonlStrict(ndjson: string): OcelEvent[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, idx) => {
      const parsed = JSON.parse(line) as unknown;
      let adapted: unknown;
      if (isMcppNativeEvent(parsed)) {
        adapted = adaptMcppNativeEvent(parsed);
      } else {
        adapted = parsed;
      }
      if (!isValidOcelEvent(adapted)) {
        throw new TypeError(
          `OCEL event at line ${idx + 1} is missing required ocel: keys or has wrong types after adaptation`
        );
      }
      return adapted;
    });
}
