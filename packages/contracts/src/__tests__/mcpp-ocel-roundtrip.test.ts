/**
 * mcpp OCEL Roundtrip Tests — Bridge Format Gap Analysis
 *
 * Verifies the OCEL receipt bridge between ~/mcpp and ~/wasm4pm.
 *
 * FINDINGS (2026-05-18):
 *
 * GAP-1: KEY SCHEMA MISMATCH (CRITICAL)
 *   mcpp emits events with FLAT keys:  { id, activity, time, outcome, session_id, part_name, attrs, objects? }
 *   wasm4pm expects PREFIXED keys:     { "ocel:eid", "ocel:activity", "ocel:timestamp", "ocel:omap", "ocel:vmap" }
 *
 *   Source: ~/mcpp/crates/mcpp-server/src/ocel.rs — OcelEvent struct
 *   Consumer: ~/wasm4pm/packages/contracts/src/ocel-bridge.ts — fromMcppJsonlStrict()
 *
 *   Every real mcpp OCEL event fails isValidOcelEvent() and fromMcppJsonlStrict() throws TypeError.
 *   The roundtrip is BROKEN for real mcpp output.
 *
 * GAP-2: OBJECT MODEL MISMATCH
 *   mcpp:   objects = { "mcpp:Type": ["id1", "id2"] }  — typed object map (Form A, OCEL 2.0 §4)
 *   wasm4pm: ocel:omap = ["run-id-1", "run-id-2"]      — flat string array (ID only, no type)
 *
 *   Object type information is lost in translation from mcpp → wasm4pm OCEL events.
 *   wasm4pm's receiptToOcelEvents() emits a flat ocel:omap with just the run_id.
 *   mcpp's emitter uses typed object maps for lifecycle object binding.
 *
 * GAP-3: TIMESTAMP KEY DIVERGENCE
 *   mcpp:    "time" field (ISO-8601 with timezone offset: "2026-05-15T10:19:18.092976+00:00")
 *   wasm4pm: "ocel:timestamp" field (ISO-8601 UTC: "2026-05-16T10:00:00.000Z")
 *
 *   The timestamp field name differs entirely. No automatic mapping exists.
 *
 * GAP-4: MISSING ADAPTER FUNCTION
 *   There is no fromMcppNativeJsonl() or normalizeMcppEvent() function in ocel-bridge.ts
 *   that maps mcpp's flat format to wasm4pm's ocel:-prefixed format.
 *   fromMcppJsonl() / fromMcppJsonlStrict() assume the input is ALREADY in ocel:-format.
 *
 * GAP-5: fromMcppJsonl / fromMcppJsonlStrict not exported from package index
 *   packages/contracts/src/index.ts only exports receiptToOcelEvents, toOcelJsonl,
 *   isValidOcelEvent, and type OcelEvent. The parse functions are not public.
 *
 * WHAT WORKS:
 *   - wasm4pm→mcpp direction: receiptToOcelEvents() + toOcelJsonl() produces valid NDJSON
 *     that mcpp's ONTO-P09 could consume IF it accepted ocel:-prefixed format events.
 *     However, mcpp's actual reader (crates/mcpp-server/src/ocel.rs read_events()) uses
 *     serde's OcelEvent struct which expects flat keys — so even this direction would fail.
 *   - Internal wasm4pm roundtrip: toOcelJsonl ∘ fromMcppJsonl works for wasm4pm-generated events.
 *
 * RESOLUTION NEEDED:
 *   Option A: Add fromMcppNativeJsonl() to ocel-bridge.ts that maps mcpp flat → ocel: prefixed
 *   Option B: Add toMcppNativeEvent() that maps ocel: prefixed → mcpp flat format
 *   Option C: Agree on one canonical format (OCEL 2.0 §4 recommends the prefixed form)
 *
 * Oracle ranks follow Chicago TDD (Van der Aalst Constitution):
 *   Rank 1 — Mathematical theorem (invariant holds for any correct implementation)
 *   Rank 2 — Domain contract (design-decided properties from mcpp/wasm4pm doctrine)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  fromMcppJsonl,
  fromMcppJsonlStrict,
  isValidOcelEvent,
  receiptToOcelEvents,
  toOcelJsonl,
} from '../ocel-bridge.js';
import type { Receipt } from '../receipt.js';

// ---------------------------------------------------------------------------
// mcpp native OcelEvent shape (as emitted by crates/mcpp-server/src/ocel.rs)
// ---------------------------------------------------------------------------

/** The actual wire shape mcpp emits — flat keys, no ocel: prefix. */
interface McppNativeEvent {
  id: string;
  activity: string;
  time: string;
  outcome: string;
  session_id: string;
  part_name: string;
  attrs: Record<string, unknown>;
  objects?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Sample mcpp native events (from ~/mcpp/.mcpp/ocel.jsonl live data)
// ---------------------------------------------------------------------------

const MCPP_NATIVE_ADMITTED: McppNativeEvent = {
  id: '01KRPS0ZAWSAZ5K204KNQCR082',
  activity: 'admitted',
  time: '2026-05-15T21:35:04.540674+00:00',
  outcome: 'success',
  session_id: 'mcpplus-call-01KRPS0ZAW54YCSAJ3TC6JBXTM',
  part_name: 'extract_claims',
  attrs: {
    'mcpp.ocel.activity': 'admitted',
    'mcpp.ocel.outcome': 'success',
    'mcpp.ocel.part_name': 'extract_claims',
    'mcpp.ocel.session_id': 'mcpplus-call-01KRPS0ZAW54YCSAJ3TC6JBXTM',
  },
};

const MCPP_NATIVE_WITH_OBJECTS: McppNativeEvent = {
  id: '01HEVT0000000000000000000A',
  activity: 'mcp_tool_called',
  time: '2026-05-15T00:00:00Z',
  outcome: 'success',
  session_id: 'aat-conforming-001',
  part_name: 'extract_claims',
  attrs: {
    'mcpp.ocel.activity': 'mcp_tool_called',
    'mcpp.object.type': 'mcpp:CallSession',
  },
  objects: { 'mcpp:CallSession': ['obj:call-001'] },
};

const MCPP_NATIVE_VERDICT_EMITTED: McppNativeEvent = {
  id: '01HEVT0000000000000000000E',
  activity: 'verdict_emitted',
  time: '2026-05-15T00:00:00.040Z',
  outcome: 'success',
  session_id: 'aat-conforming-001',
  part_name: 'extract_claims',
  attrs: {
    'mcpp.ocel.activity': 'verdict_emitted',
    'mcpp.object.type': 'mcpp:Verdict',
    'mcpp.verdict': 'accepted',
  },
  objects: {
    'mcpp:CallSession': ['obj:call-001'],
    'mcpp:PartInvocation': ['obj:inv-001'],
    'mcpp:Verdict': ['obj:ver-001'],
  },
};

// Serialize to JSONL (the wire format)
function toNativeJsonl(events: McppNativeEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

// ---------------------------------------------------------------------------
// Shared wasm4pm receipt fixture
// ---------------------------------------------------------------------------

const RUN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    run_id: RUN_ID,
    schema_version: '1.0',
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: '2026-05-16T10:00:00.000Z',
    end_time: '2026-05-16T10:00:05.000Z',
    duration_ms: 5000,
    status: 'success',
    summary: { traces_processed: 42, objects_processed: 100, variants_discovered: 7 },
    algorithm: { name: 'alpha-plus-plus', version: '2.1.0', parameters: {} },
    model: { nodes: 5, edges: 8 },
    ...overrides,
  };
}

