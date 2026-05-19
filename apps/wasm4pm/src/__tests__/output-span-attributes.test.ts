/**
 * output-span-attributes.test.ts
 *
 * FM-5 Critical: Verify that social, temporal, and simulate commands emit
 * OTEL spans that include *output* metrics (nodes_count, violations_count,
 * cases_completed, etc.) — not just input parameters.
 *
 * Gap identification:
 *   - social.ts: withSpan emits only metric/input/activity_key/resource_key.
 *     Missing: nodes_count, edges_count, bottleneck_count, status.
 *   - temporal.ts: withSpan emits only input/activity_key/threshold/etc.
 *     Missing: violations_count, temporal_fitness, impossible_ts_count, status.
 *   - simulate.ts: withSpan emits only input/activity_key/cases/seed/etc.
 *     Missing: cases_completed, avg_sojourn_time_ms, p95_sojourn_ms, status.
 *
 * These tests call withSpan directly with and without getLateAttrs to assert
 * the attribute contract. The fix is to add getLateAttrs to each withSpan call.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { OtelSpan } from '@wasm4pm/cognition';
import { setGlobalSpanSink, resetGlobalSpanSink } from '../otel/sink.js';
import { withSpan, type SpanAttrs } from '../commands/_otel.js';

// ---------------------------------------------------------------------------
// Capture harness — injects a span collector into the global sink
// ---------------------------------------------------------------------------

function makeSinkCapture() {
  const spans: OtelSpan[] = [];
  setGlobalSpanSink((span) => spans.push(span));
  return {
    spans,
    getByName(name: string) {
      return spans.filter((s) => s.name === name);
    },
    last() {
      return spans[spans.length - 1];
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers that simulate the command's inner body (without WASM / file I/O)
// ---------------------------------------------------------------------------

/** Simulate the social command's minimal withSpan call without getLateAttrs (current broken state) */
async function simulateSocialSpanWithoutLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ nodes: number; edges: number; bottlenecks: number }> {
  let result = { nodes: 0, edges: 0, bottlenecks: 0 };

  await withSpan(
    'social',
    {
      metric: 'handover',
      input: 'test.xes',
      activity_key: 'concept:name',
      resource_key: 'org:resource',
      format: 'json',
    },
    async () => {
      // Simulate work — discovers a network
      result = { nodes: 5, edges: 8, bottlenecks: 1 };
    }
    // NOTE: No getLateAttrs — this is the current broken state
  );

  return result;
}

/** Simulate the social command's withSpan call WITH getLateAttrs (the fix) */
async function simulateSocialSpanWithLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ nodes: number; edges: number; bottlenecks: number }> {
  let result = { nodes: 0, edges: 0, bottlenecks: 0 };

  await withSpan(
    'social',
    {
      metric: 'handover',
      input: 'test.xes',
      activity_key: 'concept:name',
      resource_key: 'org:resource',
      format: 'json',
    },
    async () => {
      result = { nodes: 5, edges: 8, bottlenecks: 1 };
    },
    // getLateAttrs — this is the fix
    () => ({
      nodes_count: result.nodes,
      edges_count: result.edges,
      bottleneck_count: result.bottlenecks,
      status: 'ok',
    })
  );

  return result;
}

/** Simulate the temporal command's withSpan call WITHOUT getLateAttrs */
async function simulateTemporalSpanWithoutLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ violations: number; fitness: number; impossibleTs: number }> {
  let result = { violations: 3, fitness: 0.92, impossibleTs: 0 };

  await withSpan(
    'temporal',
    {
      input: 'test.xes',
      activity_key: 'concept:name',
      timestamp_key: 'time:timestamp',
      threshold: 0.05,
      format: 'json',
    },
    async () => {
      result = { violations: 3, fitness: 0.92, impossibleTs: 0 };
    }
    // NOTE: No getLateAttrs — broken state
  );

  return result;
}

/** Simulate the temporal command's withSpan call WITH getLateAttrs */
async function simulateTemporalSpanWithLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ violations: number; fitness: number; impossibleTs: number }> {
  let result = { violations: 3, fitness: 0.92, impossibleTs: 0 };

  await withSpan(
    'temporal',
    {
      input: 'test.xes',
      activity_key: 'concept:name',
      timestamp_key: 'time:timestamp',
      threshold: 0.05,
      format: 'json',
    },
    async () => {
      result = { violations: 3, fitness: 0.92, impossibleTs: 0 };
    },
    () => ({
      violations_count: result.violations,
      temporal_fitness: result.fitness,
      impossible_timestamp_count: result.impossibleTs,
      status: 'ok',
    })
  );

  return result;
}

