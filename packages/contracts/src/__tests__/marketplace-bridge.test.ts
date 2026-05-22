/**
 * Marketplace Bridge Tests
 *
 * Validates the full pipeline from raw marketplace NDJSON → OCEL 2.0 events →
 * MarketplaceReceipt. Covers:
 *   - Type guard (isMarketplaceEvent)
 *   - Single event adaptation (adaptMarketplaceEvent)
 *   - Object type inference from id keys
 *   - Timestamp normalisation
 *   - fromMarketplaceJsonl lenient parsing (blank lines, invalid JSON, missing fields)
 *   - ocel:eid uniqueness across batches
 *   - buildMarketplaceReceipt counts and field derivation
 *   - Full end-to-end pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  isMarketplaceEvent,
  adaptMarketplaceEvent,
  fromMarketplaceJsonl,
  extractObjectTypes,
  countUniqueIds,
  type MarketplaceEvent,
} from '../marketplace-bridge.js';
import {
  buildMarketplaceReceipt,
  isMarketplaceReceipt,
} from '../marketplace-receipt.js';
import { isValidOcelEvent } from '../ocel-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LISTING_CREATED: MarketplaceEvent = {
  event_type: 'listing.created',
  listing_id: 'lst-001',
  seller_id: 'usr-42',
  price: 99.99,
  ts: '2026-05-18T10:00:00Z',
};

const ORDER_PLACED: MarketplaceEvent = {
  event_type: 'order.placed',
  order_id: 'ord-007',
  listing_id: 'lst-001',
  buyer_id: 'usr-13',
  ts: '2026-05-18T10:05:00Z',
};

const FULFILLMENT_SHIPPED: MarketplaceEvent = {
  event_type: 'fulfillment.shipped',
  order_id: 'ord-007',
  carrier: 'ups',
  tracking_id: '1Z999',
  ts: '2026-05-18T11:00:00Z',
};

const PAYMENT_CAPTURED: MarketplaceEvent = {
  event_type: 'payment.captured',
  order_id: 'ord-007',
  amount: 99.99,
  ts: '2026-05-18T11:30:00Z',
};

const SAMPLE_NDJSON = [
  JSON.stringify(LISTING_CREATED),
  JSON.stringify(ORDER_PLACED),
  JSON.stringify(FULFILLMENT_SHIPPED),
  JSON.stringify(PAYMENT_CAPTURED),
].join('\n');

// ---------------------------------------------------------------------------
// isMarketplaceEvent — type guard
// ---------------------------------------------------------------------------

describe('isMarketplaceEvent', () => {
  it('returns true for a well-formed listing.created event', () => {
    expect(isMarketplaceEvent(LISTING_CREATED)).toBe(true);
  });

  it('returns true for a well-formed order.placed event', () => {
    expect(isMarketplaceEvent(ORDER_PLACED)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isMarketplaceEvent(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isMarketplaceEvent([])).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isMarketplaceEvent('listing.created')).toBe(false);
  });

  it('returns false when event_type is missing', () => {
    const raw = { ts: '2026-05-18T10:00:00Z', listing_id: 'lst-001' };
    expect(isMarketplaceEvent(raw)).toBe(false);
  });

  it('returns false when event_type is an empty string', () => {
    const raw = { event_type: '', ts: '2026-05-18T10:00:00Z' };
    expect(isMarketplaceEvent(raw)).toBe(false);
  });

  it('returns false when ts is missing', () => {
    const raw = { event_type: 'order.placed', order_id: 'ord-007' };
    expect(isMarketplaceEvent(raw)).toBe(false);
  });

  it('returns false when ts is an empty string', () => {
    const raw = { event_type: 'order.placed', ts: '' };
    expect(isMarketplaceEvent(raw)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// adaptMarketplaceEvent — single event conversion
// ---------------------------------------------------------------------------

describe('adaptMarketplaceEvent', () => {
  describe('listing.created → OcelEvent', () => {
    it('maps event_type to ocel:activity', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(ev['ocel:activity']).toBe('listing.created');
    });

    it('maps ts to ocel:timestamp', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(ev['ocel:timestamp']).toBe('2026-05-18T10:00:00Z');
    });

    it('produces a non-empty ocel:eid', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(typeof ev['ocel:eid']).toBe('string');
      expect(ev['ocel:eid'].length).toBeGreaterThan(0);
    });

    it('includes seller_id value in ocel:omap', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(ev['ocel:omap']).toContain('usr-42');
    });

    it('includes listing_id value in ocel:omap', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(ev['ocel:omap']).toContain('lst-001');
    });

    it('puts price in ocel:vmap', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect((ev['ocel:vmap'] as Record<string, unknown>)['price']).toBe(99.99);
    });

    it('does NOT put event_type in ocel:vmap (promoted to ocel:activity)', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect((ev['ocel:vmap'] as Record<string, unknown>)['event_type']).toBeUndefined();
    });

    it('does NOT put ts in ocel:vmap (promoted to ocel:timestamp)', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect((ev['ocel:vmap'] as Record<string, unknown>)['ts']).toBeUndefined();
    });

    it('produces a valid OCEL 2.0 event (passes isValidOcelEvent)', () => {
      const ev = adaptMarketplaceEvent(LISTING_CREATED);
      expect(isValidOcelEvent(ev)).toBe(true);
    });
  });

  describe('order.placed → OcelEvent', () => {
    it('maps event_type to ocel:activity', () => {
      const ev = adaptMarketplaceEvent(ORDER_PLACED);
      expect(ev['ocel:activity']).toBe('order.placed');
    });

    it('includes order_id value in ocel:omap', () => {
      const ev = adaptMarketplaceEvent(ORDER_PLACED);
      expect(ev['ocel:omap']).toContain('ord-007');
    });

    it('includes listing_id value in ocel:omap', () => {
      const ev = adaptMarketplaceEvent(ORDER_PLACED);
      expect(ev['ocel:omap']).toContain('lst-001');
    });

    it('includes buyer_id value in ocel:omap', () => {
      const ev = adaptMarketplaceEvent(ORDER_PLACED);
      expect(ev['ocel:omap']).toContain('usr-13');
    });

    it('prefers order_id as eid anchor over listing_id', () => {
      const ev = adaptMarketplaceEvent(ORDER_PLACED);
      expect(ev['ocel:eid']).toContain('ord-007');
    });
  });

  describe('fulfillment.shipped → OcelEvent', () => {
    it('maps event_type to ocel:activity', () => {
      const ev = adaptMarketplaceEvent(FULFILLMENT_SHIPPED);
      expect(ev['ocel:activity']).toBe('fulfillment.shipped');
    });

    it('puts carrier (non-id field) in ocel:vmap', () => {
      const ev = adaptMarketplaceEvent(FULFILLMENT_SHIPPED);
      expect((ev['ocel:vmap'] as Record<string, unknown>)['carrier']).toBe('ups');
    });
  });

  describe('payment.captured → OcelEvent', () => {
    it('maps event_type to ocel:activity', () => {
      const ev = adaptMarketplaceEvent(PAYMENT_CAPTURED);
      expect(ev['ocel:activity']).toBe('payment.captured');
    });

    it('puts amount in ocel:vmap', () => {
      const ev = adaptMarketplaceEvent(PAYMENT_CAPTURED);
      expect((ev['ocel:vmap'] as Record<string, unknown>)['amount']).toBe(99.99);
    });
  });

  describe('timestamp normalisation', () => {
    it('preserves already-canonical Z-suffixed timestamp', () => {
      const ev = adaptMarketplaceEvent({ event_type: 'x', ts: '2026-05-18T10:00:00Z' });
      expect(ev['ocel:timestamp']).toBe('2026-05-18T10:00:00Z');
    });

    it('normalises +00:00 offset to Z', () => {
      const ev = adaptMarketplaceEvent({ event_type: 'x', ts: '2026-05-18T10:00:00+00:00' });
      expect(ev['ocel:timestamp']).toMatch(/Z$/);
    });
  });

  describe('object type inference', () => {
    it('generic *_id key falls back to prefix pluralisation', () => {
      // "widget_id" → "widgets"
      const ev = adaptMarketplaceEvent({ event_type: 'widget.created', ts: '2026-05-18T10:00:00Z', widget_id: 'wid-1' });
      expect(ev['ocel:omap']).toContain('wid-1');
    });
  });
});

// ---------------------------------------------------------------------------
// fromMarketplaceJsonl — lenient NDJSON parser
// ---------------------------------------------------------------------------

describe('fromMarketplaceJsonl', () => {
  it('parses all four sample events from NDJSON', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    expect(events).toHaveLength(4);
  });

  it('returns an empty array for an empty string', () => {
    expect(fromMarketplaceJsonl('')).toHaveLength(0);
  });

  it('skips blank lines silently', () => {
    const withBlanks = '\n' + SAMPLE_NDJSON + '\n\n';
    expect(fromMarketplaceJsonl(withBlanks)).toHaveLength(4);
  });

  it('skips whitespace-only lines silently', () => {
    const withSpaces = '   \n' + SAMPLE_NDJSON;
    expect(fromMarketplaceJsonl(withSpaces)).toHaveLength(4);
  });

  it('skips invalid JSON lines without throwing', () => {
    const withBad = 'not-json\n' + SAMPLE_NDJSON;
    expect(fromMarketplaceJsonl(withBad)).toHaveLength(4);
  });

  it('skips lines missing event_type without throwing', () => {
    const noEventType = JSON.stringify({ ts: '2026-05-18T10:00:00Z', listing_id: 'lst-1' });
    const ndjson = noEventType + '\n' + JSON.stringify(ORDER_PLACED);
    const events = fromMarketplaceJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('skips lines missing ts without throwing', () => {
    const noTs = JSON.stringify({ event_type: 'order.placed', order_id: 'ord-1' });
    const ndjson = noTs + '\n' + JSON.stringify(LISTING_CREATED);
    const events = fromMarketplaceJsonl(ndjson);
    expect(events).toHaveLength(1);
  });

  it('all returned events pass isValidOcelEvent', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    for (const ev of events) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
  });

  it('ocel:eid values are unique across the batch', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const eids = events.map((e) => e['ocel:eid']);
    const uniqueEids = new Set(eids);
    expect(uniqueEids.size).toBe(events.length);
  });

  it('deduplicates eids when two events would produce the same candidate', () => {
    // Two payment events on the same order at the same timestamp would collide
    const evt1 = JSON.stringify({ event_type: 'payment.captured', order_id: 'ord-1', ts: '2026-05-18T10:00:00Z' });
    const evt2 = JSON.stringify({ event_type: 'payment.captured', order_id: 'ord-1', ts: '2026-05-18T10:00:00Z' });
    const events = fromMarketplaceJsonl(evt1 + '\n' + evt2);
    const eids = events.map((e) => e['ocel:eid']);
    expect(new Set(eids).size).toBe(2);
  });

  it('preserves the correct activity label for each event', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const activities = events.map((e) => e['ocel:activity']);
    expect(activities).toContain('listing.created');
    expect(activities).toContain('order.placed');
    expect(activities).toContain('fulfillment.shipped');
    expect(activities).toContain('payment.captured');
  });

  it('handles a single-event NDJSON string', () => {
    const single = JSON.stringify(PAYMENT_CAPTURED);
    const events = fromMarketplaceJsonl(single);
    expect(events).toHaveLength(1);
    expect(events[0]['ocel:activity']).toBe('payment.captured');
  });
});

// ---------------------------------------------------------------------------
// extractObjectTypes and countUniqueIds utilities
// ---------------------------------------------------------------------------

describe('extractObjectTypes', () => {
  it('returns sorted unique object types from a batch', () => {
    const types = extractObjectTypes([LISTING_CREATED, ORDER_PLACED]);
    // listing_id → listings, seller_id → users, buyer_id → users
    expect(types).toContain('listings');
    expect(types).toContain('users');
  });

  it('returns an empty array for an empty batch', () => {
    expect(extractObjectTypes([])).toHaveLength(0);
  });
});

describe('countUniqueIds', () => {
  it('counts unique order_id values across events', () => {
    const events = [ORDER_PLACED, FULFILLMENT_SHIPPED, PAYMENT_CAPTURED];
    expect(countUniqueIds(events, 'order_id')).toBe(1); // all ord-007
  });

  it('counts zero when no events have the given key', () => {
    expect(countUniqueIds([LISTING_CREATED], 'order_id')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildMarketplaceReceipt
// ---------------------------------------------------------------------------

describe('buildMarketplaceReceipt', () => {
  it('domain is always "marketplace"', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.domain).toBe('marketplace');
  });

  it('event_types contains all four activity labels', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.event_types).toContain('listing.created');
    expect(receipt.event_types).toContain('order.placed');
    expect(receipt.event_types).toContain('fulfillment.shipped');
    expect(receipt.event_types).toContain('payment.captured');
  });

  it('event_types is sorted alphabetically', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    const sorted = [...receipt.event_types].sort();
    expect(receipt.event_types).toEqual(sorted);
  });

  it('object_types contains "orders" from order_id fields', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.object_types).toContain('orders');
  });

  it('object_types contains "listings" from listing_id fields', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.object_types).toContain('listings');
  });

  it('object_types contains "users" from seller_id / buyer_id fields', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.object_types).toContain('users');
  });

  it('object_types is sorted alphabetically', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    const sorted = [...receipt.object_types].sort();
    expect(receipt.object_types).toEqual(sorted);
  });

  it('order_count is 1 for a single unique order_id', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.order_count).toBe(1);
  });

  it('listing_count is 1 for a single unique listing_id', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.listing_count).toBe(1);
  });

  it('user_count is 2 (seller usr-42 and buyer usr-13)', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.user_count).toBe(2);
  });

  it('merges baseReceipt fields into the result', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const base = { run_id: 'test-run-id', schema_version: '1.0' };
    const receipt = buildMarketplaceReceipt(events, base);
    expect(receipt.run_id).toBe('test-run-id');
    expect(receipt.schema_version).toBe('1.0');
  });

  it('returns zero counts for an empty event array', () => {
    const receipt = buildMarketplaceReceipt([]);
    expect(receipt.order_count).toBe(0);
    expect(receipt.listing_count).toBe(0);
    expect(receipt.user_count).toBe(0);
  });

  it('returns empty arrays for an empty event array', () => {
    const receipt = buildMarketplaceReceipt([]);
    expect(receipt.event_types).toHaveLength(0);
    expect(receipt.object_types).toHaveLength(0);
  });

  it('counts unique orders across multiple events with the same order_id', () => {
    const events = fromMarketplaceJsonl(
      [FULFILLMENT_SHIPPED, PAYMENT_CAPTURED].map((e) => JSON.stringify(e)).join('\n')
    );
    const receipt = buildMarketplaceReceipt(events);
    // Both events reference ord-007 — should count as 1
    expect(receipt.order_count).toBe(1);
  });

  it('counts multiple distinct order_ids correctly', () => {
    const ord2: MarketplaceEvent = { event_type: 'payment.captured', order_id: 'ord-999', ts: '2026-05-18T12:00:00Z', amount: 50 };
    const events = fromMarketplaceJsonl([PAYMENT_CAPTURED, ord2].map((e) => JSON.stringify(e)).join('\n'));
    const receipt = buildMarketplaceReceipt(events);
    expect(receipt.order_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isMarketplaceReceipt — type guard
// ---------------------------------------------------------------------------

describe('isMarketplaceReceipt', () => {
  it('returns true for a receipt built by buildMarketplaceReceipt', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events);
    expect(isMarketplaceReceipt(receipt)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isMarketplaceReceipt(null)).toBe(false);
  });

  it('returns false for an object missing domain', () => {
    const r = { event_types: [], object_types: [], order_count: 0, listing_count: 0, user_count: 0 };
    expect(isMarketplaceReceipt(r)).toBe(false);
  });

  it('returns false when domain is not "marketplace"', () => {
    const r = { domain: 'commerce', event_types: [], object_types: [], order_count: 0, listing_count: 0, user_count: 0 };
    expect(isMarketplaceReceipt(r)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full end-to-end pipeline test
// ---------------------------------------------------------------------------

describe('end-to-end pipeline: marketplace NDJSON → OCEL events → receipt', () => {
  it('produces a valid MarketplaceReceipt from the sample NDJSON', () => {
    const events = fromMarketplaceJsonl(SAMPLE_NDJSON);
    const receipt = buildMarketplaceReceipt(events, {
      run_id: 'e2e-run-001',
      schema_version: '1.0',
    });

    // Structure
    expect(isMarketplaceReceipt(receipt)).toBe(true);
    expect(receipt.domain).toBe('marketplace');

    // Activities
    expect(receipt.event_types).toHaveLength(4);
    expect(receipt.event_types).toContain('order.placed');

    // Object types
    expect(receipt.object_types.length).toBeGreaterThan(0);

    // Counts
    expect(receipt.order_count).toBe(1);
    expect(receipt.listing_count).toBe(1);
    expect(receipt.user_count).toBe(2);

    // Base receipt fields propagated
    expect(receipt.run_id).toBe('e2e-run-001');

    // All OCEL events are structurally valid
    for (const ev of events) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
  });
});