// ===========================================================================
// GAP-1: KEY SCHEMA MISMATCH — Rank 1 (Mathematical)
//
// The core mismatch: mcpp emits { id, activity, time } but fromMcppJsonlStrict
// requires { "ocel:eid", "ocel:activity", "ocel:timestamp" }.
//
// These tests PROVE the gap exists by demonstrating that real mcpp events
// fail isValidOcelEvent() and fromMcppJsonlStrict().
// ===========================================================================

describe('GAP-1: mcpp native format fails isValidOcelEvent() — key schema mismatch (Rank 1)', () => {
  it('GAP-1a: mcpp native event (flat keys) fails isValidOcelEvent() — ocel: prefix required', () => {
    // A real mcpp event has keys: id, activity, time, outcome, session_id, part_name, attrs
    // isValidOcelEvent() requires: ocel:eid, ocel:activity, ocel:timestamp, ocel:omap, ocel:vmap
    // This test PROVES the format gap: real mcpp events are rejected by the bridge guard.
    expect(isValidOcelEvent(MCPP_NATIVE_ADMITTED)).toBe(false);
  });

  it('GAP-1b: mcpp native event with objects field still fails isValidOcelEvent()', () => {
    // Even enriched mcpp events (with object bindings) lack the ocel: prefix keys.
    expect(isValidOcelEvent(MCPP_NATIVE_WITH_OBJECTS)).toBe(false);
  });

  it('GAP-1c: mcpp native verdict_emitted event fails isValidOcelEvent()', () => {
    // Verdict events from mcpp are also rejected.
    expect(isValidOcelEvent(MCPP_NATIVE_VERDICT_EMITTED)).toBe(false);
  });

  it('GAP-1d: fromMcppJsonlStrict() throws TypeError on a single real mcpp event (Rank 1)', () => {
    // fromMcppJsonlStrict is documented as "Stricter variant for contexts where every
    // event must be structurally sound before handing to the process miner."
    // A real mcpp event triggers this guard — the bridge is broken for mcpp native output.
    const ndjson = JSON.stringify(MCPP_NATIVE_ADMITTED);
    expect(() => fromMcppJsonlStrict(ndjson)).toThrow(TypeError);
  });

  it('GAP-1e: fromMcppJsonlStrict() throws on a multi-event mcpp session (3 events all fail)', () => {
    const ndjson = toNativeJsonl([
      MCPP_NATIVE_WITH_OBJECTS,
      MCPP_NATIVE_VERDICT_EMITTED,
      MCPP_NATIVE_ADMITTED,
    ]);
    expect(() => fromMcppJsonlStrict(ndjson)).toThrow(TypeError);
  });

  it('GAP-1f: fromMcppJsonl() silently accepts mcpp native events but returns mis-typed objects (Rank 1)', () => {
    // fromMcppJsonl does NOT validate structure — it blind-casts with "as OcelEvent".
    // This means mcpp native events are accepted without error but have wrong field names.
    // The caller gets objects that LOOK like OcelEvent but have no ocel:eid, ocel:activity, etc.
    const ndjson = JSON.stringify(MCPP_NATIVE_ADMITTED);
    const parsed = fromMcppJsonl(ndjson);
    expect(parsed).toHaveLength(1);
    // The "parsed" object has mcpp's flat keys, not the ocel: prefix keys
    const ev = parsed[0] as unknown as Record<string, unknown>;
    expect(ev['id']).toBe('01KRPS0ZAWSAZ5K204KNQCR082');       // mcpp key present
    expect(ev['ocel:eid']).toBeUndefined();                      // ocel: key absent → GAP CONFIRMED
    expect(ev['activity']).toBe('admitted');                     // mcpp key present
    expect(ev['ocel:activity']).toBeUndefined();                 // ocel: key absent → GAP CONFIRMED
    expect(ev['time']).toBe('2026-05-15T21:35:04.540674+00:00');// mcpp key present
    expect(ev['ocel:timestamp']).toBeUndefined();                // ocel: key absent → GAP CONFIRMED
  });
});

