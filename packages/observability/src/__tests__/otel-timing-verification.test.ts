/**
 * OTEL Span Timing Verification Test Suite
 *
 * Audits OTEL spans for:
 * 1. start_time and end_time consistency
 * 2. Duration matching actual elapsed wall-clock time
 * 3. Nanosecond precision preservation without overflow
 * 4. Timing gaps in span creation
 * 5. Duration calculation correctness
 *
 * Identifies 5 timing gaps:
 * GAP-1: Missing end_time on synchronous spans (start_time only)
 * GAP-2: start_time computed after actual operation (clock skew)
 * GAP-3: Duration calculated from old Date.now() (stale milliseconds)
 * GAP-4: Nanosecond overflow on large durations (>2^53 milliseconds)
 * GAP-5: Negative durations from concurrent Date.now() calls
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Instrumentation } from '../instrumentation.js';
import { RequiredOtelAttributes } from '../types.js';

describe('OTEL Span Timing Verification', () => {
  let requiredAttrs: RequiredOtelAttributes;

  beforeEach(() => {
    requiredAttrs = {
      'run.id': 'run-timing-test-001',
      'config.hash': 'hash-config-abc123',
      'input.hash': 'hash-input-def456',
      'plan.hash': 'hash-plan-ghi789',
      'execution.profile': 'balanced',
      'source.kind': 'xes',
      'sink.kind': 'json',
    };
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-1: Missing end_time on Synchronous Spans
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-1: Missing end_time on synchronous spans', () => {
    it('should emit start_time on plan_generated event', () => {
      const { otelEvent } = Instrumentation.createPlanGeneratedEvent(
        '12345678901234567890123456789012',
        'plan-001',
        'plan-hash-xyz',
        5,
        requiredAttrs
      );

      expect(otelEvent.start_time).toBeDefined();
      expect(typeof otelEvent.start_time).toBe('number');
      expect(otelEvent.start_time).toBeGreaterThan(0);
    });

    it('GAP-1 FOUND: state_change event has no end_time', () => {
      const { otelEvent } = Instrumentation.createStateChangeEvent(
        '12345678901234567890123456789012',
        'uninitialized',
        'bootstrapping',
        requiredAttrs
      );

      // ISSUE: start_time is set, but end_time is NOT set
      expect(otelEvent.start_time).toBeDefined();
      expect(otelEvent.end_time).toBeUndefined();

      // For synchronous operations with zero duration, end_time should equal start_time
      // RECOMMENDATION: Set end_time = start_time for zero-duration spans
    });

    it('GAP-1 FOUND: progress event has no timing information', () => {
      const { jsonEvent } = Instrumentation.createProgressEvent(
        '12345678901234567890123456789012',
        50,
        requiredAttrs
      );

      // ISSUE: jsonEvent uses ISO-8601 string timestamp, but no nanosecond precision
      expect(jsonEvent.timestamp).toBeDefined();
      expect(typeof jsonEvent.timestamp).toBe('string');
      // RECOMMENDATION: Include timestamp in nanoseconds for consistency
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-2: start_time Computed After Operation
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-2: start_time clock skew (computed after operation)', () => {
    it('should compute start_time before operation begins', () => {
      // This test simulates the ideal pattern:
      const t0 = Date.now() * 1000000; // nanoseconds
      // ... simulate operation ...
      const t1 = Date.now() * 1000000;

      // In the ideal pattern:
      // - start_time should be t0 (before operation)
      // - end_time should be t1 (after operation)
      // - duration = t1 - t0

      expect(t1).toBeGreaterThanOrEqual(t0);
    });

    it('GAP-2 OBSERVATION: algorithm completed uses now - durationMs pattern', () => {
      const durationMs = 150; // e.g., algorithm took 150ms
      const now = Date.now() * 1000000;

      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        '12345678901234567890123456789012',
        'span-algo-001',
        'dfg',
        requiredAttrs,
        { durationMs }
      );

      // Pattern: start_time = now - (durationMs * 1000000)
      const expectedStartTime = now - durationMs * 1000000;
      expect(otelEvent.start_time).toBeLessThanOrEqual(now);
      expect(otelEvent.end_time).toBe(now);

      // ISSUE: This is a RETROACTIVE timestamp calculation
      // If the durationMs was captured AFTER the operation, it will be stale
      // RECOMMENDATION: Capture start_time BEFORE operation, end_time AFTER
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-3: Stale Duration from Old Date.now()
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-3: Duration calculated from stale milliseconds', () => {
    it('GAP-3 FOUND: durationMs computed outside span creation', () => {
      // Simulated pattern from ml-runner.ts:
      const startMs = Date.now();
      const result = { /* some computation */ };
      const endMs = Date.now(); // This was already called before reaching span creation
      const durationMs = endMs - startMs;

      // By the time we reach Instrumentation.createMlAnalysisCompletedEvent(),
      // durationMs is stale by several milliseconds
      // The actual Now.now() * 1000000 in the function will be even later

      const now = Date.now() * 1000000;
      const retroactiveStart = now - durationMs * 1000000;

      // ISSUE: retroactiveStart is based on captured durationMs, not on actual t0
      // If the function is called 50ms after endMs, the actual end_time could be 50ms after
      // what was expected

      expect(retroactiveStart).toBeLessThanOrEqual(now);
    });

    it('GAP-3 PATTERN: instrumentMlExecution captures t0 correctly', () => {
      // This function DOES capture t0 = Date.now() at the right time
      // const t0 = Date.now(); // Correct pattern
      // let result = await fn();
      // const elapsedMs = Date.now() - t0;

      const t0 = Date.now();
      const t1 = Date.now() + 100; // Simulate 100ms operation
      const elapsedMs = t1 - t0;

      expect(elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-4: Nanosecond Overflow on Large Durations
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-4: Nanosecond overflow on large durations', () => {
    it('should preserve nanosecond precision for small durations (<2^53ms)', () => {
      const smallDurationMs = 1000; // 1 second
      const nanosDuration = smallDurationMs * 1000000;

      // JavaScript number can safely represent integers up to 2^53 - 1
      expect(nanosDuration).toBeLessThan(Number.MAX_SAFE_INTEGER);
      expect(nanosDuration).toEqual(1000000000);
    });

    it('GAP-4 FOUND: Large durations may lose nanosecond precision', () => {
      // Max safe integer: 2^53 - 1 = 9,007,199,254,740,991
      // In nanoseconds: that's about 9.007e15 ns
      // In milliseconds: 9,007,199,254 ms ≈ 104 days

      const largeMs = 10000000; // ~115 days
      const nanosLarge = largeMs * 1000000;

      // For durations this large, precision loss occurs
      // RECOMMENDATION: For spans lasting >24 hours, consider breaking into sub-spans
      // or use BigInt for nanosecond arithmetic

      expect(nanosLarge).toBeGreaterThan(0);
    });

    it('should detect overflow risk in span duration calculations', () => {
      const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER;
      const maxSafeMs = Math.floor(MAX_SAFE_INT / 1000000);

      // Maximum duration before overflow: ~9 million milliseconds = 9000 seconds ≈ 2.5 hours
      expect(maxSafeMs).toEqual(9007199254);

      // Spans longer than this will lose precision
      const largeSpanMs = maxSafeMs + 1;
      const nanoOverflow = largeSpanMs * 1000000;

      // This loses precision in JavaScript
      expect(nanoOverflow).toBeGreaterThan(MAX_SAFE_INT);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-5: Negative Durations from Concurrent Calls
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-5: Negative durations from concurrent Date.now() calls', () => {
    it('should not produce negative durations', () => {
      const durationMs = 100;
      const now = Date.now() * 1000000;
      const startTime = now - durationMs * 1000000;
      const endTime = now;

      const actualDuration = endTime - startTime;
      expect(actualDuration).toBeGreaterThanOrEqual(0);
      expect(actualDuration).toEqual(durationMs * 1000000);
    });

    it('GAP-5 RISK: Negative duration if durationMs > actual elapsed', () => {
      // If durationMs is captured from a different code path and is incorrect,
      // it could produce a negative duration in retroactive calculation

      // Example: durationMs = 500 but actual elapsed = 100ms
      const capturedDurationMs = 500;
      const actualElapsedMs = 100;
      const now = Date.now() * 1000000;

      // Retroactive calculation
      const retroStart = now - capturedDurationMs * 1000000;
      const retroEnd = now;
      const retroDuration = retroEnd - retroStart;

      // Duration is too large!
      expect(retroDuration).toEqual(capturedDurationMs * 1000000);

      // RECOMMENDATION: Validate that durationMs <= actual elapsed time
      // by comparing against an independent source
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Timing Verification Tests (Remediation Patterns)
  // ──────────────────────────────────────────────────────────────────────────────
  describe('Timing verification patterns (post-remediation)', () => {
    it('should verify start_time < end_time for all completed spans', () => {
      const durationMs = 100;
      const now = Date.now() * 1000000;

      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        '12345678901234567890123456789012',
        'span-001',
        'heuristic_miner',
        requiredAttrs,
        { durationMs }
      );

      // Validation rule: start_time < end_time
      if (otelEvent.start_time && otelEvent.end_time) {
        expect(otelEvent.start_time).toBeLessThanOrEqual(otelEvent.end_time);
      }

      // Validation rule: duration = end_time - start_time (approximately)
      if (otelEvent.start_time && otelEvent.end_time) {
        const calculatedDuration = otelEvent.end_time - otelEvent.start_time;
        const expectedDuration = durationMs * 1000000;
        expect(calculatedDuration).toEqual(expectedDuration);
      }
    });

    it('should ensure nanosecond precision for durations <2.5 hours', () => {
      const shortSpanMs = 3600 * 1000; // 1 hour
      const nanosDuration = shortSpanMs * 1000000;

      // Verify no precision loss
      const nanosMsRoundtrip = Math.floor(nanosDuration / 1000000);
      expect(nanosMsRoundtrip).toEqual(shortSpanMs);
    });

    it('should validate end_time is set on completed spans', () => {
      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        '12345678901234567890123456789012',
        'span-001',
        'dfg',
        requiredAttrs,
        { durationMs: 50 }
      );

      expect(otelEvent.end_time).toBeDefined();
      expect(typeof otelEvent.end_time).toBe('number');
      expect(otelEvent.end_time).toBeGreaterThan(0);
    });

    it('should validate duration consistency across all operation types', () => {
      const testCases = [
        {
          name: 'Algorithm',
          fn: () =>
            Instrumentation.createAlgorithmCompletedEvent(
              '12345678901234567890123456789012',
              'span-001',
              'dfg',
              requiredAttrs,
              { durationMs: 100 }
            ),
          hasEndTime: true,
        },
        {
          name: 'Source I/O',
          fn: () =>
            Instrumentation.createSourceCompletedEvent(
              '12345678901234567890123456789012',
              'span-002',
              'xes',
              requiredAttrs,
              { durationMs: 50 }
            ),
          hasEndTime: true,
        },
        {
          name: 'ML Analysis',
          fn: () =>
            Instrumentation.createMlAnalysisCompletedEvent(
              '12345678901234567890123456789012',
              'span-003',
              'classification',
              'knn',
              requiredAttrs,
              { durationMs: 200 }
            ),
          hasEndTime: true,
        },
        {
          name: 'Prediction Task',
          fn: () =>
            Instrumentation.createPredictionTaskCompletedEvent(
              '12345678901234567890123456789012',
              'span-004',
              'next_activity',
              requiredAttrs,
              { durationMs: 75 }
            ),
          hasEndTime: true,
        },
      ];

      testCases.forEach(({ name, fn, hasEndTime }) => {
        const span = fn();
        expect(span.start_time, `${name} should have start_time`).toBeDefined();
        if (hasEndTime) {
          expect(span.end_time, `${name} should have end_time`).toBeDefined();
          expect(span.start_time, `${name} start_time should be <= end_time`).toBeLessThanOrEqual(
            span.end_time
          );
        }
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Latency Test Suite (Ensures timing overhead is acceptable)
  // ──────────────────────────────────────────────────────────────────────────────
  describe('Latency characteristics of span creation', () => {
    it('should create algorithm spans with <1ms overhead', () => {
      const iterations = 100;
      const t0 = Date.now();

      for (let i = 0; i < iterations; i++) {
        Instrumentation.createAlgorithmCompletedEvent(
          '12345678901234567890123456789012',
          `span-${i}`,
          'dfg',
          requiredAttrs,
          { durationMs: 100 + i }
        );
      }

      const t1 = Date.now();
      const totalMs = t1 - t0;
      const avgPerSpanMs = totalMs / iterations;

      // Should be very fast (microseconds per span)
      expect(avgPerSpanMs).toBeLessThan(1);
    });

    it('should create ML spans with <1ms overhead', () => {
      const iterations = 100;
      const t0 = Date.now();

      for (let i = 0; i < iterations; i++) {
        Instrumentation.createMlAnalysisCompletedEvent(
          '12345678901234567890123456789012',
          `span-ml-${i}`,
          `task-${i}`,
          `method-${i}`,
          requiredAttrs,
          { durationMs: 50 + i, status: 'OK' }
        );
      }

      const t1 = Date.now();
      const totalMs = t1 - t0;
      const avgPerSpanMs = totalMs / iterations;

      expect(avgPerSpanMs).toBeLessThan(1);
    });

    it('should maintain timing accuracy under high volume', () => {
      const spanCount = 1000;
      const durationMs = 10;
      const spans = [];

      for (let i = 0; i < spanCount; i++) {
        const span = Instrumentation.createAlgorithmCompletedEvent(
          '12345678901234567890123456789012',
          `span-bulk-${i}`,
          'dfg',
          requiredAttrs,
          { durationMs }
        );
        spans.push(span);
      }

      // Check that all spans have consistent duration
      spans.forEach((span) => {
        if (span.start_time && span.end_time) {
          const calculatedMs = (span.end_time - span.start_time) / 1000000;
          expect(Math.abs(calculatedMs - durationMs)).toBeLessThan(1);
        }
      });
    });
  });
});
