import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockSourceAdapter,
  createMockSource,
  MockSinkAdapter,
  createMockSink,
  MockEngine,
  createMockEngine,
} from '../../src/mocks/index.js';

describe('MockSourceAdapter', () => {
  let source: MockSourceAdapter;

  beforeEach(() => {
    source = createMockSource();
  });

  it('creates with default options', () => {
    expect(source.kind).toBe('mock');
    expect(source.version).toBe('1.0.0-mock');
    expect(source.auth).toBeUndefined();
  });

  it('creates with custom kind', () => {
    const s = createMockSource({ kind: 'file' });
    expect(s.kind).toBe('file');
  });

  it('returns capabilities', () => {
    const caps = source.capabilities();
    expect(caps.streaming).toBe(false);
    expect(caps.formats).toContain('json');
    expect(caps.formats).toContain('xes');
  });

  it('returns custom capabilities', () => {
    const s = createMockSource({ capabilities: { streaming: true, watch: true } });
    const caps = s.capabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.watch).toBe(true);
  });

  it('fingerprint returns mock value', async () => {
    const fp = await source.fingerprint();
    expect(fp).toBe('mock-fingerprint-abc123');
  });

  it('fingerprint returns custom value', async () => {
    const s = createMockSource({ fingerprint: 'custom-fp' });
    expect(await s.fingerprint()).toBe('custom-fp');
  });

  it('validate succeeds by default', async () => {
    const result = await source.validate();
    expect(result.type).toBe('ok');
  });

  it('validate fails when configured', async () => {
    const s = createMockSource({ shouldFailValidate: true });
    const result = await s.validate();
    expect(result.type).toBe('err');
    expect(result.error).toContain('validation failure');
  });

  it('open succeeds by default', async () => {
    const result = await source.open();
    expect(result.type).toBe('ok');
    expect(result.value).toBeDefined();
    expect(source.isOpened).toBe(true);
  });

  it('open returns custom data', async () => {
    const s = createMockSource({ data: '{"traces":[{"events":[]}]}' });
    const result = await s.open();
    expect(result.type).toBe('ok');
    expect(result.value!.data).toContain('traces');
  });

  it('open fails when configured', async () => {
    const s = createMockSource({ shouldFailOpen: true });
    const result = await s.open();
    expect(result.type).toBe('err');
    expect(s.isOpened).toBe(false);
  });

  it('close marks adapter as closed', async () => {
    await source.close();
    expect(source.isClosed).toBe(true);
  });

  it('tracks call order', async () => {
    await source.validate();
    await source.open();
    await source.close();
    source.assertCallOrder(['validate', 'open', 'close']);
  });

  it('assertCallOrder throws on mismatch', async () => {
    await source.validate();
    expect(() => source.assertCallOrder(['open'])).toThrow('Call order mismatch');
  });

  it('reset clears state', async () => {
    await source.open();
    source.reset();
    expect(source.isOpened).toBe(false);
    expect(source.calls).toHaveLength(0);
  });

  it('supports validate delay', async () => {
    const s = createMockSource({ validateDelay: 10 });
    const start = Date.now();
    await s.validate();
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });
});

describe('MockSinkAdapter', () => {
  let sink: MockSinkAdapter;

  beforeEach(() => {
    sink = createMockSink();
  });

  it('creates with default options', () => {
    expect(sink.kind).toBe('mock');
    expect(sink.version).toBe('1.0.0-mock');
    expect(sink.atomicity).toBe('batch');
    expect(sink.onExists).toBe('overwrite');
    expect(sink.failureMode).toBe('fail_fast');
  });

  it('supports all artifact types by default', () => {
    const types = sink.supportedArtifacts();
    expect(types).toContain('receipt');
    expect(types).toContain('model');
    expect(types).toContain('report');
  });

  it('supportsArtifact checks correctly', () => {
    expect(sink.supportsArtifact('receipt')).toBe(true);
    const s = createMockSink({ supportedArtifacts: ['receipt'] });
    expect(s.supportsArtifact('model')).toBe(false);
  });

  it('validate succeeds by default', async () => {
    const result = await sink.validate();
    expect(result.type).toBe('ok');
  });

  it('validate fails when configured', async () => {
    const s = createMockSink({ shouldFailValidate: true });
    const result = await s.validate();
    expect(result.type).toBe('err');
  });

  it('write succeeds and records artifact', async () => {
    const result = await sink.write({ data: 'test' }, 'receipt');
    expect(result.type).toBe('ok');
    expect(result.value).toContain('/mock/');
    expect(sink.writeCount).toBe(1);
    expect(sink.written[0].type).toBe('receipt');
  });

  it('write fails when configured', async () => {
    const s = createMockSink({ shouldFailWrite: true });
    const result = await s.write({ data: 'test' }, 'receipt');
    expect(result.type).toBe('err');
    expect(s.writeCount).toBe(0);
  });

  it('write fails for specific artifact type', async () => {
    const s = createMockSink({ failOnArtifactType: 'report' });
    const r1 = await s.write({ data: 'test' }, 'receipt');
    const r2 = await s.write({ data: 'test' }, 'report');
    expect(r1.type).toBe('ok');
    expect(r2.type).toBe('err');
  });

  it('getWrittenByType filters correctly', async () => {
    await sink.write({ id: 1 }, 'receipt');
    await sink.write({ id: 2 }, 'model');
    await sink.write({ id: 3 }, 'receipt');
    expect(sink.getWrittenByType('receipt')).toHaveLength(2);
    expect(sink.getWrittenByType('model')).toHaveLength(1);
  });

  it('assertWritten passes when artifacts exist', async () => {
    await sink.write({}, 'receipt');
    expect(() => sink.assertWritten('receipt')).not.toThrow();
    expect(() => sink.assertWritten('receipt', 1)).not.toThrow();
  });

  it('assertWritten throws when no artifacts', () => {
    expect(() => sink.assertWritten('receipt')).toThrow('Expected at least one');
  });

  it('assertWritten throws on count mismatch', async () => {
    await sink.write({}, 'receipt');
    expect(() => sink.assertWritten('receipt', 2)).toThrow('Expected 2');
  });

  it('close marks adapter as closed', async () => {
    await sink.close();
    expect(sink.isClosed).toBe(true);
  });

  it('tracks calls', async () => {
    await sink.validate();
    await sink.write({}, 'receipt');
    await sink.close();
    expect(sink.calls.map(c => c.method)).toEqual(['validate', 'write', 'close']);
  });

  it('reset clears state', async () => {
    await sink.write({}, 'receipt');
    sink.reset();
    expect(sink.writeCount).toBe(0);
    expect(sink.calls).toHaveLength(0);
    expect(sink.isClosed).toBe(false);
  });
});

