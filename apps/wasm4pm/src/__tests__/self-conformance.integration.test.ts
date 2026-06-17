/**
 * FM-5 WASM integration test for self-conformance.
 *
 * Uses real WASM — no mocking of init.js. Gated on WASM_INTEGRATION=1 to
 * avoid CI failures when the WASM binary is absent.
 */

import { describe, it, expect } from 'vitest';
import { spansToOcelJsonl } from '../commands/self-conformance.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TIME_NS = 1_700_000_000_000; // fixed epoch in ms-scale (divided by 1e6 → ms in spansToOcelJsonl)

const fixtures = [
  {
    trace_id: 'trace-001',
    span_id: 'span-001',
    name: 'wpm.run',
    kind: 'INTERNAL',
    start_time: BASE_TIME_NS,
    end_time: BASE_TIME_NS + 50_000_000,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm' },
  },
  {
    trace_id: 'trace-001',
    span_id: 'span-002',
    name: 'wasm4pm.ocel.load',
    kind: 'INTERNAL',
    start_time: BASE_TIME_NS + 60_000_000,
    end_time: BASE_TIME_NS + 120_000_000,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm' },
  },
  {
    trace_id: 'trace-001',
    span_id: 'span-003',
    name: 'wasm4pm.ocel.discover',
    kind: 'INTERNAL',
    start_time: BASE_TIME_NS + 130_000_000,
    end_time: BASE_TIME_NS + 200_000_000,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm' },
  },
  {
    trace_id: 'trace-002',
    span_id: 'span-004',
    name: 'wasm4pm.ocel.discover',
    kind: 'INTERNAL',
    start_time: BASE_TIME_NS + 300_000_000,
    end_time: BASE_TIME_NS + 380_000_000,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm' },
  },
  {
    trace_id: 'trace-002',
    span_id: 'span-005',
    name: 'wpm.run',
    kind: 'INTERNAL',
    start_time: BASE_TIME_NS + 400_000_000,
    end_time: BASE_TIME_NS + 450_000_000,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm' },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('self-conformance WASM integration', () => {
  it('spansToOcelJsonl produces valid NDJSON with correct activities', () => {
    const jsonl = spansToOcelJsonl(fixtures);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);

    expect(lines.length).toBe(5);

    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const activities = events.map((e) => e['ocel:activity']);

    expect(activities).toContain('wpm.run');
    expect(activities).toContain('wasm4pm.ocel.load');
    expect(activities).toContain('wasm4pm.ocel.discover');
  });

  it.skipIf(!process.env['WASM_INTEGRATION'])(
    'loads OCEL into WASM kernel and discovers DFG per object type',
    async () => {
      // Step 1: convert spans to OCEL JSONL
      const ocelJsonl = spansToOcelJsonl(fixtures);
      const ocelLines = ocelJsonl.split('\n').filter((l) => l.trim().length > 0);

      expect(ocelLines.length).toBeGreaterThan(0);

      // Step 2: init WASM kernel (same pattern as self-conformance.ts)
      const wasm = await import('wasm4pm');
      if (typeof wasm.default === 'function') {
        await (wasm.default as unknown as () => Promise<void>)();
      }

      // Step 3: assemble OCEL 2.0 JSON from NDJSON lines
      interface OcelEvent {
        'ocel:eid': string;
        'ocel:activity': string;
        'ocel:timestamp': string;
        'ocel:omap': string[];
        'ocel:vmap': Record<string, unknown>;
      }

      const events = ocelLines.map((l) => JSON.parse(l) as OcelEvent);

      const objectTypes = new Set<string>();
      for (const ev of events) {
        for (const obj of ev['ocel:omap']) {
          objectTypes.add(obj);
        }
      }

      const ocel2Json = {
        'ocel:global-log': {
          'ocel:version': '2.0',
          'ocel:ordering': 'timestamp',
          'ocel:attribute-names': ['status', 'duration_ms'],
          'ocel:object-types': Array.from(objectTypes),
        },
        'ocel:global-event': {},
        'ocel:global-object': {},
        'ocel:events': Object.fromEntries(
          events.map((ev) => [
            ev['ocel:eid'],
            {
              'ocel:activity': ev['ocel:activity'],
              'ocel:timestamp': ev['ocel:timestamp'],
              'ocel:omap': ev['ocel:omap'],
              'ocel:vmap': ev['ocel:vmap'],
            },
          ]),
        ),
        'ocel:objects': Object.fromEntries(
          Array.from(objectTypes).map((ot) => [
            ot,
            { 'ocel:type': ot, 'ocel:ovmap': {} },
          ]),
        ),
      };

      const ocelJsonStr = JSON.stringify(ocel2Json);

      // Step 4: call WASM exports
      const loadFn = (wasm as Record<string, unknown>)['load_ocel_from_json'] as
        | ((s: string) => string)
        | undefined;
      const dfgFn = (wasm as Record<string, unknown>)['discover_ocel_dfg_per_type'] as
        | ((h: string) => unknown)
        | undefined;

      expect(typeof loadFn).toBe('function');
      expect(typeof dfgFn).toBe('function');

      const ocelHandle = loadFn!(ocelJsonStr);
      const dfgRaw = dfgFn!(ocelHandle);

      // Step 5: assertions
      interface DfgEntry {
        object_type: string;
        activities: string[];
        edges: Array<{ source: string; target: string; count: number }>;
      }

      const dfgResult = (
        typeof dfgRaw === 'string' ? JSON.parse(dfgRaw) : dfgRaw
      ) as DfgEntry[];

      expect(Array.isArray(dfgResult) || typeof dfgResult === 'object').toBe(true);

      const entries: DfgEntry[] = Array.isArray(dfgResult)
        ? dfgResult
        : Object.values(dfgResult as Record<string, DfgEntry>);

      expect(entries.length).toBeGreaterThanOrEqual(1);

      const hasActivities = entries.some(
        (entry) => Array.isArray(entry.activities) && entry.activities.length > 0,
      );
      expect(hasActivities).toBe(true);
    },
  );
});
