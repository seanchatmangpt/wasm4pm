import { describe, it, expect, beforeEach } from 'vitest';
import { OtelCapture, createOtelCapture } from '../../src/harness/otel-capture.js';
import type { CapturedOtelSpan, CapturedJsonEvent } from '../../src/harness/otel-capture.js';

describe('OtelCapture', () => {
  let capture: OtelCapture;

  beforeEach(() => {
    capture = createOtelCapture();
  });

  const makeSpan = (overrides?: Partial<CapturedOtelSpan>): CapturedOtelSpan => ({
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'test-span',
    startTime: Date.now() * 1_000_000,
    attributes: { 'run.id': 'run-1', 'config.hash': 'abc' },
    events: [],
    ...overrides,
  });

  const makeJsonEvent = (overrides?: Partial<CapturedJsonEvent>): CapturedJsonEvent => ({
    timestamp: new Date().toISOString(),
    component: 'engine',
    eventType: 'state_change',
    data: {},
    ...overrides,
  });

  describe('captureSpan', () => {
    it('stores spans', () => {
      capture.captureSpan(makeSpan());
      expect(capture.spans).toHaveLength(1);
    });

    it('stores multiple spans', () => {
      capture.captureSpan(makeSpan({ name: 'span-1' }));
      capture.captureSpan(makeSpan({ name: 'span-2' }));
      expect(capture.spans).toHaveLength(2);
    });

    it('does not share references', () => {
      const span = makeSpan();
      capture.captureSpan(span);
      span.name = 'modified';
      expect(capture.spans[0].name).toBe('test-span');
    });
  });

  describe('captureJson', () => {
    it('stores JSON events', () => {
      capture.captureJson(makeJsonEvent());
      expect(capture.jsonEvents).toHaveLength(1);
    });
  });

  describe('captureCli', () => {
    it('stores CLI events', () => {
      capture.captureCli({ level: 'info', message: 'test', timestamp: new Date() });
      expect(capture.cliEvents).toHaveLength(1);
    });
  });

  describe('captureRaw', () => {
    it('routes OTEL events by trace_id', () => {
      capture.captureRaw({
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        name: 'raw-span',
        attributes: {},
      });
      expect(capture.spans).toHaveLength(1);
      expect(capture.spans[0].name).toBe('raw-span');
    });

    it('routes JSON events by component', () => {
      capture.captureRaw({
        component: 'planner',
        event_type: 'plan_generated',
        data: { steps: 5 },
      });
      expect(capture.jsonEvents).toHaveLength(1);
      expect(capture.jsonEvents[0].component).toBe('planner');
    });

    it('routes CLI events as fallback', () => {
      capture.captureRaw({ level: 'warn', message: 'warning!' });
      expect(capture.cliEvents).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('returns correct counts', () => {
      capture.captureSpan(makeSpan());
      capture.captureSpan(makeSpan({ traceId: 'c'.repeat(32) }));
      capture.captureJson(makeJsonEvent());
      capture.captureCli({ level: 'info', message: 'msg', timestamp: new Date() });

      const stats = capture.stats();
      expect(stats.spanCount).toBe(2);
      expect(stats.jsonEventCount).toBe(1);
      expect(stats.cliEventCount).toBe(1);
      expect(stats.traceIds).toHaveLength(2);
    });

    it('counts span events', () => {
      capture.captureSpan(makeSpan({
        events: [
          { name: 'evt1', timestamp: Date.now() },
          { name: 'evt2', timestamp: Date.now() },
        ],
      }));
      expect(capture.stats().eventCount).toBe(2);
    });

    it('lists unique components', () => {
      capture.captureJson(makeJsonEvent({ component: 'engine' }));
      capture.captureJson(makeJsonEvent({ component: 'planner' }));
      capture.captureJson(makeJsonEvent({ component: 'engine' }));
      expect(capture.stats().components).toHaveLength(2);
      expect(capture.stats().components).toContain('engine');
      expect(capture.stats().components).toContain('planner');
    });
  });

  describe('findSpans', () => {
    it('finds by name string', () => {
      capture.captureSpan(makeSpan({ name: 'engine.bootstrap' }));
      capture.captureSpan(makeSpan({ name: 'engine.plan' }));
      capture.captureSpan(makeSpan({ name: 'sink.write' }));
      expect(capture.findSpans('engine')).toHaveLength(2);
    });

    it('finds by regex', () => {
      capture.captureSpan(makeSpan({ name: 'engine.bootstrap' }));
      capture.captureSpan(makeSpan({ name: 'planner.plan' }));
      expect(capture.findSpans(/^engine\./)).toHaveLength(1);
    });
  });

  describe('findSpansByAttribute', () => {
    it('finds spans with attribute key', () => {
      capture.captureSpan(makeSpan({ attributes: { 'run.id': 'run-1' } }));
      capture.captureSpan(makeSpan({ attributes: { other: 'val' } }));
      expect(capture.findSpansByAttribute('run.id')).toHaveLength(1);
    });

    it('finds spans with attribute key and value', () => {
      capture.captureSpan(makeSpan({ attributes: { 'run.id': 'run-1' } }));
      capture.captureSpan(makeSpan({ attributes: { 'run.id': 'run-2' } }));
      expect(capture.findSpansByAttribute('run.id', 'run-1')).toHaveLength(1);
    });
  });

  describe('findJsonEvents', () => {
    it('filters by component', () => {
      capture.captureJson(makeJsonEvent({ component: 'engine' }));
      capture.captureJson(makeJsonEvent({ component: 'planner' }));
      expect(capture.findJsonEvents('engine')).toHaveLength(1);
    });
  });

  describe('assertRequiredAttributes', () => {
    it('returns no errors when all present', () => {
      capture.captureSpan(makeSpan({ attributes: { 'run.id': '1', 'config.hash': 'h' } }));
      const errors = capture.assertRequiredAttributes(['run.id', 'config.hash']);
      expect(errors).toHaveLength(0);
    });

    it('returns errors for missing attributes', () => {
      capture.captureSpan(makeSpan({ attributes: { 'run.id': '1' } }));
      const errors = capture.assertRequiredAttributes(['run.id', 'config.hash']);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('config.hash');
    });

    it('checks all spans', () => {
      capture.captureSpan(makeSpan({ name: 's1', attributes: { 'run.id': '1' } }));
      capture.captureSpan(makeSpan({ name: 's2', attributes: {} }));
      const errors = capture.assertRequiredAttributes(['run.id']);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('s2');
    });
  });

  describe('assertNonBlocking', () => {
    it('passes for fast spans', () => {
      const now = Date.now() * 1_000_000;
      capture.captureSpan(makeSpan({ startTime: now, endTime: now + 1_000_000 })); // 1ms
      const errors = capture.assertNonBlocking(100);
      expect(errors).toHaveLength(0);
    });

    it('fails for slow spans', () => {
      const now = Date.now() * 1_000_000;
      capture.captureSpan(makeSpan({ startTime: now, endTime: now + 200_000_000 })); // 200ms
      const errors = capture.assertNonBlocking(100);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('exceeds');
    });
  });

  describe('assertValidTraces', () => {
    it('passes for valid parent-child relationships', () => {
      capture.captureSpan(makeSpan({ spanId: 'parent123456789a' }));
      capture.captureSpan(makeSpan({ spanId: 'child1234567890a', parentSpanId: 'parent123456789a' }));
      const errors = capture.assertValidTraces();
      expect(errors).toHaveLength(0);
    });

    it('fails for orphaned child spans', () => {
      capture.captureSpan(makeSpan({ spanId: 'child1234567890a', parentSpanId: 'nonexistent12345' }));
      const errors = capture.assertValidTraces();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('unknown parent');
    });

    it('passes for root spans without parent', () => {
      capture.captureSpan(makeSpan({ parentSpanId: undefined }));
      const errors = capture.assertValidTraces();
      expect(errors).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all captured data', () => {
      capture.captureSpan(makeSpan());
      capture.captureJson(makeJsonEvent());
      capture.captureCli({ level: 'info', message: '', timestamp: new Date() });
      capture.clear();
      expect(capture.spans).toHaveLength(0);
      expect(capture.jsonEvents).toHaveLength(0);
      expect(capture.cliEvents).toHaveLength(0);
    });
  });
});