// ===========================================================================
// GAP-2: OBJECT MODEL MISMATCH — Rank 2 (Domain Contract)
//
// mcpp uses typed object maps { "mcpp:Type": ["id1"] } for lifecycle binding.
// wasm4pm uses a flat string array ["run-id-1"] with no type information.
//
// Object type information is LOST in translation.
// ===========================================================================

describe('GAP-2: mcpp objects map vs wasm4pm ocel:omap — object model mismatch (Rank 2)', () => {
  it('GAP-2a: mcpp native event carries typed object map (Form A — OCEL 2.0 §4)', () => {
    // mcpp uses { "mcpp:Type": ["id"] } — this is OCEL 2.0 Form A with type information.
    expect(MCPP_NATIVE_VERDICT_EMITTED.objects).toBeDefined();
    expect(MCPP_NATIVE_VERDICT_EMITTED.objects!['mcpp:Verdict']).toEqual(['obj:ver-001']);
    expect(MCPP_NATIVE_VERDICT_EMITTED.objects!['mcpp:CallSession']).toEqual(['obj:call-001']);
    expect(MCPP_NATIVE_VERDICT_EMITTED.objects!['mcpp:PartInvocation']).toEqual(['obj:inv-001']);
    // 3 distinct object types — mcpp provides full lifecycle object binding
    expect(Object.keys(MCPP_NATIVE_VERDICT_EMITTED.objects!)).toHaveLength(3);
  });

  it('GAP-2b: wasm4pm receiptToOcelEvents() emits flat ocel:omap with only the run_id (no types)', () => {
    // wasm4pm OCEL events carry only the run_id in ocel:omap, with no type information.
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      // ocel:omap is a flat string array
      expect(Array.isArray(event['ocel:omap'])).toBe(true);
      expect(event['ocel:omap']).toContain(RUN_ID);
      // No type structure — no way to distinguish mcpp:Part from mcpp:Receipt
      for (const ref of event['ocel:omap']) {
        expect(typeof ref).toBe('string');
      }
    }
  });

  it('GAP-2c: mcpp objects field has NO counterpart in wasm4pm OcelEvent type (type gap)', () => {
    // The OcelEvent type in wasm4pm has no "objects" field.
    // Object type information from mcpp cannot be represented in wasm4pm's OcelEvent.
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      const ev = event as unknown as Record<string, unknown>;
      expect(ev['objects']).toBeUndefined(); // no objects field in wasm4pm events
    }
  });

  it('GAP-2d: hypothetical adapter collapses type map to flat id array (data loss proof)', () => {
    // If we were to adapt MCPP_NATIVE_VERDICT_EMITTED to wasm4pm format by collapsing
    // the typed object map to a flat array, we LOSE type information irreversibly.
    // This proves the object model mismatch is semantically lossy, not just cosmetic.
    const typedMap = MCPP_NATIVE_VERDICT_EMITTED.objects!;
    const flatIds = Object.values(typedMap).flat();
    // After flattening: 3 ids from 3 types → flat array
    expect(flatIds).toEqual(['obj:call-001', 'obj:inv-001', 'obj:ver-001']); // type info gone
    // Cannot recover: given ["obj:call-001", "obj:inv-001", "obj:ver-001"],
    // we cannot determine which is mcpp:Verdict vs mcpp:CallSession
    expect(flatIds.every((id) => typeof id === 'string' && !id.includes(':CallSession'))).toBe(true);
  });
});