describe('MockEngine', () => {
  let engine: MockEngine;

  beforeEach(() => {
    engine = createMockEngine();
  });

  it('starts in uninitialized state', () => {
    expect(engine.state()).toBe('uninitialized');
  });

  it('bootstrap transitions to ready', async () => {
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');
    expect(engine.isReady()).toBe(true);
  });

  it('bootstrap failure transitions to failed', async () => {
    const e = createMockEngine({ shouldFailBootstrap: true });
    await expect(e.bootstrap()).rejects.toThrow('Mock bootstrap failure');
    expect(e.state()).toBe('failed');
    expect(e.isFailed()).toBe(true);
  });

  it('plan returns execution plan', async () => {
    await engine.bootstrap();
    const plan = await engine.plan({});
    expect(plan.id).toContain('plan-');
    expect(plan.hash).toContain('mock-hash-');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(engine.state()).toBe('ready');
  });

  it('plan failure transitions to failed', async () => {
    const e = createMockEngine({ shouldFailPlan: true });
    await e.bootstrap();
    await expect(e.plan({})).rejects.toThrow('Mock plan failure');
    expect(e.state()).toBe('failed');
  });

  it('run returns execution receipt', async () => {
    await engine.bootstrap();
    const plan = await engine.plan({});
    const receipt = await engine.run(plan);
    expect(receipt.runId).toContain('run-');
    expect(receipt.planId).toBe(plan.id);
    expect(receipt.progress).toBe(100);
    expect(receipt.errors).toHaveLength(0);
    expect(engine.state()).toBe('ready');
  });

  it('run failure transitions to failed', async () => {
    const e = createMockEngine({ shouldFailRun: true });
    await e.bootstrap();
    const plan = await e.plan({});
    await expect(e.run(plan)).rejects.toThrow('Mock run failure');
    expect(e.state()).toBe('failed');
  });

  it('watch yields status updates', async () => {
    const e = createMockEngine({ watchUpdates: 3, watchInterval: 5 });
    await e.bootstrap();
    const plan = await e.plan({});
    const updates: any[] = [];
    for await (const update of e.watch(plan)) {
      updates.push(update);
    }
    expect(updates).toHaveLength(3);
    expect(updates[0].progress).toBeLessThan(updates[2].progress);
    expect(updates[2].progress).toBe(100);
  });

  it('shutdown transitions to uninitialized', async () => {
    await engine.bootstrap();
    await engine.shutdown();
    expect(engine.state()).toBe('uninitialized');
  });

  it('tracks lifecycle history', async () => {
    await engine.bootstrap();
    const history = engine.getTransitionHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].fromState).toBe('uninitialized');
    expect(history[0].toState).toBe('bootstrapping');
  });

  it('tracks method calls', async () => {
    await engine.bootstrap();
    await engine.plan({});
    expect(engine.calls.map(c => c.method)).toEqual(['bootstrap', 'plan']);
  });

  it('reset clears all state', async () => {
    await engine.bootstrap();
    await engine.plan({});
    engine.reset();
    expect(engine.state()).toBe('uninitialized');
    expect(engine.calls).toHaveLength(0);
    expect(engine.getTransitionHistory()).toHaveLength(0);
  });
});