/** Simulate the simulate command's withSpan call WITHOUT getLateAttrs */
async function simulateSimulateSpanWithoutLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ casesCompleted: number; avgSojournMs: number; p95Ms: number }> {
  let result = { casesCompleted: 100, avgSojournMs: 4500, p95Ms: 12000 };

  await withSpan(
    'simulate',
    {
      input: 'test.xes',
      activity_key: 'concept:name',
      cases: 100,
      time: 60000,
      seed: 42,
      format: 'json',
    },
    async () => {
      result = { casesCompleted: 100, avgSojournMs: 4500, p95Ms: 12000 };
    }
    // NOTE: No getLateAttrs — broken state
  );

  return result;
}

/** Simulate the simulate command's withSpan call WITH getLateAttrs */
async function simulateSimulateSpanWithLateAttrs(
  capture: ReturnType<typeof makeSinkCapture>
): Promise<{ casesCompleted: number; avgSojournMs: number; p95Ms: number }> {
  let result = { casesCompleted: 100, avgSojournMs: 4500, p95Ms: 12000 };

  await withSpan(
    'simulate',
    {
      input: 'test.xes',
      activity_key: 'concept:name',
      cases: 100,
      time: 60000,
      seed: 42,
      format: 'json',
    },
    async () => {
      result = { casesCompleted: 100, avgSojournMs: 4500, p95Ms: 12000 };
    },
    () => ({
      cases_completed: result.casesCompleted,
      avg_sojourn_time_ms: result.avgSojournMs,
      p95_sojourn_time_ms: result.p95Ms,
      status: 'ok',
    })
  );

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Output span attributes — social, temporal, simulate', () => {
  let capture: ReturnType<typeof makeSinkCapture>;

  beforeEach(() => {
    capture = makeSinkCapture();
  });

  afterEach(() => {
    resetGlobalSpanSink();
  });

  // -------------------------------------------------------------------------
  // Gap 1: social command — missing output attrs
  // -------------------------------------------------------------------------

  describe('social command span', () => {
    it('RED: span without getLateAttrs is missing nodes_count, edges_count, bottleneck_count, status', async () => {
      await simulateSocialSpanWithoutLateAttrs(capture);

      const socialSpans = capture.getByName('wasm4pm.command.social');
      expect(socialSpans.length).toBe(1);

      const attrs = socialSpans[0].attributes as Record<string, unknown>;
      // These SHOULD be in the span but are NOT without getLateAttrs — the gap
      expect(attrs['nodes_count']).toBeUndefined();
      expect(attrs['edges_count']).toBeUndefined();
      expect(attrs['bottleneck_count']).toBeUndefined();
      // status as output attribute (not OtelSpan.status, but attribute 'status') is absent
      expect(attrs['status']).toBeUndefined();
    });

    it('GREEN: span with getLateAttrs includes nodes_count, edges_count, bottleneck_count, status=ok', async () => {
      await simulateSocialSpanWithLateAttrs(capture);

      const socialSpans = capture.getByName('wasm4pm.command.social');
      expect(socialSpans.length).toBe(1);

      const attrs = socialSpans[0].attributes as Record<string, unknown>;

      // Input attrs still present
      expect(attrs['metric']).toBe('handover');
      expect(attrs['activity_key']).toBe('concept:name');
      expect(attrs['resource_key']).toBe('org:resource');

      // Output attrs now present — the fix
      expect(attrs['nodes_count']).toBe(5);
      expect(attrs['edges_count']).toBe(8);
      expect(attrs['bottleneck_count']).toBe(1);
      expect(attrs['status']).toBe('ok');
    });

    it('span has service.name = wasm4pm and command = social', async () => {
      await simulateSocialSpanWithLateAttrs(capture);

      const socialSpans = capture.getByName('wasm4pm.command.social');
      expect(socialSpans.length).toBeGreaterThan(0);

      const attrs = socialSpans[0].attributes as Record<string, unknown>;
      expect(attrs['service.name']).toBe('wasm4pm');
      expect(attrs['command']).toBe('social');
    });
  });

  // -------------------------------------------------------------------------
  // Gap 2: temporal command — missing output attrs
  // -------------------------------------------------------------------------

  describe('temporal command span', () => {
    it('RED: span without getLateAttrs is missing violations_count, temporal_fitness, impossible_timestamp_count, status', async () => {
      await simulateTemporalSpanWithoutLateAttrs(capture);

      const temporalSpans = capture.getByName('wasm4pm.command.temporal');
      expect(temporalSpans.length).toBe(1);

      const attrs = temporalSpans[0].attributes as Record<string, unknown>;
      expect(attrs['violations_count']).toBeUndefined();
      expect(attrs['temporal_fitness']).toBeUndefined();
      expect(attrs['impossible_timestamp_count']).toBeUndefined();
      expect(attrs['status']).toBeUndefined();
    });

    it('GREEN: span with getLateAttrs includes violations_count, temporal_fitness, impossible_timestamp_count, status=ok', async () => {
      await simulateTemporalSpanWithLateAttrs(capture);

      const temporalSpans = capture.getByName('wasm4pm.command.temporal');
      expect(temporalSpans.length).toBe(1);

      const attrs = temporalSpans[0].attributes as Record<string, unknown>;

      // Input attrs still present
      expect(attrs['input']).toBe('test.xes');
      expect(attrs['activity_key']).toBe('concept:name');
      expect(attrs['threshold']).toBe(0.05);

      // Output attrs now present — the fix
      expect(attrs['violations_count']).toBe(3);
      expect(attrs['temporal_fitness']).toBeCloseTo(0.92, 2);
      expect(attrs['impossible_timestamp_count']).toBe(0);
      expect(attrs['status']).toBe('ok');
    });

    it('span temporal_fitness must be in [0, 1] when present', async () => {
      await simulateTemporalSpanWithLateAttrs(capture);

      const temporalSpans = capture.getByName('wasm4pm.command.temporal');
      const attrs = temporalSpans[0].attributes as Record<string, unknown>;

      const fitness = attrs['temporal_fitness'] as number;
      expect(fitness).toBeGreaterThanOrEqual(0);
      expect(fitness).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Gap 3: simulate command — missing output attrs
  // -------------------------------------------------------------------------

  describe('simulate command span', () => {
    it('RED: span without getLateAttrs is missing cases_completed, avg_sojourn_time_ms, p95_sojourn_time_ms, status', async () => {
      await simulateSimulateSpanWithoutLateAttrs(capture);

      const simSpans = capture.getByName('wasm4pm.command.simulate');
      expect(simSpans.length).toBe(1);

      const attrs = simSpans[0].attributes as Record<string, unknown>;
      expect(attrs['cases_completed']).toBeUndefined();
      expect(attrs['avg_sojourn_time_ms']).toBeUndefined();
      expect(attrs['p95_sojourn_time_ms']).toBeUndefined();
      expect(attrs['status']).toBeUndefined();
    });

    it('GREEN: span with getLateAttrs includes cases_completed, avg_sojourn_time_ms, p95_sojourn_time_ms, status=ok', async () => {
      await simulateSimulateSpanWithLateAttrs(capture);

      const simSpans = capture.getByName('wasm4pm.command.simulate');
      expect(simSpans.length).toBe(1);

      const attrs = simSpans[0].attributes as Record<string, unknown>;

      // Input attrs still present
      expect(attrs['input']).toBe('test.xes');
      expect(attrs['cases']).toBe(100);
      expect(attrs['seed']).toBe(42);

      // Output attrs now present — the fix
      expect(attrs['cases_completed']).toBe(100);
      expect(attrs['avg_sojourn_time_ms']).toBe(4500);
      expect(attrs['p95_sojourn_time_ms']).toBe(12000);
      expect(attrs['status']).toBe('ok');
    });

    it('span cases_completed must be >= 0', async () => {
      await simulateSimulateSpanWithLateAttrs(capture);

      const simSpans = capture.getByName('wasm4pm.command.simulate');
      const attrs = simSpans[0].attributes as Record<string, unknown>;

      expect(attrs['cases_completed'] as number).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // OtelSpan.status.code is always set (never omitted) — VAN DER AALST rule
  // -------------------------------------------------------------------------

  describe('OtelSpan.status.code must be set on all command spans', () => {
    it('social command span status.code is OK on success', async () => {
      await simulateSocialSpanWithLateAttrs(capture);

      const spans = capture.getByName('wasm4pm.command.social');
      expect(spans[0].status).toBeDefined();
      expect(spans[0].status.code).toBe('OK');
    });

    it('temporal command span status.code is OK on success', async () => {
      await simulateTemporalSpanWithLateAttrs(capture);

      const spans = capture.getByName('wasm4pm.command.temporal');
      expect(spans[0].status).toBeDefined();
      expect(spans[0].status.code).toBe('OK');
    });

    it('simulate command span status.code is OK on success', async () => {
      await simulateSimulateSpanWithLateAttrs(capture);

      const spans = capture.getByName('wasm4pm.command.simulate');
      expect(spans[0].status).toBeDefined();
      expect(spans[0].status.code).toBe('OK');
    });

    it('any command span status.code is ERROR when body throws', async () => {
      // Simulate a command body that throws — withSpan must still emit status=ERROR
      let threw = false;
      try {
        await withSpan(
          'social',
          { metric: 'handover', input: 'bad.xes', activity_key: 'concept:name', resource_key: 'org:resource', format: 'json' },
          async () => {
            throw new Error('WASM load failed');
          },
          () => ({ status: 'error' })
        );
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);

      const errorSpans = capture.getByName('wasm4pm.command.social');
      expect(errorSpans.length).toBe(1);
      expect(errorSpans[0].status.code).toBe('ERROR');
    });
  });
});
