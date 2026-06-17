/**
 * Marketplace domain OCEL bridge for wasm4pm.
 *
 * Adapts raw marketplace domain events (as emitted by Stripe/Shopify-style
 * commerce systems) into OCEL 2.0 events suitable for process mining with
 * wasm4pm. Marketplace events follow this structure:
 *
 *   { "event_type": "listing.created", "listing_id": "lst-001", "seller_id": "usr-42",
 *     "price": 99.99, "ts": "2026-05-18T10:00:00Z" }
 *   { "event_type": "order.placed", "order_id": "ord-007", "listing_id": "lst-001",
 *     "buyer_id": "usr-13", "ts": "2026-05-18T10:05:00Z" }
 *   { "event_type": "fulfillment.shipped", "order_id": "ord-007", "carrier": "ups",
 *     "tracking_id": "1Z999", "ts": "2026-05-18T11:00:00Z" }
 *   { "event_type": "payment.captured", "order_id": "ord-007", "amount": 99.99,
 *     "ts": "2026-05-18T11:30:00Z" }
 *
 * Object type inference:
 *   - Keys ending in `_id` drive ocel:omap population:
 *       order_id    → object type "orders"
 *       listing_id  → object type "listings"
 *       seller_id   → object type "users"
 *       buyer_id    → object type "users"
 *   - Any other `*_id` key → object type derived from the prefix: `foo_id` → "foos"
 *
 * This mapping follows the Van der Aalst OCEL 2.0 object-centric event log
 * convention where each id-keyed field identifies a process object.
 */

import { z } from 'zod';
import type { OcelEvent } from './ocel-bridge.js';

// ---------------------------------------------------------------------------
// MarketplaceEvent type
// ---------------------------------------------------------------------------

/**
 * A raw marketplace domain event as emitted by the upstream commerce system.
 * The `event_type` and `ts` (ISO-8601 timestamp) fields are mandatory for
 * adaptation. All remaining fields become the OCEL value map or drive object
 * type inference.
 */
export const MarketplaceEventSchema = z.object({
  event_type: z.string().min(1),
  ts: z.string().min(1),
}).catchall(z.unknown());
export type MarketplaceEvent = z.infer<typeof MarketplaceEventSchema>;

// ---------------------------------------------------------------------------
// Object-type inference table
// ---------------------------------------------------------------------------

/**
 * Canonical mapping from known marketplace ID key names to their OCEL object
 * types. Keys not listed here fall back to the generic prefix-based rule
 * (`foo_id` → "foos").
 */
const KNOWN_ID_TO_OBJECT_TYPE: Record<string, string> = {
  order_id: 'orders',
  listing_id: 'listings',
  seller_id: 'users',
  buyer_id: 'users',
  user_id: 'users',
  product_id: 'products',
  shipment_id: 'shipments',
  payment_id: 'payments',
  refund_id: 'refunds',
  carrier_id: 'carriers',
};

/**
 * Derives an OCEL object-type string from a marketplace event field key.
 * Uses the canonical table first, then falls back to the `*_id` → `*s` rule.
 *
 * Returns null if the key is not an id field (does not end in `_id`).
 */
function objectTypeFromKey(key: string): string | null {
  if (!key.endsWith('_id')) return null;
  if (KNOWN_ID_TO_OBJECT_TYPE[key]) return KNOWN_ID_TO_OBJECT_TYPE[key];
  // Generic fallback: strip `_id` suffix, pluralise with `s`
  const prefix = key.slice(0, -3); // remove "_id"
  return `${prefix}s`;
}

// ---------------------------------------------------------------------------
// Timestamp normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a timestamp string to ISO-8601 with a trailing `Z` (UTC).
 * Converts:
 *   - `+00:00` offset → `Z`
 *   - Trailing `+00:00` → `Z`
 *   - Strings already ending in `Z` → unchanged
 *
 * If the string is not parseable as a date (new Date returns NaN), returns the
 * input unchanged so callers can decide whether to skip the event.
 */
function normaliseTimestamp(ts: string): string {
  // Already canonical
  if (ts.endsWith('Z')) return ts;
  // Replace UTC offset with Z
  const normalised = ts.replace(/\+00:00$/, 'Z');
  if (normalised.endsWith('Z')) return normalised;
  // Try to parse and re-serialise for other offset forms
  const parsed = new Date(ts);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return ts;
}

// ---------------------------------------------------------------------------
// Unique EID generation
// ---------------------------------------------------------------------------

/**
 * Counter used to suffix duplicate eids within a batch, ensuring every OCEL
 * event has a globally unique `ocel:eid` within a single parsing call.
 * Reset on each call to `fromMarketplaceJsonl`.
 */
let _eidSerial = 0;

function resetEidSerial(): void {
  _eidSerial = 0;
}

function nextSerial(): number {
  return ++_eidSerial;
}

/**
 * Derives a candidate `ocel:eid` from a marketplace event.
 * Preference order:
 *   1. `order_id` (most specific transaction anchor)
 *   2. `listing_id`
 *   3. `event_type + ts` (universal fallback)
 *
 * The returned value is a base; callers must de-duplicate across a batch.
 */
function candidateEid(evt: MarketplaceEvent): string {
  if (typeof evt['order_id'] === 'string' && evt['order_id'].length > 0) {
    return `${evt['order_id']}-${evt.event_type}-${evt.ts}`;
  }
  if (typeof evt['listing_id'] === 'string' && evt['listing_id'].length > 0) {
    return `${evt['listing_id']}-${evt.event_type}-${evt.ts}`;
  }
  return `${evt.event_type}-${evt.ts}`;
}

