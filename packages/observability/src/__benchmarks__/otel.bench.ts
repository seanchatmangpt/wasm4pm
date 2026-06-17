/**
 * otel.bench.ts
 *
 * Benchmarks for OTEL observability hot paths.
 * Every one of the 60 algorithms emits an OTEL span — this is the most
 * frequently called non-WASM path in production wpm runs.
 *
 * Covers:
 * - Span-sink function overhead (no-op, buffer, JSON-serialize)
 * - Span attribute object allocation
 * - NoopTracer startSpan/end cycle (baseline for when OTEL is disabled)
 */

import { bench, describe } from 'vitest';
import { NoopTracer } from '../noop.js';
import type { Tracer } from '../spans.js';

// ── Span sink benchmarks (lightweight path used by kernel/cognition) ──────────
// The kernel uses a plain function sink, not OtelTracer, for zero-dep telemetry.

type SpanRecord = {
  trace_id: string;
  span_id: string;
  name: string;
  kind: string;
  start_time: number;
  end_time: number;
  status: { code: string; message?: string };
  attributes: Record<string, unknown>;
};

// Three sink implementations to compare
const noopSink = (_span: SpanRecord) => {};
const buffer: SpanRecord[] = [];
const bufferSink = (span: SpanRecord) => { buffer.push(span); };
// Use a sink that serializes but discards output (simulates export serialization)
const jsonSink = (span: SpanRecord) => { JSON.stringify(span); };

// Limit time for sub-microsecond benches — at 35M hz vitest accumulates millions
// of sample records that exhaust heap during worker-thread serialization.
const FAST = { time: 100, iterations: 50 } as const;

function makeSpan5Attrs(): SpanRecord {
  return {
    trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    span_id: 'bbbbbbbbbbbbbbbb',
    name: 'kernel.run',
    kind: 'INTERNAL',
    start_time: 1700000000000,
    end_time:   1700000001000,
    status: { code: 'OK' },
    attributes: {
      'service.name': 'wasm4pm',
      'algorithm.name': 'dfg',
      'algorithm.duration_ms': 1.2,
      'algorithm.status': 'ok',
      'kernel.version': '26.6.9',
    },
  };
}

function makeSpan20Attrs(): SpanRecord {
  return {
    trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    span_id: 'bbbbbbbbbbbbbbbb',
    name: 'kernel.run',
    kind: 'INTERNAL',
    start_time: 1700000000000,
    end_time:   1700000001000,
    status: { code: 'OK' },
    attributes: Object.fromEntries([
      ['service.name', 'wasm4pm'],
      ['algorithm.name', 'heuristic_miner'],
      ['algorithm.duration_ms', 12.4],
      ['algorithm.status', 'ok'],
      ['kernel.version', '26.6.9'],
      ...Array.from({ length: 15 }, (_, i) => [`extra.attr_${i}`, `value_${i}`]),
    ]),
  };
}

const SPAN_5 = makeSpan5Attrs();
const SPAN_20 = makeSpan20Attrs();

describe('span sink call overhead', () => {
  bench('no-op sink — 5 attrs', () => { noopSink(SPAN_5); }, FAST);
  bench('no-op sink — 20 attrs', () => { noopSink(SPAN_20); }, FAST);
  bench('buffer sink — 5 attrs (push to array)', () => { bufferSink(SPAN_5); }, FAST);
  bench('JSON.stringify sink — 5 attrs', () => { jsonSink(SPAN_5); });
  bench('JSON.stringify sink — 20 attrs', () => { jsonSink(SPAN_20); });
});

describe('span record allocation', () => {
  bench('allocate span with 5 attrs', () => { makeSpan5Attrs(); }, FAST);
  bench('allocate span with 20 attrs', () => { makeSpan20Attrs(); });
  bench('allocate + no-op sink (full hot-path simulation, 5 attrs)', () => { noopSink(makeSpan5Attrs()); }, FAST);
  bench('allocate + JSON sink (full hot-path simulation, 5 attrs)', () => { jsonSink(makeSpan5Attrs()); });
});

// ── NoopTracer (startSpan / end cycle) ────────────────────────────────────────
// Cast to Tracer interface so startSpan(name, opts?) overload is available.
// NoopTracer implements Tracer but ignores all args.

describe('NoopTracer — span lifecycle', () => {
  const tracer: Tracer = new NoopTracer();

  bench('startSpan() only (returns frozen singleton)', () => { tracer.startSpan('kernel.run'); }, FAST);

  bench('startSpan() + end() (minimal span)', () => {
    const span = tracer.startSpan('kernel.run');
    span.end();
  }, FAST);

  bench('startSpan() + setStatus() + end()', () => {
    const span = tracer.startSpan('kernel.run');
    span.setStatus('OK');
    span.end();
  }, FAST);

  bench('startSpan() + setAttribute() × 5 + end()', () => {
    const span = tracer.startSpan('kernel.run');
    span.setAttribute('service.name', 'wasm4pm');
    span.setAttribute('algorithm.name', 'dfg');
    span.setAttribute('algorithm.duration_ms', 1.2);
    span.setAttribute('algorithm.status', 'ok');
    span.setAttribute('kernel.version', '26.6.9');
    span.end();
  }, FAST);

  bench('startSpan() with attributes option + end()', () => {
    const span = tracer.startSpan('kernel.run', {
      attributes: {
        'service.name': 'wasm4pm',
        'algorithm.name': 'dfg',
        'algorithm.duration_ms': 1.2,
        'algorithm.status': 'ok',
        'kernel.version': '26.6.9',
      },
    });
    span.end();
  });

  bench('100-span burst (simulates 100 algorithms per run)', () => {
    for (let i = 0; i < 100; i++) {
      const span = tracer.startSpan(`algo_${i % 10}`);
      span.end();
    }
  });
});
