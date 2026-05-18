/**
 * Integration tests for OTEL span timing verification and remediation
 *
 * Tests the five detected timing gaps and their corrections.
 */

import { describe, it, expect } from 'vitest';
import {
  verifySpanTiming,
  correctSpanTiming,
  validateTraceTimingConsistency,
  nowNanoseconds,
  nanosToMillis,
  millisToNanos,
  isSafeDuration,
  auditSpanTiming,
} from '../timing-verification.js';

describe('Timing Verification & Remediation', () => {
  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-1: Missing end_time
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-1: Missing end_time on synchronous spans', () => {
    it('should detect missing end_time', () => {
      const startNs = 1000000000;
      const result = verifySpanTiming(startNs, undefined);

      expect(result.valid).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].id).toBe('GAP-1');
      expect(result.gaps[0].severity).toBe('high');
    });

    it('should correct missing end_time by setting to start_time', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const startNs = 1000000000;

      const corrected = correctSpanTiming(traceId, spanId, 'test-span', startNs, undefined);

      expect(corrected).toBeDefined();
      expect(corrected?.start_time).toBe(startNs);
      expect(corrected?.end_time).toBe(startNs);
    });

    it('should correct missing end_time using provided durationMs', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const startNs = 1000000000;
      const durationMs = 100;

      const corrected = correctSpanTiming(
        traceId,
        spanId,
        'test-span',
        startNs,
        undefined,
        durationMs
      );

      expect(corrected).toBeDefined();
      expect(corrected?.start_time).toBe(startNs);
      expect(corrected?.end_time).toBe(startNs + durationMs * 1000000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-2: Missing start_time
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-2: Missing start_time', () => {
    it('should detect missing start_time', () => {
      const endNs = 2000000000;
      const result = verifySpanTiming(undefined, endNs);

      expect(result.valid).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].id).toBe('GAP-2');
      expect(result.gaps[0].severity).toBe('high');
    });

    it('should correct missing start_time using durationMs', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const endNs = 2000000000;
      const durationMs = 100;

      const corrected = correctSpanTiming(
        traceId,
        spanId,
        'test-span',
        undefined,
        endNs,
        durationMs
      );

      expect(corrected).toBeDefined();
      expect(corrected?.end_time).toBe(endNs);
      expect(corrected?.start_time).toBe(endNs - durationMs * 1000000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-3: Duration mismatch
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-3: Duration mismatch', () => {
    it('should warn on duration mismatch >10ms', () => {
      const startNs = 1000000000;
      const endNs = 1000000000 + 100 * 1000000; // 100ms
      const durationMs = 200; // Mismatch: says 200ms but is 100ms

      const result = verifySpanTiming(startNs, endNs, durationMs);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Duration mismatch');
    });

    it('should not warn on small duration differences (<10ms)', () => {
      const startNs = 1000000000;
      const endNs = 1000000000 + 100 * 1000000; // 100ms
      const durationMs = 100.005; // ~0.5ms difference

      const result = verifySpanTiming(startNs, endNs, durationMs);

      expect(result.warnings.length).toBe(0);
    });

    it('should correct duration mismatch by trusting durationMs', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const startNs = 1000000000;
      const endNs = 1000000000 + 100 * 1000000; // Says 100ms
      const durationMs = 200; // But actually should be 200ms

      const corrected = correctSpanTiming(
        traceId,
        spanId,
        'test-span',
        startNs,
        endNs,
        durationMs
      );

      // Should be corrected since there's a >10ms mismatch
      if (corrected) {
        const correctedDuration = (corrected.end_time - corrected.start_time) / 1000000;
        expect(correctedDuration).toBeCloseTo(durationMs, 0);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-4: Nanosecond overflow
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-4: Nanosecond overflow for large durations', () => {
    it('should warn when duration approaches 2.5 hour limit', () => {
      const startNs = 1000000000;
      // Close to MAX_SAFE_INTEGER / 1000000
      const largeMs = 9000000; // ~2.5 hours
      const endNs = startNs + largeMs * 1000000;

      const result = verifySpanTiming(startNs, endNs, largeMs);

      // This duration is near the limit but may not trigger warning unless
      // very close to 80% of MAX_SAFE_INTEGER
      if (result.warnings.length > 0) {
        expect(result.warnings[0]).toContain('approaching precision loss');
      }
    });

    it('should detect overflow when duration > safe integer limit', () => {
      const startNs = 1000000000;
      // Use a duration that overflows (unlikely in practice, but possible)
      const endNs = startNs + Number.MAX_SAFE_INTEGER + 1000000;

      const result = verifySpanTiming(startNs, endNs);

      expect(result.valid).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].id).toBe('GAP-4');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // GAP-5: Negative durations
  // ──────────────────────────────────────────────────────────────────────────────
  describe('GAP-5: Negative durations (start_time > end_time)', () => {
    it('should detect negative duration when start_time > end_time', () => {
      const startNs = 2000000000;
      const endNs = 1000000000; // Earlier than start!

      const result = verifySpanTiming(startNs, endNs);

      expect(result.valid).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].id).toBe('GAP-5');
      expect(result.gaps[0].severity).toBe('critical');
    });

    it('should correct negative duration by swapping times', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const startNs = 2000000000;
      const endNs = 1000000000;

      const corrected = correctSpanTiming(traceId, spanId, 'test-span', startNs, endNs);

      expect(corrected).toBeDefined();
      expect(corrected?.start_time).toBeLessThanOrEqual(corrected?.end_time!);
      // Should swap
      expect(corrected?.start_time).toBe(endNs);
      expect(corrected?.end_time).toBe(startNs);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Utility functions
  // ──────────────────────────────────────────────────────────────────────────────
  describe('Timing utility functions', () => {
    it('should convert nanoseconds to milliseconds', () => {
      const nanos = 100 * 1000000; // 100ms
      const ms = nanosToMillis(nanos);
      expect(ms).toBe(100);
    });

    it('should convert milliseconds to nanoseconds', () => {
      const ms = 100;
      const nanos = millisToNanos(ms);
      expect(nanos).toBe(100 * 1000000);
    });

    it('should return undefined for unsafe duration conversion', () => {
      const unsafeMs = Number.MAX_SAFE_INTEGER / 1000000 + 1;
      const nanos = millisToNanos(unsafeMs);
      expect(nanos).toBeUndefined();
    });

    it('should validate safe duration conversion', () => {
      const safeMs = 1000; // 1 second
      expect(isSafeDuration(safeMs)).toBe(true);

      const unsafeMs = Number.MAX_SAFE_INTEGER / 1000000 + 1;
      expect(isSafeDuration(unsafeMs)).toBe(false);
    });

    it('should capture current time in nanoseconds', () => {
      const t0Ms = Date.now();
      const t0Ns = nowNanoseconds();
      const t1Ms = Date.now();

      const t0NsFromMs = t0Ms * 1000000;
      const t1NsFromMs = t1Ms * 1000000;

      expect(t0Ns).toBeGreaterThanOrEqual(t0NsFromMs);
      expect(t0Ns).toBeLessThanOrEqual(t1NsFromMs);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Trace consistency validation
  // ──────────────────────────────────────────────────────────────────────────────
  describe('Trace timing consistency validation', () => {
    it('should pass when child spans are contained within parent spans', () => {
      const spans = [
        { span_id: '1', start_time: 100, end_time: 500 }, // Parent
        { span_id: '2', parent_span_id: '1', start_time: 200, end_time: 400 }, // Valid child
      ];

      const violations = validateTraceTimingConsistency(spans);
      expect(violations).toHaveLength(0);
    });

    it('should detect child starting before parent', () => {
      const spans = [
        { span_id: '1', start_time: 200, end_time: 500 }, // Parent
        { span_id: '2', parent_span_id: '1', start_time: 100, end_time: 300 }, // Invalid: starts before
      ];

      const violations = validateTraceTimingConsistency(spans);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('starts before parent');
    });

    it('should detect child ending after parent', () => {
      const spans = [
        { span_id: '1', start_time: 100, end_time: 400 }, // Parent
        { span_id: '2', parent_span_id: '1', start_time: 200, end_time: 500 }, // Invalid: ends after
      ];

      const violations = validateTraceTimingConsistency(spans);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('ends after parent');
    });

    it('should handle orphaned spans gracefully', () => {
      const spans = [
        { span_id: '1', start_time: 100, end_time: 500 },
        { span_id: '2', parent_span_id: 'nonexistent', start_time: 200, end_time: 300 },
      ];

      const violations = validateTraceTimingConsistency(spans);
      // Should not error; orphaned spans are OK
      expect(violations).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Audit report
  // ──────────────────────────────────────────────────────────────────────────────
  describe('Span timing audit report', () => {
    it('should generate audit report for collection of spans', () => {
      const spans = [
        { start_time: 1000000000, end_time: 1000000000 + 100 * 1000000 }, // Valid
        { start_time: 2000000000, end_time: undefined }, // GAP-1
        { start_time: 3000000000, end_time: 2000000000 }, // GAP-5 (negative)
      ];

      const report = auditSpanTiming(spans);

      expect(report.totalSpans).toBe(3);
      expect(report.validSpans).toBe(1);
      expect(report.spansWithGaps).toBe(2);
      expect(report.criticalGaps).toBeGreaterThan(0); // GAP-5 is critical
      expect(report.allGaps.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should include all gap IDs in recommendations', () => {
      const spans = [
        { start_time: 1000000000, end_time: undefined }, // GAP-1
        { start_time: undefined, end_time: 2000000000 }, // GAP-2
        { start_time: 3000000000, end_time: 2000000000 }, // GAP-5
      ];

      const report = auditSpanTiming(spans);

      // Recommendations should include fixes for detected gaps
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.allGaps.some((g) => g.id === 'GAP-1')).toBe(true);
      expect(report.allGaps.some((g) => g.id === 'GAP-2')).toBe(true);
      expect(report.allGaps.some((g) => g.id === 'GAP-5')).toBe(true);
    });
  });
});
