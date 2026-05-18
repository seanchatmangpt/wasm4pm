/**
 * OCEL Bridge Tests
 *
 * Verifies that wasm4pm Receipts convert to OCEL 2.0 events correctly,
 * that NDJSON serialisation round-trips faithfully, and that all required
 * `ocel:` prefix keys are present on every event.
 */

import { describe, it, expect } from 'vitest';
import type { Receipt } from '../receipt';
import {
  receiptToOcelEvents,
  toOcelJsonl,
  fromMcppJsonl,
} from '../ocel-bridge';
import { emitReceiptEmit } from '../receipt-emit-bridge';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const RUN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const START_TIME = '2026-05-16T10:00:00.000Z';
const END_TIME = '2026-05-16T10:00:05.000Z';

/** Minimal valid Receipt for a successful run. */
function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    run_id: RUN_ID,
    schema_version: '1.0',
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: START_TIME,
    end_time: END_TIME,
    duration_ms: 5000,
    status: 'success',
    summary: {
      traces_processed: 42,
      objects_processed: 100,
      variants_discovered: 7,
    },
    algorithm: {
      name: 'alpha-plus-plus',
      version: '2.1.0',
      parameters: { threshold: 0.8 },
    },
    model: { nodes: 5, edges: 8 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// receiptToOcelEvents
// ---------------------------------------------------------------------------

describe('receiptToOcelEvents', () => {
  describe('event count', () => {
    it('produces exactly 3 events for a successful (admitted) receipt', () => {
      const events = receiptToOcelEvents(makeReceipt({ status: 'success' }));
      expect(events).toHaveLength(3);
    });

    it('produces exactly 3 events for a failed (refused) receipt', () => {
      const events = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
      expect(events).toHaveLength(3);
    });

    it('produces exactly 3 events for a partial receipt', () => {
      const events = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
      expect(events).toHaveLength(3);
    });
  });

  describe('event ID patterns', () => {
    it('first event ID is ${run_id}-start', () => {
      const [first] = receiptToOcelEvents(makeReceipt());
      expect(first['ocel:eid']).toBe(`${RUN_ID}-start`);
    });

    it('second event ID is ${run_id}-complete', () => {
      const [, second] = receiptToOcelEvents(makeReceipt());
      expect(second['ocel:eid']).toBe(`${RUN_ID}-complete`);
    });

    it('third event ID is ${run_id}-verdict', () => {
      const [, , third] = receiptToOcelEvents(makeReceipt());
      expect(third['ocel:eid']).toBe(`${RUN_ID}-verdict`);
    });
  });

  describe('event activity labels', () => {
    it('first event activity is "algorithm.start"', () => {
      const [first] = receiptToOcelEvents(makeReceipt());
      expect(first['ocel:activity']).toBe('algorithm.start');
    });

    it('second event activity is "algorithm.complete"', () => {
      const [, second] = receiptToOcelEvents(makeReceipt());
      expect(second['ocel:activity']).toBe('algorithm.complete');
    });

    it('third event activity is "admitted" when status is "success"', () => {
      const [, , verdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
      expect(verdict['ocel:activity']).toBe('admitted');
    });

    it('third event activity is "refused" when status is "failed"', () => {
      const [, , verdict] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
      expect(verdict['ocel:activity']).toBe('refused');
    });

    it('third event activity is "refused" when status is "partial"', () => {
      const [, , verdict] = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
      expect(verdict['ocel:activity']).toBe('refused');
    });
  });

  describe('event timestamps', () => {
    it('algorithm.start uses start_time', () => {
      const [first] = receiptToOcelEvents(makeReceipt());
      expect(first['ocel:timestamp']).toBe(START_TIME);
    });

    it('algorithm.complete uses end_time', () => {
      const [, second] = receiptToOcelEvents(makeReceipt());
      expect(second['ocel:timestamp']).toBe(END_TIME);
    });

    it('verdict event uses end_time', () => {
      const [, , third] = receiptToOcelEvents(makeReceipt());
      expect(third['ocel:timestamp']).toBe(END_TIME);
    });
  });

  describe('event vmap fields', () => {
    it('algorithm.start vmap contains algorithm name and version', () => {
      const [first] = receiptToOcelEvents(makeReceipt());
      expect(first['ocel:vmap']).toMatchObject({
        algorithm: 'alpha-plus-plus',
        version: '2.1.0',
      });
    });

    it('algorithm.complete vmap contains status, traces, variants', () => {
      const [, second] = receiptToOcelEvents(makeReceipt());
      expect(second['ocel:vmap']).toMatchObject({
        status: 'success',
        traces: 42,
        variants: 7,
      });
    });

    it('algorithm.complete vmap contains mcpp.conformance.fitness = 1.0 for success', () => {
      const [, second] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
      expect((second['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness']).toBe(1.0);
    });

    it('algorithm.complete vmap contains mcpp.conformance.fitness = 0.0 for failed', () => {
      const [, second] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
      expect((second['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness']).toBe(0.0);
    });

    it('verdict vmap contains algorithm name', () => {
      const [, , third] = receiptToOcelEvents(makeReceipt());
      expect((third['ocel:vmap'] as Record<string, unknown>).algorithm).toBe('alpha-plus-plus');
    });

    it('verdict vmap contains mcpp.claim.source = "wasm4pm"', () => {
      const [, , verdict] = receiptToOcelEvents(makeReceipt());
      expect((verdict['ocel:vmap'] as Record<string, unknown>)['mcpp.claim.source']).toBe('wasm4pm');
    });
  });

  describe('omap object references', () => {
    it('all events include the run_id in ocel:omap', () => {
      const events = receiptToOcelEvents(makeReceipt());
      for (const event of events) {
        expect(event['ocel:omap']).toContain(RUN_ID);
      }
    });
  });

  describe('required OCEL 2.0 fields', () => {
    it('every event has ocel:eid, ocel:activity, ocel:timestamp, ocel:omap, ocel:vmap', () => {
      const events = receiptToOcelEvents(makeReceipt());
      for (const event of events) {
        expect(event).toHaveProperty('ocel:eid');
        expect(event).toHaveProperty('ocel:activity');
        expect(event).toHaveProperty('ocel:timestamp');
        expect(event).toHaveProperty('ocel:omap');
        expect(event).toHaveProperty('ocel:vmap');
      }
    });

    it('ocel:eid is a non-empty string for every event', () => {
      const events = receiptToOcelEvents(makeReceipt());
      for (const event of events) {
        expect(typeof event['ocel:eid']).toBe('string');
        expect(event['ocel:eid'].length).toBeGreaterThan(0);
      }
    });

    it('ocel:omap is an array for every event', () => {
      const events = receiptToOcelEvents(makeReceipt());
      for (const event of events) {
        expect(Array.isArray(event['ocel:omap'])).toBe(true);
      }
    });

    it('ocel:vmap is an object for every event', () => {
      const events = receiptToOcelEvents(makeReceipt());
      for (const event of events) {
        expect(typeof event['ocel:vmap']).toBe('object');
        expect(event['ocel:vmap']).not.toBeNull();
      }
    });
  });

  describe('chronological ordering', () => {
    it('events are in chronological order (start, complete, verdict)', () => {
      const events = receiptToOcelEvents(makeReceipt());
      const [start, complete, verdict] = events;
      expect(start['ocel:activity']).toBe('algorithm.start');
      expect(complete['ocel:activity']).toBe('algorithm.complete');
      expect(['admitted', 'refused']).toContain(verdict['ocel:activity']);
    });
  });
});

// ---------------------------------------------------------------------------
// toOcelJsonl
// ---------------------------------------------------------------------------

describe('toOcelJsonl', () => {
  it('serialises each event to one JSON line', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const jsonl = toOcelJsonl(events);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('each line is valid JSON', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const jsonl = toOcelJsonl(events);
    for (const line of jsonl.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('does not end with a trailing newline', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const jsonl = toOcelJsonl(events);
    expect(jsonl.endsWith('\n')).toBe(false);
  });

  it('serialises an empty array to an empty string', () => {
    expect(toOcelJsonl([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// fromMcppJsonl
// ---------------------------------------------------------------------------

describe('fromMcppJsonl', () => {
  it('parses NDJSON back to an array of events', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const ndjson = toOcelJsonl(events);
    const parsed = fromMcppJsonl(ndjson);
    expect(parsed).toHaveLength(3);
  });

  it('returns an empty array for an empty string', () => {
    expect(fromMcppJsonl('')).toHaveLength(0);
  });

  it('returns an empty array for a string containing only whitespace/newlines', () => {
    expect(fromMcppJsonl('\n\n   \n')).toHaveLength(0);
  });

  it('silently skips blank lines between JSON objects', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const ndjsonWithBlanks = toOcelJsonl(events).replace('\n', '\n\n');
    const parsed = fromMcppJsonl(ndjsonWithBlanks);
    expect(parsed).toHaveLength(3);
  });

  it('throws SyntaxError for non-blank lines that are not valid JSON', () => {
    expect(() => fromMcppJsonl('not-valid-json')).toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// toOcelJsonl ∘ fromMcppJsonl round-trip
// ---------------------------------------------------------------------------

describe('round-trip: toOcelJsonl(fromMcppJsonl(ndjson))', () => {
  it('preserves event count through a full round-trip', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const ndjson = toOcelJsonl(original);
    const roundTripped = fromMcppJsonl(ndjson);
    expect(roundTripped).toHaveLength(original.length);
  });

  it('preserves ocel:eid for every event', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:eid']).toBe(original[i]['ocel:eid']);
    }
  });

  it('preserves ocel:activity for every event', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:activity']).toBe(original[i]['ocel:activity']);
    }
  });

  it('preserves ocel:timestamp for every event', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:timestamp']).toBe(original[i]['ocel:timestamp']);
    }
  });

  it('preserves ocel:omap for every event', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:omap']).toEqual(original[i]['ocel:omap']);
    }
  });

  it('preserves ocel:vmap for every event', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:vmap']).toEqual(original[i]['ocel:vmap']);
    }
  });

  it('is idempotent: re-serialising round-tripped events yields the same NDJSON', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const ndjson = toOcelJsonl(original);
    const ndjson2 = toOcelJsonl(fromMcppJsonl(ndjson));
    expect(ndjson2).toBe(ndjson);
  });

  it('works correctly with a refused receipt', () => {
    const original = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    expect(roundTripped[2]['ocel:activity']).toBe('refused');
  });
});

// ---------------------------------------------------------------------------
// ARGR metrics in algorithm.complete
// ---------------------------------------------------------------------------

describe('ARGR metrics in algorithm.complete', () => {
  it('algorithm.complete vmap contains powl.gap.argr when argr is provided', () => {
    const [, second] = receiptToOcelEvents(makeReceipt(), { rate: 0.75, handoverDensity: 3.2 });
    expect((second['ocel:vmap'] as Record<string, unknown>)['powl.gap.argr']).toBe(0.75);
  });

  it('algorithm.complete vmap has no powl.gap.argr when argr is not provided', () => {
    const [, second] = receiptToOcelEvents(makeReceipt());
    expect((second['ocel:vmap'] as Record<string, unknown>)['powl.gap.argr']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// emitReceiptEmit
// ---------------------------------------------------------------------------

describe('emitReceiptEmit', () => {
  it('emits receipt.emit span name', () => {
    const rec = emitReceiptEmit(makeReceipt());
    expect(rec.name).toBe('receipt.emit');
  });
  it('signer is proof_aggregator', () => {
    const rec = emitReceiptEmit(makeReceipt());
    expect(rec.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
  });
  it('signature is non-empty (output_hash)', () => {
    const rec = emitReceiptEmit(makeReceipt());
    expect(rec.fields['mcpp.receipt.signature'].length).toBeGreaterThan(0);
  });
  it('run.id matches receipt run_id', () => {
    const rec = emitReceiptEmit(makeReceipt());
    expect(rec.fields['run.id']).toBe(RUN_ID);
  });
});