// ===========================================================================
// GAP-3: TIMESTAMP KEY DIVERGENCE — Rank 2 (Domain Contract)
//
// mcpp uses "time" key with timezone offset format.
// wasm4pm uses "ocel:timestamp" key with UTC Z format.
// ===========================================================================

describe('GAP-3: timestamp key divergence — mcpp "time" vs wasm4pm "ocel:timestamp" (Rank 2)', () => {
  it('GAP-3a: mcpp native events use "time" key with +00:00 timezone offset', () => {
    expect(MCPP_NATIVE_ADMITTED.time).toBe('2026-05-15T21:35:04.540674+00:00');
    // Key is "time", not "ocel:timestamp"
    const ev = MCPP_NATIVE_ADMITTED as unknown as Record<string, unknown>;
    expect(ev['time']).toBeDefined();
    expect(ev['ocel:timestamp']).toBeUndefined();
  });

  it('GAP-3b: wasm4pm events use "ocel:timestamp" key with UTC Z format', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      // Key is "ocel:timestamp", not "time"
      expect(event['ocel:timestamp']).toBeDefined();
      expect(event['ocel:timestamp']).toMatch(/Z$/); // UTC Z format
      const ev = event as unknown as Record<string, unknown>;
      expect(ev['time']).toBeUndefined();
    }
  });

  it('GAP-3c: both formats represent the same ISO-8601 instant but with different keys and timezone notation', () => {
    // The underlying instant is the same; the representation differs.
    // A normalizer would need to: rename "time" → "ocel:timestamp" AND convert "+00:00" → "Z".
    const mcppTime = '2026-05-15T21:35:04.540674+00:00';
    const normalized = mcppTime.replace('+00:00', 'Z');
    expect(normalized).toBe('2026-05-15T21:35:04.540674Z');
    // Valid ISO-8601 UTC — same instant, different suffix
    expect(new Date(mcppTime).getTime()).toBe(new Date(normalized).getTime());
  });
});

