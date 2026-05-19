/**
 * Unit tests for getFlushSummary() — OtelExporter and JsonWriter
 *
 * These tests verify the domain contracts for the flush diagnostic method
 * using direct state injection (no mocks required — all properties are
 * manipulated via `(obj as any)` to avoid the Gemba integration-test rule).
 *
 * Contracts derive from the PRD §18.5 observability health specification:
 *   - error_rate = errors / attempts (0 when no attempts)
 *   - healthy = error_rate < 0.1 (< 10% failure threshold)
 *   - last_error carries ISO-8601 timestamp and string message
 */

import { describe, it, expect } from 'vitest';
import { OtelExporter } from '../../otel-exporter.js';
import { JsonWriter } from '../../json-writer.js';

// ---------------------------------------------------------------------------
// Helper: inject flush state directly without triggering real I/O
// ---------------------------------------------------------------------------

function injectErrors(
  obj: OtelExporter | JsonWriter,
  errors: Array<{ message: string; at?: Date }>
): void {
  const raw = obj as any;
  raw.flushErrors = errors.map((e) => ({
    timestamp: e.at ?? new Date('2026-05-17T12:00:00Z'),
    error: new Error(e.message),
  }));
}

function setAttempts(obj: OtelExporter | JsonWriter, n: number): void {
  (obj as any).flushAttempts = n;
}

// ---------------------------------------------------------------------------
// OtelExporter.getFlushSummary()
// ---------------------------------------------------------------------------

