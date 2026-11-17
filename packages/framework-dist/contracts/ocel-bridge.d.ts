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
import { z } from 'zod';
import type { Receipt } from './receipt.js';
/**
 * Zod schema for OCEL 2.0 event rows as written to `.mcpp/events.jsonl`.
 * Keys follow the `ocel:` prefix convention from the OCEL 2.0 spec.
 */
export declare const OcelEventSchema: z.ZodObject<{
    'ocel:eid': z.ZodString;
    'ocel:activity': z.ZodString;
    'ocel:timestamp': z.ZodString;
    'ocel:omap': z.ZodArray<z.ZodString, "many">;
    'ocel:vmap': z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    'ocel:eid': string;
    'ocel:activity': string;
    'ocel:timestamp': string;
    'ocel:omap': string[];
    'ocel:vmap': Record<string, unknown>;
}, {
    'ocel:eid': string;
    'ocel:activity': string;
    'ocel:timestamp': string;
    'ocel:omap': string[];
    'ocel:vmap': Record<string, unknown>;
}>;
/**
 * Single OCEL 2.0 event row as written to `.mcpp/events.jsonl`.
 * Keys follow the `ocel:` prefix convention from the OCEL 2.0 spec.
 */
export type OcelEvent = z.infer<typeof OcelEventSchema>;
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
export declare function receiptToOcelEvents(receipt: Receipt, argr?: {
    rate: number;
    handoverDensity: number;
}): OcelEvent[];
/**
 * Serialises an array of OcelEvent objects to NDJSON (newline-delimited JSON).
 * Each event becomes one line; the result ends without a trailing newline.
 *
 * Compatible with the format mcpp's ONTO-P09 writes to `.mcpp/events.jsonl`.
 *
 * @param events - Array of OcelEvent objects to serialise
 * @returns NDJSON string with one event per line
 */
export declare function toOcelJsonl(events: OcelEvent[]): string;
/**
 * Parses an NDJSON string produced by mcpp into an array of OcelEvent objects.
 * Blank lines are silently skipped.
 *
 * @param ndjson - Newline-delimited JSON as written by mcpp's ONTO-P09
 * @returns Parsed array of OcelEvent objects
 * @throws {SyntaxError} if any non-blank line is not valid JSON
 */
export declare function fromMcppJsonl(ndjson: string): OcelEvent[];
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
export declare function isValidOcelEvent(value: unknown): value is OcelEvent;
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
export declare function fromMcppJsonlStrict(ndjson: string): OcelEvent[];
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
export declare function fromMcppNativeJsonl(ndjson: string): OcelEvent[];
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
export declare function fromMcppNativeJsonlStrict(ndjson: string): OcelEvent[];
//# sourceMappingURL=ocel-bridge.d.ts.map