// ---------------------------------------------------------------------------
// isMarketplaceEvent
// ---------------------------------------------------------------------------

/**
 * Type guard that checks whether an unknown value is a `MarketplaceEvent`.
 *
 * Requirements:
 * - Must be a non-null, non-array object.
 * - `event_type` must be a non-empty string.
 * - `ts` must be a non-empty string.
 *
 * @param raw - The value to check
 * @returns true if value satisfies the MarketplaceEvent contract
 */
export function isMarketplaceEvent(raw: unknown): raw is MarketplaceEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r['event_type'] === 'string' &&
    r['event_type'].length > 0 &&
    typeof r['ts'] === 'string' &&
    r['ts'].length > 0
  );
}

// ---------------------------------------------------------------------------
// adaptMarketplaceEvent
// ---------------------------------------------------------------------------

/**
 * Converts a single `MarketplaceEvent` to an OCEL 2.0 `OcelEvent`.
 *
 * Mapping:
 * - `event_type`        → `ocel:activity`
 * - `ts`                → `ocel:timestamp` (normalised to ISO-8601 with Z)
 * - candidate eid       → `ocel:eid` (order_id | listing_id | event_type+ts)
 * - id-valued fields    → `ocel:omap` (e.g. "ord-007", "lst-001", "usr-42")
 * - all remaining fields → `ocel:vmap` (including the `_id` source keys)
 *
 * The `ts` field is excluded from `ocel:vmap` because it is promoted to
 * `ocel:timestamp`. The `event_type` field is excluded because it is promoted
 * to `ocel:activity`.
 *
 * @param evt - A validated MarketplaceEvent
 * @returns An OcelEvent ready for the wasm4pm OCEL pipeline
 */
export function adaptMarketplaceEvent(evt: MarketplaceEvent): OcelEvent {
  const omap: string[] = [];
  const vmap: Record<string, unknown> = {};

  // Walk all keys except the promoted ones
  for (const [key, value] of Object.entries(evt)) {
    if (key === 'event_type' || key === 'ts') continue;

    const objectType = objectTypeFromKey(key);
    if (objectType !== null && typeof value === 'string' && value.length > 0) {
      // Collect object reference for omap; also put it in vmap for discoverability
      omap.push(value);
      vmap[key] = value;
    } else {
      vmap[key] = value;
    }
  }

  return {
    'ocel:eid': candidateEid(evt),
    'ocel:activity': evt.event_type,
    'ocel:timestamp': normaliseTimestamp(evt.ts),
    'ocel:omap': omap,
    'ocel:vmap': vmap,
  };
}

// ---------------------------------------------------------------------------
// fromMarketplaceJsonl
// ---------------------------------------------------------------------------

/**
 * Parses a newline-delimited JSON string where each line is a raw marketplace
 * event, and converts each valid line to an OCEL 2.0 event.
 *
 * Lenient parsing rules:
 * - Blank lines (whitespace-only) are silently skipped.
 * - Lines that are not valid JSON are silently skipped.
 * - Lines that parse to JSON but fail `isMarketplaceEvent` are silently skipped
 *   (missing `event_type` or `ts`).
 *
 * EID uniqueness:
 * - If two events produce the same candidate EID, a monotonically increasing
 *   serial suffix is appended to make each EID unique within the batch.
 *
 * @param ndjson - Newline-delimited JSON with one marketplace event per line
 * @returns Array of OCEL events in input order (invalid lines excluded)
 */
export function fromMarketplaceJsonl(ndjson: string): OcelEvent[] {
  resetEidSerial();

  const seenEids = new Set<string>();
  const result: OcelEvent[] = [];

  for (const line of ndjson.split('\n')) {
    if (line.trim().length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Silently skip invalid JSON
      continue;
    }

    if (!isMarketplaceEvent(parsed)) continue;

    const adapted = adaptMarketplaceEvent(parsed);

    // Enforce eid uniqueness within this batch
    let eid = adapted['ocel:eid'];
    if (seenEids.has(eid)) {
      eid = `${eid}-${nextSerial()}`;
      adapted['ocel:eid'] = eid;
    }
    seenEids.add(eid);

    result.push(adapted);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Object type extraction utility (used by receipt builder)
// ---------------------------------------------------------------------------

/**
 * Extracts the set of unique object type names that would appear in the
 * `ocel:omap` dimension of an adapted marketplace event batch.
 *
 * Used by `buildMarketplaceReceipt` to populate `object_types`.
 *
 * @param events - Raw marketplace events (before adaptation)
 * @returns Sorted array of unique object type strings
 */
export function extractObjectTypes(events: MarketplaceEvent[]): string[] {
  const types = new Set<string>();
  for (const evt of events) {
    for (const key of Object.keys(evt)) {
      const objectType = objectTypeFromKey(key);
      if (objectType !== null) {
        types.add(objectType);
      }
    }
  }
  return [...types].sort();
}

/**
 * Counts unique values of a specific id key across a batch of marketplace events.
 *
 * @param events - Raw marketplace events
 * @param idKey - The id field to count unique values for (e.g. "order_id")
 * @returns Count of unique non-empty string values for that key
 */
export function countUniqueIds(events: MarketplaceEvent[], idKey: string): number {
  const seen = new Set<string>();
  for (const evt of events) {
    const val = evt[idKey];
    if (typeof val === 'string' && val.length > 0) {
      seen.add(val);
    }
  }
  return seen.size;
}