describe('OtelExporter.getFlushSummary() — domain contracts', () => {
  const cfg = {
    enabled: false, // disabled so no timers or network I/O start
    endpoint: 'http://localhost:4317',
    exporter: 'otlp_http' as const,
    required: false,
  };

  it('returns zero-error healthy summary when no flushes have occurred', () => {
    const exporter = new OtelExporter(cfg);
    const summary = exporter.getFlushSummary();

    expect(summary.total_errors).toBe(0);
    expect(summary.last_error).toBeUndefined();
    expect(summary.error_rate).toBe(0);
    expect(summary.healthy).toBe(true);
  });

  it('reports last_error.timestamp as ISO-8601 string', () => {
    const exporter = new OtelExporter(cfg);
    const fixedDate = new Date('2026-05-17T09:30:00.000Z');
    injectErrors(exporter, [{ message: 'connection refused', at: fixedDate }]);
    setAttempts(exporter, 1);

    const summary = exporter.getFlushSummary();

    expect(summary.last_error).toBeDefined();
    expect(summary.last_error!.timestamp).toBe('2026-05-17T09:30:00.000Z');
  });

  it('reports last_error.message as the error string', () => {
    const exporter = new OtelExporter(cfg);
    injectErrors(exporter, [{ message: 'OTEL endpoint unreachable' }]);
    setAttempts(exporter, 1);

    const summary = exporter.getFlushSummary();

    expect(summary.last_error!.message).toBe('OTEL endpoint unreachable');
  });

  it('last_error reflects the most recent error when multiple errors exist', () => {
    const exporter = new OtelExporter(cfg);
    injectErrors(exporter, [
      { message: 'first failure', at: new Date('2026-05-17T08:00:00Z') },
      { message: 'second failure', at: new Date('2026-05-17T09:00:00Z') },
      { message: 'third failure', at: new Date('2026-05-17T10:00:00Z') },
    ]);
    setAttempts(exporter, 10);

    const summary = exporter.getFlushSummary();

    expect(summary.last_error!.message).toBe('third failure');
    expect(summary.last_error!.timestamp).toBe('2026-05-17T10:00:00.000Z');
  });

  it('error_rate = 0 when flushAttempts = 0 (guard against division by zero)', () => {
    const exporter = new OtelExporter(cfg);
    injectErrors(exporter, [{ message: 'orphan error' }]);
    setAttempts(exporter, 0);

    const summary = exporter.getFlushSummary();

    expect(summary.error_rate).toBe(0);
    expect(summary.healthy).toBe(true); // 0 < 0.1
  });

  it('error_rate = errors / attempts — exact ratio', () => {
    const exporter = new OtelExporter(cfg);
    injectErrors(exporter, [
      { message: 'fail-1' },
      { message: 'fail-2' },
    ]);
    setAttempts(exporter, 10);

    const summary = exporter.getFlushSummary();

    // 2 errors / 10 attempts = 0.2
    expect(summary.error_rate).toBeCloseTo(0.2, 5);
    expect(summary.total_errors).toBe(2);
  });

  it('healthy = true when error_rate < 0.1 (boundary: 9/100 = 0.09)', () => {
    const exporter = new OtelExporter(cfg);
    const nineErrors = Array.from({ length: 9 }, (_, i) => ({ message: `err-${i}` }));
    injectErrors(exporter, nineErrors);
    setAttempts(exporter, 100);

    const summary = exporter.getFlushSummary();

    expect(summary.error_rate).toBeCloseTo(0.09, 5);
    expect(summary.healthy).toBe(true);
  });

  it('healthy = false when error_rate >= 0.1 (boundary: 10/100 = 0.1)', () => {
    const exporter = new OtelExporter(cfg);
    const tenErrors = Array.from({ length: 10 }, (_, i) => ({ message: `err-${i}` }));
    injectErrors(exporter, tenErrors);
    setAttempts(exporter, 100);

    const summary = exporter.getFlushSummary();

    expect(summary.error_rate).toBeCloseTo(0.1, 5);
    expect(summary.healthy).toBe(false);
  });

  it('healthy = false when error_rate > 0.1 (majority failures)', () => {
    const exporter = new OtelExporter(cfg);
    injectErrors(exporter, [{ message: 'fail' }]);
    setAttempts(exporter, 2); // 1/2 = 0.5

    const summary = exporter.getFlushSummary();

    expect(summary.healthy).toBe(false);
  });

  it('total_errors matches the injected error count', () => {
    const exporter = new OtelExporter(cfg);
    const fiveErrors = Array.from({ length: 5 }, (_, i) => ({ message: `e${i}` }));
    injectErrors(exporter, fiveErrors);
    setAttempts(exporter, 50);

    expect(exporter.getFlushSummary().total_errors).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// JsonWriter.getFlushSummary()
// ---------------------------------------------------------------------------

describe('JsonWriter.getFlushSummary() — domain contracts', () => {
  const cfg = {
    enabled: false,
    dest: 'stdout' as const,
  };

  it('returns zero-error healthy summary when no flushes have occurred', () => {
    const writer = new JsonWriter(cfg);
    const summary = writer.getFlushSummary();

    expect(summary.total_errors).toBe(0);
    expect(summary.last_error).toBeUndefined();
    expect(summary.error_rate).toBe(0);
    expect(summary.healthy).toBe(true);
  });

  it('reports last_error.timestamp as ISO-8601 string', () => {
    const writer = new JsonWriter(cfg);
    const fixedDate = new Date('2026-05-17T14:00:00.000Z');
    injectErrors(writer, [{ message: 'disk full', at: fixedDate }]);
    setAttempts(writer, 1);

    const summary = writer.getFlushSummary();

    expect(summary.last_error!.timestamp).toBe('2026-05-17T14:00:00.000Z');
    expect(summary.last_error!.message).toBe('disk full');
  });

  it('error_rate = 0 when flushAttempts = 0', () => {
    const writer = new JsonWriter(cfg);
    injectErrors(writer, [{ message: 'orphan' }]);
    setAttempts(writer, 0);

    expect(writer.getFlushSummary().error_rate).toBe(0);
  });

  it('error_rate = errors / attempts', () => {
    const writer = new JsonWriter(cfg);
    injectErrors(writer, [{ message: 'fail-1' }, { message: 'fail-2' }, { message: 'fail-3' }]);
    setAttempts(writer, 30);

    const summary = writer.getFlushSummary();

    // 3 / 30 = 0.1 — exactly at boundary
    expect(summary.error_rate).toBeCloseTo(0.1, 5);
    expect(summary.healthy).toBe(false); // 0.1 is NOT < 0.1
  });

  it('healthy = true when error_rate strictly below 0.1', () => {
    const writer = new JsonWriter(cfg);
    injectErrors(writer, [{ message: 'one-fail' }]);
    setAttempts(writer, 20); // 1/20 = 0.05

    const summary = writer.getFlushSummary();

    expect(summary.error_rate).toBeCloseTo(0.05, 5);
    expect(summary.healthy).toBe(true);
  });

  it('last_error is the most recent among multiple errors', () => {
    const writer = new JsonWriter(cfg);
    injectErrors(writer, [
      { message: 'early', at: new Date('2026-05-17T01:00:00Z') },
      { message: 'latest', at: new Date('2026-05-17T23:59:59Z') },
    ]);
    setAttempts(writer, 5);

    const summary = writer.getFlushSummary();

    expect(summary.last_error!.message).toBe('latest');
  });
});
