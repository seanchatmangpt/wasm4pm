/**
 * Unit tests for span-ocel-bridge — OTEL span → OCEL 2.0 converter.
 * No WASM dependency; pure TypeScript unit test.
 */

import { describe, it, expect } from 'vitest';
import {
  spansToOcelEvents,
  spansJsonlToOcelJsonl,
  type SpanExport,
} from '../span-ocel-bridge.js';
import { isValidOcelEvent } from '../ocel-bridge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WPM_RUN_SPAN: SpanExport = {
  traceId: 'aabbccddeeff00112233445566778899',
  spanId: 'span0000000000001',
  name: 'wpm.run',
  startTimeUnixNano: '1717920000000000000',
  endTimeUnixNano:   '1717920000047000000',
  status: { code: 1 }, // OK
  attributes: {
    'run.id': 'run-uuid-aaaa-bbbb-cccc',
    'pm.discovery.algorithm': 'dfg',
    'execution.profile': null,
  },
};

const OCEL_DISCOVER_SPAN: SpanExport = {
  traceId: 'aabbccddeeff00112233445566778899',
  spanId: 'span0000000000002',
  name: 'wasm4pm.ocel.discover',
  startTimeUnixNano: '1717920000001000000',
  endTimeUnixNano:   '1717920000038000000',
  status: { code: 2 }, // ERROR
  attributes: {
    'run.id': 'run-uuid-aaaa-bbbb-cccc',
    'pm.discovery.algorithm': 'heuristic_miner',
    'execution.profile': { peak_memory_bytes: 1048576 },
  },
};

// ---------------------------------------------------------------------------
// spansToOcelEvents
// ---------------------------------------------------------------------------

describe('spansToOcelEvents', () => {
  it('returns one OcelEvent per span', () => {
    const events = spansToOcelEvents([WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]);
    expect(events).toHaveLength(2);
  });

  it('each event passes isValidOcelEvent', () => {
    const events = spansToOcelEvents([WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]);
    for (const ev of events) {
      expect(isValidOcelEvent(ev)).toBe(true);
    }
  });

  it('maps ocel:eid to spanId', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    expect(ev['ocel:eid']).toBe(WPM_RUN_SPAN.spanId);
  });

  it('maps ocel:activity to span name', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    expect(ev['ocel:activity']).toBe('wpm.run');
  });

  it('maps ocel:timestamp from endTimeUnixNano as ISO 8601', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    // 1717920000047000000 ns / 1e6 = 1717920000047 ms
    expect(ev['ocel:timestamp']).toBe(new Date(1717920000047).toISOString());
  });

  it('includes run.id and traceId in ocel:omap', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    expect(ev['ocel:omap']).toContain('run-uuid-aaaa-bbbb-cccc');
    expect(ev['ocel:omap']).toContain(WPM_RUN_SPAN.traceId);
  });

  it('falls back to spanId as runId when run.id attribute is absent', () => {
    const span: SpanExport = { ...WPM_RUN_SPAN, attributes: {} };
    const [ev] = spansToOcelEvents([span]);
    expect(ev['ocel:omap']).toContain(span.spanId);
  });

  it('maps vmap.algorithm from pm.discovery.algorithm', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    expect(ev['ocel:vmap']['algorithm']).toBe('dfg');
  });

  it('maps vmap.status to OK for code 1', () => {
    const [ev] = spansToOcelEvents([WPM_RUN_SPAN]);
    expect(ev['ocel:vmap']['status']).toBe('OK');
  });

  it('maps vmap.status to ERROR for code 2', () => {
    const [, ev] = spansToOcelEvents([WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]);
    expect(ev['ocel:vmap']['status']).toBe('ERROR');
  });

  it('maps vmap.profile from execution.profile attribute', () => {
    const [, ev] = spansToOcelEvents([WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]);
    expect(ev['ocel:vmap']['profile']).toEqual({ peak_memory_bytes: 1048576 });
  });

  it('sets vmap.algorithm to null when attribute is absent', () => {
    const span: SpanExport = { ...WPM_RUN_SPAN, attributes: {} };
    const [ev] = spansToOcelEvents([span]);
    expect(ev['ocel:vmap']['algorithm']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spansJsonlToOcelJsonl
// ---------------------------------------------------------------------------

describe('spansJsonlToOcelJsonl', () => {
  it('round-trips a JSONL of two spans to valid OCEL NDJSON', () => {
    const inputJsonl = [WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]
      .map((s) => JSON.stringify(s))
      .join('\n');

    const result = spansJsonlToOcelJsonl(inputJsonl);
    const lines = result.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line) as unknown;
      expect(isValidOcelEvent(parsed)).toBe(true);
    }
  });

  it('each output line has ocel:eid, ocel:activity, ocel:timestamp', () => {
    const inputJsonl = [WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]
      .map((s) => JSON.stringify(s))
      .join('\n');

    const result = spansJsonlToOcelJsonl(inputJsonl);
    const lines = result.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const ev = JSON.parse(line) as Record<string, unknown>;
      expect(typeof ev['ocel:eid']).toBe('string');
      expect(typeof ev['ocel:activity']).toBe('string');
      expect(typeof ev['ocel:timestamp']).toBe('string');
    }
  });

  it('preserves span identity across round-trip', () => {
    const inputJsonl = [WPM_RUN_SPAN, OCEL_DISCOVER_SPAN]
      .map((s) => JSON.stringify(s))
      .join('\n');

    const result = spansJsonlToOcelJsonl(inputJsonl);
    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    const eids = lines.map((l) => (JSON.parse(l) as Record<string, unknown>)['ocel:eid']);

    expect(eids).toContain(WPM_RUN_SPAN.spanId);
    expect(eids).toContain(OCEL_DISCOVER_SPAN.spanId);
  });

  it('silently skips blank lines in input', () => {
    const inputJsonl = `${JSON.stringify(WPM_RUN_SPAN)}\n\n${JSON.stringify(OCEL_DISCOVER_SPAN)}\n`;
    const result = spansJsonlToOcelJsonl(inputJsonl);
    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
  });
});