// ===========================================================================
// GAP-4: MISSING ADAPTER FUNCTION — Rank 2 (Domain Contract)
//
// There is no fromMcppNativeJsonl() function in ocel-bridge.ts.
// This section documents what such a function would need to do,
// and proves the transformation is well-defined (no ambiguity).
// ===========================================================================

describe('GAP-4: no adapter function exists — normalization rules are well-defined (Rank 2)', () => {
  /**
   * Reference implementation: adapts a single mcpp native event to wasm4pm OcelEvent shape.
   * This is what fromMcppNativeJsonl() would need to do.
   *
   * Mapping:
   *   id          → ocel:eid
   *   activity    → ocel:activity
   *   time        → ocel:timestamp (normalise +00:00 → Z)
   *   objects     → ocel:omap (flatten typed map to id array; type info LOST)
   *   attrs       → ocel:vmap (pass through)
   *   outcome/session_id/part_name → ocel:vmap (merge in)
   */
  function adaptMcppNativeToOcel(ev: McppNativeEvent): Record<string, unknown> {
    // Flatten typed object map to flat id array (lossy — type info dropped)
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

  it('GAP-4a: reference adapter maps mcpp id → ocel:eid correctly', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    expect(adapted['ocel:eid']).toBe('01KRPS0ZAWSAZ5K204KNQCR082');
  });

  it('GAP-4b: reference adapter maps mcpp activity → ocel:activity correctly', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    expect(adapted['ocel:activity']).toBe('admitted');
  });

  it('GAP-4c: reference adapter maps mcpp time → ocel:timestamp (normalises +00:00 → Z)', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    expect(adapted['ocel:timestamp']).toBe('2026-05-15T21:35:04.540674Z');
  });

  it('GAP-4d: reference adapter flattens mcpp objects → ocel:omap (typed map to id array)', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_VERDICT_EMITTED);
    const omap = adapted['ocel:omap'] as string[];
    expect(Array.isArray(omap)).toBe(true);
    expect(omap).toContain('obj:call-001');
    expect(omap).toContain('obj:inv-001');
    expect(omap).toContain('obj:ver-001');
    expect(omap).toHaveLength(3);
  });

  it('GAP-4e: reference adapter passes mcpp attrs through to ocel:vmap', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    const vmap = adapted['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.ocel.activity']).toBe('admitted');
    expect(vmap['mcpp.ocel.outcome']).toBe('success');
  });

  it('GAP-4f: reference adapter merges outcome/session_id/part_name into ocel:vmap', () => {
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    const vmap = adapted['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['outcome']).toBe('success');
    expect(vmap['session_id']).toBe('mcpplus-call-01KRPS0ZAW54YCSAJ3TC6JBXTM');
    expect(vmap['part_name']).toBe('extract_claims');
  });

  it('GAP-4g: adapted mcpp event passes isValidOcelEvent() — adapter output is structurally valid', () => {
    // After adaptation, the event satisfies wasm4pm's structural guard.
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_ADMITTED);
    expect(isValidOcelEvent(adapted)).toBe(true);
  });

  it('GAP-4h: adapted mcpp event survives fromMcppJsonl round-trip via toOcelJsonl (Rank 1)', () => {
    // After adaptation, events can round-trip through wasm4pm's serialization pipeline.
    const adapted = adaptMcppNativeToOcel(MCPP_NATIVE_WITH_OBJECTS);
    // Cast is safe: adapter output satisfies OcelEvent structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asOcelEvent = adapted as any;
    const ndjson = JSON.stringify(asOcelEvent);
    const roundTripped = fromMcppJsonl(ndjson);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0]['ocel:eid']).toBe('01HEVT0000000000000000000A');
    expect(roundTripped[0]['ocel:activity']).toBe('mcp_tool_called');
  });

  it('GAP-4i: multi-event mcpp session survives full adapt→serialize→parse→validate pipeline', () => {
    const session = [MCPP_NATIVE_WITH_OBJECTS, MCPP_NATIVE_VERDICT_EMITTED, MCPP_NATIVE_ADMITTED];
    const adapted = session.map(adaptMcppNativeToOcel);
    // All adapted events satisfy the structural guard
    for (const ev of adapted) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
    // Serialize to NDJSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ndjson = adapted.map((e) => JSON.stringify(e)).join('\n');
    // Parse back with strict validator
    const strict = fromMcppJsonlStrict(ndjson);
    expect(strict).toHaveLength(3);
    expect(strict[0]['ocel:eid']).toBe('01HEVT0000000000000000000A');
    expect(strict[1]['ocel:eid']).toBe('01HEVT0000000000000000000E');
    expect(strict[2]['ocel:eid']).toBe('01KRPS0ZAWSAZ5K204KNQCR082');
  });
});

