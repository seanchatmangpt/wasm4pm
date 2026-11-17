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
/**
 * A raw marketplace domain event as emitted by the upstream commerce system.
 * The `event_type` and `ts` (ISO-8601 timestamp) fields are mandatory for
 * adaptation. All remaining fields become the OCEL value map or drive object
 * type inference.
 */
export declare const MarketplaceEventSchema: z.ZodObject<{
    event_type: z.ZodString;
    ts: z.ZodString;
}, "strip", z.ZodUnknown, z.objectOutputType<{
    event_type: z.ZodString;
    ts: z.ZodString;
}, z.ZodUnknown, "strip">, z.objectInputType<{
    event_type: z.ZodString;
    ts: z.ZodString;
}, z.ZodUnknown, "strip">>;
export type MarketplaceEvent = z.infer<typeof MarketplaceEventSchema>;
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
export declare function isMarketplaceEvent(raw: unknown): raw is MarketplaceEvent;
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
export declare function adaptMarketplaceEvent(evt: MarketplaceEvent): OcelEvent;
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
export declare function fromMarketplaceJsonl(ndjson: string): OcelEvent[];
/**
 * Extracts the set of unique object type names that would appear in the
 * `ocel:omap` dimension of an adapted marketplace event batch.
 *
 * Used by `buildMarketplaceReceipt` to populate `object_types`.
 *
 * @param events - Raw marketplace events (before adaptation)
 * @returns Sorted array of unique object type strings
 */
export declare function extractObjectTypes(events: MarketplaceEvent[]): string[];
/**
 * Counts unique values of a specific id key across a batch of marketplace events.
 *
 * @param events - Raw marketplace events
 * @param idKey - The id field to count unique values for (e.g. "order_id")
 * @returns Count of unique non-empty string values for that key
 */
export declare function countUniqueIds(events: MarketplaceEvent[], idKey: string): number;
//# sourceMappingURL=marketplace-bridge.d.ts.map