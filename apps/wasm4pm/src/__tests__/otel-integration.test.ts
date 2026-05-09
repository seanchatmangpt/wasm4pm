/**
 * otel-integration.test.ts — Plan E
 *
 * Verifies that command-level `withSpan` plumbing actually fires through the
 * process-global span sink. We avoid the subprocess boundary entirely by
 * exercising `withSpan` in-process: the CLI's bin entry installs the same
 * sink via `setGlobalSpanSink`, so this is a faithful proxy for the wired
 * commands.
 *
 * Note: full end-to-end (spawn `node dist/cli.js`) coverage is left to lab/
 * because the subprocess's globalSink lives in a different process and can't
 * be observed from the parent test process without a file/IPC bridge.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { OtelSpan } from '@wasm4pm/cognition';
import { setGlobalSpanSink, resetGlobalSpanSink } from '../otel/sink.js';
import { withSpan } from '../commands/_otel.js';

describe('OTEL integration: real sink capture (in-process)', () => {
  let captured: OtelSpan[] = [];

  beforeEach(() => {
    captured = [];
    setGlobalSpanSink((s) => captured.push(s));
  });

  afterEach(() => {
    resetGlobalSpanSink();
  });

  it('withSpan("run", ...) emits a span named wasm4pm.command.run', async () => {
    await withSpan('run', { algorithm: 'dfg', input: 'fixture.xes' }, async () => 'ok');
    expect(captured.length).toBeGreaterThanOrEqual(1);
    const runSpan = captured.find((s) => s.name === 'wasm4pm.command.run');
    expect(runSpan).toBeDefined();
    expect(runSpan!.status.code).toBe('OK');
    expect(runSpan!.attributes['service.name']).toBe('wasm4pm');
    expect(runSpan!.attributes['command']).toBe('run');
    expect(runSpan!.attributes['algorithm']).toBe('dfg');
  });

  it('withSpan emits ERROR status when the wrapped fn throws', async () => {
    await expect(
      withSpan('compare', {}, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(captured[0].status.code).toBe('ERROR');
    expect(captured[0].status.message).toBe('boom');
  });

  it('end_time >= start_time and both are nanoseconds (>= 1e15)', async () => {
    await withSpan('diff', {}, async () => null);
    const s = captured[0];
    expect(s.start_time).toBeGreaterThanOrEqual(1_000_000_000_000_000);
    expect(s.end_time).toBeGreaterThanOrEqual(s.start_time);
  });

  it('all 5 Phase A command names produce a span when wrapped', async () => {
    for (const name of ['run', 'compare', 'diff', 'conformance', 'quality']) {
      await withSpan(name, {}, async () => null);
    }
    const names = captured.map((s) => s.name);
    expect(names).toContain('wasm4pm.command.run');
    expect(names).toContain('wasm4pm.command.compare');
    expect(names).toContain('wasm4pm.command.diff');
    expect(names).toContain('wasm4pm.command.conformance');
    expect(names).toContain('wasm4pm.command.quality');
  });
});
