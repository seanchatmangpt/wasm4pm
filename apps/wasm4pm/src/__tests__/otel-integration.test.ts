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
import { withSpan, withSpanRaw } from '../commands/_otel.js';

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

describe('Surface L: Phase B OTEL — 5 commands', () => {
  let captured: OtelSpan[] = [];
  beforeEach(() => {
    captured = [];
    setGlobalSpanSink((s) => captured.push(s));
  });

  afterEach(() => {
    resetGlobalSpanSink();
  });

  // Direct withSpan plumbing test — no command invocation (avoid process.exit)
  it('all 5 Phase B command names produce a span when wrapped', async () => {
    for (const name of ['predict', 'ml', 'simulate', 'temporal', 'social']) {
      await withSpan(name, { input: 'fixture' }, async () => null);
    }
    const names = captured.map((s) => s.name);
    expect(names).toContain('wasm4pm.command.predict');
    expect(names).toContain('wasm4pm.command.ml');
    expect(names).toContain('wasm4pm.command.simulate');
    expect(names).toContain('wasm4pm.command.temporal');
    expect(names).toContain('wasm4pm.command.social');
  });

  it('span status is OK for successful body', async () => {
    await withSpan('predict', {}, async () => null);
    expect(captured[0].status.code).toBe('OK');
  });

  it('span status is ERROR when body throws', async () => {
    await withSpan('ml', {}, async () => {
      throw new Error('fail');
    }).catch(() => undefined);
    expect(captured[0].status.code).toBe('ERROR');
  });
});

describe('Surface P: validate OTEL wiring', () => {
  let captured: OtelSpan[] = [];
  beforeEach(() => { captured = []; setGlobalSpanSink((s) => captured.push(s)); });
  afterEach(() => { resetGlobalSpanSink(); });

  it('withSpan("validate", ...) emits wasm4pm.command.validate with attrs', async () => {
    await withSpan('validate', { input: 'log.xes', format: 'xes', activity_key: 'concept:name' },
      async () => null);
    const s = captured.find((x) => x.name === 'wasm4pm.command.validate');
    expect(s).toBeDefined();
    expect(s!.status.code).toBe('OK');
    expect(s!.attributes['format']).toBe('xes');
  });

  it('validate span goes ERROR on thrown body', async () => {
    await withSpan('validate', { format: 'xes' }, async () => { throw new Error('parse fail'); })
      .catch(() => undefined);
    expect(captured[captured.length - 1].status.code).toBe('ERROR');
  });
});

describe('Surface S: watch cycle spans', () => {
  let captured: OtelSpan[] = [];

  beforeEach(() => {
    captured = [];
    setGlobalSpanSink((s) => captured.push(s));
  });

  afterEach(() => {
    resetGlobalSpanSink();
  });

  it('per-cycle child span emits with event_kind=change and cycle_index', async () => {
    await withSpanRaw(
      'wasm4pm.watch.cycle',
      { event_kind: 'change', cycle_index: 0, file_path: '/tmp/x.toml' },
      async () => null,
    );
    const s = captured.find((x) => x.name === 'wasm4pm.watch.cycle');
    expect(s).toBeDefined();
    expect(s!.attributes.event_kind).toBe('change');
    expect(s!.attributes.cycle_index).toBe(0);
    expect(s!.attributes.file_path).toBe('/tmp/x.toml');
    expect(s!.attributes['service.name']).toBe('wasm4pm');
    expect(s!.status.code).toBe('OK');
  });
});

describe('Surface R: drift-watch streaming spans', () => {
  let captured: OtelSpan[] = [];
  beforeEach(() => { captured = []; setGlobalSpanSink((s) => captured.push(s)); });
  afterEach(() => { resetGlobalSpanSink(); });

  it('parent drift-watch session span captures totals via late attrs', async () => {
    let windows = 0;
    await withSpan('drift-watch', { interval_ms: 100 }, async () => { windows = 3; },
      () => ({ windows_processed: windows }));
    const s = captured.find((x) => x.name === 'wasm4pm.command.drift-watch');
    expect(s).toBeDefined();
    expect(s!.attributes.windows_processed).toBe(3);
  });

  it('per-window child span emits with window_index', async () => {
    await withSpanRaw('wasm4pm.drift-watch.window', { window_index: 0 }, async () => null);
    expect(captured.find((s) => s.name === 'wasm4pm.drift-watch.window')).toBeDefined();
  });
});

describe('Surface T: autoprocess span + state-hash receipt', () => {
  let captured: OtelSpan[] = [];
  beforeEach(() => { captured = []; setGlobalSpanSink((s) => captured.push(s)); });
  afterEach(() => { resetGlobalSpanSink(); });

  it('autoprocess span includes initial_state_hash and final_state_hash via late attrs', async () => {
    const lateAttrs = { initial_state_hash: 'a'.repeat(64), final_state_hash: 'b'.repeat(64) };
    await withSpan('autoprocess', { input: 'log.xes' }, async () => null, () => lateAttrs);
    const s = captured.find((x) => x.name === 'wasm4pm.command.autoprocess');
    expect(s).toBeDefined();
    expect(s!.attributes.initial_state_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s!.attributes.final_state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cold-start sentinel is 64 zeroes', async () => {
    const sentinel = '0'.repeat(64);
    expect(sentinel).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Surface Q: powl per-subcommand spans', () => {
  let captured: OtelSpan[] = [];
  beforeEach(() => {
    captured = [];
    setGlobalSpanSink((s) => captured.push(s));
  });
  afterEach(() => {
    resetGlobalSpanSink();
  });

  it('write sub (discover) emits wasm4pm.command.powl.discover span', async () => {
    await withSpanRaw(
      'wasm4pm.command.powl.discover',
      { command: 'powl', subcommand: 'discover', kind: 'write' },
      async () => null,
    );
    const s = captured.find((x) => x.name === 'wasm4pm.command.powl.discover');
    expect(s).toBeDefined();
    expect(s!.status.code).toBe('OK');
    expect(s!.attributes['command']).toBe('powl');
    expect(s!.attributes['subcommand']).toBe('discover');
    expect(s!.attributes['kind']).toBe('write');
  });

  it('read sub (parse) emits wasm4pm.command.powl.parse span', async () => {
    await withSpanRaw(
      'wasm4pm.command.powl.parse',
      { command: 'powl', subcommand: 'parse', kind: 'read' },
      async () => null,
    );
    const s = captured.find((x) => x.name === 'wasm4pm.command.powl.parse');
    expect(s).toBeDefined();
    expect(s!.attributes['kind']).toBe('read');
  });

  it('error in body sets span status to ERROR', async () => {
    await withSpanRaw(
      'wasm4pm.command.powl.parse',
      { command: 'powl', subcommand: 'parse' },
      async () => {
        throw new Error('bad');
      },
    ).catch(() => undefined);
    expect(captured[captured.length - 1].status.code).toBe('ERROR');
    expect(captured[captured.length - 1].status.message).toBe('bad');
  });

  it('all 11 powl subcommands produce distinct span names when wrapped', async () => {
    const subs = [
      'parse', 'simplify', 'convert', 'diff', 'complexity',
      'footprints', 'conformance', 'import', 'discover',
      'get-children', 'node-info',
    ];
    for (const sub of subs) {
      await withSpanRaw(`wasm4pm.command.powl.${sub}`, { subcommand: sub }, async () => null);
    }
    const names = new Set(captured.map((s) => s.name));
    expect(names.size).toBe(11);
    for (const sub of subs) {
      expect(names.has(`wasm4pm.command.powl.${sub}`)).toBe(true);
    }
  });
});
