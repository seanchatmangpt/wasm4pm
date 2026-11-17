/**
 * Marketplace receipt format for wasm4pm process mining runs.
 *
 * A `MarketplaceReceipt` extends the base `Receipt` with marketplace-specific
 * telemetry fields that answer the practitioner questions:
 *   - Which activity types were observed? (event_types)
 *   - Which object types were involved? (object_types)
 *   - How many orders, listings, and users appeared in the log? (counts)
 *
 * This receipt type is the output of a marketplace OCEL pipeline run:
 *   raw NDJSON → fromMarketplaceJsonl → OcelEvent[] → buildMarketplaceReceipt
 *
 * The domain field is fixed at "marketplace" to enable downstream filtering
 * in mcpp's process miner without ambiguity.
 */
import { z } from 'zod';
import { ReceiptSchema } from './receipt.js';
// ---------------------------------------------------------------------------
// MarketplaceReceipt
// ---------------------------------------------------------------------------
export const MarketplaceReceiptSchema = z.object({
    ...ReceiptSchema.partial().shape,
    domain: z.literal('marketplace'),
    event_types: z.array(z.string()),
    object_types: z.array(z.string()),
    order_count: z.number().int().min(0),
    listing_count: z.number().int().min(0),
    user_count: z.number().int().min(0),
});
// ---------------------------------------------------------------------------
// isMarketplaceReceipt
// ---------------------------------------------------------------------------
/**
 * Type guard that checks whether a value is a `MarketplaceReceipt`.
 *
 * Checks structural presence of all marketplace-specific fields.
 *
 * @param value - The value to test
 * @returns true if value satisfies the MarketplaceReceipt structure
 */
export function isMarketplaceReceipt(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const r = value;
    return (r['domain'] === 'marketplace' &&
        Array.isArray(r['event_types']) &&
        Array.isArray(r['object_types']) &&
        typeof r['order_count'] === 'number' &&
        typeof r['listing_count'] === 'number' &&
        typeof r['user_count'] === 'number');
}
// ---------------------------------------------------------------------------
// buildMarketplaceReceipt
// ---------------------------------------------------------------------------
/**
 * Constructs a `MarketplaceReceipt` from an array of OCEL events produced by
 * `fromMarketplaceJsonl` and an optional partial base `Receipt`.
 *
 * The marketplace-specific fields are derived entirely from the event batch,
 * not from the base receipt, so they always reflect the actual log content.
 *
 * Object-type membership for count fields:
 * - `order_count`   — unique values in `ocel:vmap.order_id`
 * - `listing_count` — unique values in `ocel:vmap.listing_id`
 * - `user_count`    — union of `ocel:vmap.seller_id`, `ocel:vmap.buyer_id`,
 *                      and `ocel:vmap.user_id`
 *
 * @param events      - OCEL events produced by the marketplace bridge
 * @param baseReceipt - Optional partial Receipt fields to merge (run_id, hashes, etc.)
 * @returns A MarketplaceReceipt combining base fields with computed domain telemetry
 */
export function buildMarketplaceReceipt(events, baseReceipt = {}) {
    // Collect unique event_types from ocel:activity
    const eventTypeSet = new Set();
    // Collect unique object_types from ocel:omap — infer type from vmap id keys
    const objectTypeSet = new Set();
    // Count unique domain objects via vmap fields
    const orderIds = new Set();
    const listingIds = new Set();
    const userIds = new Set();
    for (const event of events) {
        // Activity labels
        if (event['ocel:activity']) {
            eventTypeSet.add(event['ocel:activity']);
        }
        // Extract object type hints from vmap id fields
        const vmap = event['ocel:vmap'];
        if (vmap && typeof vmap === 'object') {
            for (const [key, value] of Object.entries(vmap)) {
                if (!key.endsWith('_id') || typeof value !== 'string' || value.length === 0)
                    continue;
                // Derive object type from key
                const objectType = deriveObjectType(key);
                if (objectType)
                    objectTypeSet.add(objectType);
                // Domain-specific counting
                if (key === 'order_id')
                    orderIds.add(value);
                if (key === 'listing_id')
                    listingIds.add(value);
                if (key === 'seller_id' || key === 'buyer_id' || key === 'user_id')
                    userIds.add(value);
            }
        }
    }
    return {
        ...baseReceipt,
        domain: 'marketplace',
        event_types: [...eventTypeSet].sort(),
        object_types: [...objectTypeSet].sort(),
        order_count: orderIds.size,
        listing_count: listingIds.size,
        user_count: userIds.size,
    };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Derives an object type string from a vmap key ending in `_id`.
 * Uses the same canonical table as marketplace-bridge for consistency.
 */
function deriveObjectType(key) {
    if (!key.endsWith('_id'))
        return null;
    const canonical = {
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
    if (canonical[key])
        return canonical[key];
    // Fallback: strip _id suffix, add s
    return `${key.slice(0, -3)}s`;
}
//# sourceMappingURL=marketplace-receipt.js.map