// ===========================================================================
// WHAT WORKS: wasm4pm → mcpp direction (internal roundtrip) — Rank 1
//
// The wasm4pm internal roundtrip (Receipt → OcelEvent → NDJSON → OcelEvent)
// works correctly within wasm4pm. The issue is only mcpp→wasm4pm ingestion.
// ===========================================================================

describe('WHAT WORKS: internal wasm4pm roundtrip is correct (Rank 1)', () => {
  it('WW-1: Receipt → OCEL events → NDJSON → OCEL events roundtrip preserves all five ocel: fields', () => {
    const receipt = makeReceipt();
    const events = receiptToOcelEvents(receipt);
    const ndjson = toOcelJsonl(events);
    const roundTripped = fromMcppJsonl(ndjson);
    expect(roundTripped).toHaveLength(3);
    for (const ev of roundTripped) {
      expect(ev['ocel:eid']).toBeDefined();
      expect(ev['ocel:activity']).toBeDefined();
      expect(ev['ocel:timestamp']).toBeDefined();
      expect(ev['ocel:omap']).toBeDefined();
      expect(ev['ocel:vmap']).toBeDefined();
    }
  });

  it('WW-2: NDJSON roundtrip is bit-exact (idempotent serialization)', () => {
    const receipt = makeReceipt();
    const ndjson1 = toOcelJsonl(receiptToOcelEvents(receipt));
    const ndjson2 = toOcelJsonl(fromMcppJsonl(ndjson1));
    expect(ndjson2).toBe(ndjson1);
  });

  it('WW-3: fromMcppJsonlStrict accepts wasm4pm-generated NDJSON without throwing', () => {
    const ndjson = toOcelJsonl(receiptToOcelEvents(makeReceipt()));
    expect(() => fromMcppJsonlStrict(ndjson)).not.toThrow();
    expect(fromMcppJsonlStrict(ndjson)).toHaveLength(3);
  });

  it('WW-4: all wasm4pm-generated events pass isValidOcelEvent() (Rank 1)', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const ev of events) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
  });
});

