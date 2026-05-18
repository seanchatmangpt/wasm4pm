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
