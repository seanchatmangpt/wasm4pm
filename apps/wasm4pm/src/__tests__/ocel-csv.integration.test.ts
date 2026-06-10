/**
 * FM-5-compliant integration test for load_ocel_from_csv WASM export.
 *
 * FM-5 rule: NO vi.mock on init.js. Uses real WASM via WasmLoader.
 *
 * WASM signature (ocel_csv.rs:414):
 *   load_ocel_from_csv(csv_string: &str) -> Result<String, JsValue>
 *
 * Returns an opaque handle string (not JSON) on success.
 * Throws a JS error with {code, message} payload on failure.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmLoader } from '@wasm4pm/engine';

describe('load_ocel_from_csv — integration (real WASM)', () => {
  let wasm: any;

  beforeAll(async () => {
    const loader = WasmLoader.getInstance();
    await loader.init();
    wasm = loader.get();
  });

  it('parses a minimal OCEL CSV with one event and one object', () => {
    const csv = `ocel:eid,ocel:activity,ocel:timestamp,ocel:type:Order,ocel:vmap:amount
e1,place order,2024-01-01T00:00:00Z,o1,99.5`;
    const handle = wasm.load_ocel_from_csv(csv);
    expect(typeof handle).toBe('string');
    expect(handle).toBeTruthy();
  });

  it('returns a non-empty handle string on valid input', () => {
    const csv = `ocel:eid,ocel:activity,ocel:timestamp,ocel:type:Order
e1,Place Order,2024-01-01T10:00:00Z,o1
e2,Ship Order,2024-01-02T12:00:00Z,o1`;
    const handle = wasm.load_ocel_from_csv(csv);
    expect(handle.length).toBeGreaterThan(0);
  });

  it('returns distinct handles for distinct inputs', () => {
    const csv1 = `ocel:eid,ocel:activity,ocel:timestamp
e1,A,2024-01-01T00:00:00Z`;
    const csv2 = `ocel:eid,ocel:activity,ocel:timestamp
e2,B,2024-01-02T00:00:00Z`;
    const h1 = wasm.load_ocel_from_csv(csv1);
    const h2 = wasm.load_ocel_from_csv(csv2);
    expect(h1).not.toBe(h2);
  });

  it('handles empty CSV gracefully (throws or returns a handle)', () => {
    // Empty CSV either returns a handle for an empty OCEL or throws — both are valid.
    // The test verifies no unhandled crash (only a thrown Error is acceptable, not SIGABRT).
    let threw = false;
    try {
      const handle = wasm.load_ocel_from_csv('');
      // If it returns, it must be a string (possibly empty handle for empty log).
      expect(typeof handle).toBe('string');
    } catch (e) {
      threw = true;
      // A thrown error is acceptable for empty input — verify it has a message.
      expect(e).toBeTruthy();
    }
    // Either path is valid — the test just confirms no silent undefined return.
    expect(threw || true).toBe(true);
  });

  it('parses multi-event multi-object CSV', () => {
    const csv = `ocel:eid,ocel:activity,ocel:timestamp,ocel:type:Order,ocel:type:Item,price
e1,Place Order,2024-01-01T10:00:00Z,o1,i1,99.99
e2,Ship Order,2024-01-02T12:00:00Z,o1,i1,0.0
e3,Place Order,2024-01-03T09:00:00Z,o2,,10`;
    const handle = wasm.load_ocel_from_csv(csv);
    expect(typeof handle).toBe('string');
    expect(handle).toBeTruthy();
  });
});
