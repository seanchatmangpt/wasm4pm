/**
 * self-conformance command — conversion layer unit test.
 *
 * Tests the span → OCEL JSONL bridge WITHOUT loading the WASM kernel.
 * WASM-level DFG discovery is covered by ocel-algorithms.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { spansToOcelJsonl } from '../commands/self-conformance.js';

// RawSpan shape as defined in self-conformance.ts (mirrored here for test fixtures)
type RawSpan = {
  trace_id?: string; span_id?: string; name?: string; kind?: string;
  start_time?: number; end_time?: number;
  status?: { code: string; message?: string };
  attributes?: Record<string, string | number | boolean>;
};

// ── synthetic span fixtures ───────────────────────────────────────────────────

const SYNTHETIC_SPANS: RawSpan[] = [
  {
    trace_id: 'aabbccddeeff00112233445566778899',
    span_id: 'span-0001',
    name: 'wpm.run',
    kind: 'INTERNAL',
    start_time: 1_700_000_000_000,
    end_time:   1_700_000_000_500,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm', algorithm: 'heuristic_miner' },
  },
  {
    trace_id: 'aabbccddeeff00112233445566778899',
    span_id: 'span-0002',
    name: 'wasm4pm.ocel.load',
    kind: 'INTERNAL',
    start_time: 1_700_000_000_600,
    end_time:   1_700_000_000_800,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm', format: 'json' },
  },
  {
    trace_id: 'aabbccddeeff00112233445566778899',
    span_id: 'span-0003',
    name: 'wasm4pm.ocel.discover',
    kind: 'INTERNAL',
    start_time: 1_700_000_000_900,
    end_time:   1_700_000_001_200,
    status: { code: 'OK' },
    attributes: { 'service.name': 'wasm4pm', algorithm: 'ocel_dfg_per_type' },
  },
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe('spansToOcelJsonl', () => {
  it('produces exactly 3 JSONL lines for 3 input spans', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(3);
  });

  it('each line is valid JSON', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('each parsed line has ocel:activity matching the span name', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    const expectedNames = SYNTHETIC_SPANS.map((s) => s.name);
    for (let i = 0; i < lines.length; i++) {
      const ev = JSON.parse(lines[i]);
      expect(ev['ocel:activity']).toBe(expectedNames[i]);
    }
  });

  it('each event has ocel:timestamp as an ISO-8601 string', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(typeof ev['ocel:timestamp']).toBe('string');
      expect(new Date(ev['ocel:timestamp']).toString()).not.toBe('Invalid Date');
    }
  });

  it('each event carries ocel:omap derived from service.name attribute', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(Array.isArray(ev['ocel:omap'])).toBe(true);
      expect(ev['ocel:omap']).toContain('wasm4pm');
    }
  });

  it('each event vmap contains status and duration_ms', () => {
    const jsonl = spansToOcelJsonl(SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(ev['ocel:vmap']).toHaveProperty('status');
      expect(ev['ocel:vmap']).toHaveProperty('duration_ms');
    }
  });

  it('returns empty string for an empty span array', () => {
    const jsonl = spansToOcelJsonl([]);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(0);
  });

  it('skips spans with no name', () => {
    const spans = [
      ...SYNTHETIC_SPANS,
      { span_id: 'nameless', start_time: 0, end_time: 0, attributes: {} },
    ];
    const jsonl = spansToOcelJsonl(spans as typeof SYNTHETIC_SPANS);
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    // nameless span filtered out
    expect(lines).toHaveLength(3);
  });
});