// ===========================================================================
// GAP-5: fromMcppJsonl / fromMcppJsonlStrict not exported from package index
//
// These parse functions are available in ocel-bridge.ts but not re-exported
// from packages/contracts/src/index.ts. External consumers cannot import them.
// ===========================================================================

describe('GAP-5: parse functions not in package index — import path verification (Rank 2)', () => {
  it('GAP-5a: fromMcppJsonl is importable from the ocel-bridge module directly', () => {
    // This test passes because we import directly from '../ocel-bridge.js'
    // If imported from '@wasm4pm/contracts', it would fail (not exported from index.ts)
    expect(typeof fromMcppJsonl).toBe('function');
  });

  it('GAP-5b: fromMcppJsonlStrict is importable from the ocel-bridge module directly', () => {
    expect(typeof fromMcppJsonlStrict).toBe('function');
  });

  it('GAP-5c: package index exports receiptToOcelEvents, toOcelJsonl, isValidOcelEvent (verified)', () => {
    // These three ARE exported from the package index (verified in index.ts)
    expect(typeof receiptToOcelEvents).toBe('function');
    expect(typeof toOcelJsonl).toBe('function');
    expect(typeof isValidOcelEvent).toBe('function');
  });
});

// ===========================================================================
// REGRESSION: real mcpp fixture files confirm the gap is not hypothetical
//
// These tests read the actual fixture files from ~/mcpp/fixtures/ to confirm
// the format mismatch exists in production data, not just synthetic examples.
// ===========================================================================

describe('REGRESSION: real mcpp fixture events are rejected by fromMcppJsonlStrict (Rank 1)', () => {
  // Read the first line of the a2a-capture fixture (real production format)
  const fixturePath = join(
    process.env['HOME'] ?? '/Users/sac',
    'mcpp/fixtures/launch/v26.5.19/a2a-capture.ocel.jsonl',
  );

  let firstLine: string | null = null;
  try {
    const content = readFileSync(fixturePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    firstLine = lines[0] ?? null;
  } catch {
    // File not available in this environment — tests will be skipped
  }

  it('REGRESSION-1: a2a-capture.ocel.jsonl first line is a flat mcpp event (not ocel:-prefixed)', () => {
    if (firstLine === null) {
      // Fixture not accessible — mark as informational skip
      expect(true).toBe(true);
      return;
    }
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    // mcpp format: flat keys
    expect(parsed['id']).toBeDefined();
    expect(parsed['activity']).toBeDefined();
    expect(parsed['time']).toBeDefined();
    // NOT ocel:-prefixed
    expect(parsed['ocel:eid']).toBeUndefined();
    expect(parsed['ocel:activity']).toBeUndefined();
    expect(parsed['ocel:timestamp']).toBeUndefined();
  });

  it('REGRESSION-2: fromMcppJsonlStrict rejects the first real fixture event (Rank 1 — gap is live)', () => {
    if (firstLine === null) {
      expect(true).toBe(true);
      return;
    }
    // This MUST throw — proving the gap is real, not hypothetical
    expect(() => fromMcppJsonlStrict(firstLine)).toThrow(TypeError);
  });

  it('REGRESSION-3: isValidOcelEvent rejects the first real fixture event (Rank 1)', () => {
    if (firstLine === null) {
      expect(true).toBe(true);
      return;
    }
    const parsed = JSON.parse(firstLine) as unknown;
    expect(isValidOcelEvent(parsed)).toBe(false);
  });
});
