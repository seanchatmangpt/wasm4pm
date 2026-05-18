/**
 * OTEL Span Timing Verification & Remediation
 *
 * Validates and corrects timing issues in OTEL spans.
 *
 * Detected gaps:
 * GAP-1: Missing end_time on synchronous spans
 * GAP-2: start_time computed after operation (clock skew)
 * GAP-3: Duration calculated from stale Date.now()
 * GAP-4: Nanosecond overflow for durations > 2.5 hours
 * GAP-5: Negative durations from concurrent calls
 */

export interface TimingVerificationResult {
  valid: boolean;
  gaps: TimingGap[];
  warnings: string[];
  correctedSpan?: OtelSpanTiming;
}

export interface TimingGap {
  id: string; // GAP-1, GAP-2, etc.
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  startTime?: number;
  endTime?: number;
}

export interface OtelSpanTiming {
  trace_id: string;
  span_id: string;
  start_time: number; // nanoseconds, required
  end_time: number; // nanoseconds, required
  name: string;
}

/**
 * Validates OTEL span timing for accuracy and consistency.
 *
 * Returns a result object with:
 * - valid: true if all checks pass
 * - gaps: array of detected timing issues
 * - warnings: array of timing concerns
 * - correctedSpan: corrected span if issues found
 */
export function verifySpanTiming(
  startTimeNs: number | undefined,
  endTimeNs: number | undefined,
  durationMs?: number
): TimingVerificationResult {
  const gaps: TimingGap[] = [];
  const warnings: string[] = [];

  // GAP-1: Missing end_time
  if (!endTimeNs && startTimeNs) {
    gaps.push({
      id: 'GAP-1',
      severity: 'high',
      description: 'end_time is missing; only start_time is set',
      recommendation: 'Set end_time = start_time for zero-duration spans, or actual end_time if available',
      startTime: startTimeNs,
    });
  }

  // GAP-2: Missing start_time
  if (!startTimeNs && endTimeNs) {
    gaps.push({
      id: 'GAP-2',
      severity: 'high',
      description: 'start_time is missing; only end_time is set',
      recommendation: 'Capture start_time BEFORE operation begins',
      endTime: endTimeNs,
    });
  }

  // GAP-3: start_time > end_time (negative duration)
  if (startTimeNs && endTimeNs && startTimeNs > endTimeNs) {
    gaps.push({
      id: 'GAP-5',
      severity: 'critical',
      description: `start_time (${startTimeNs}) > end_time (${endTimeNs}); negative duration detected`,
      recommendation: 'Swap start_time and end_time, or recapture timing',
      startTime: startTimeNs,
      endTime: endTimeNs,
    });
  }

  // GAP-4: Overflow check for large durations
  if (startTimeNs && endTimeNs && startTimeNs <= endTimeNs) {
    const durationNs = endTimeNs - startTimeNs;
    const durationMs_computed = durationNs / 1000000;

    // MAX_SAFE_INTEGER = 2^53 - 1
    // In nanoseconds: max safe is about 9.007e15 ns
    // In milliseconds: about 9,007,199 ms = 2.5 hours
    if (durationNs > Number.MAX_SAFE_INTEGER * 0.8) {
      warnings.push(
        `Duration (${durationMs_computed.toFixed(2)}ms) is approaching precision loss threshold (2.5 hours)`
      );
    }

    if (durationNs > Number.MAX_SAFE_INTEGER) {
      gaps.push({
        id: 'GAP-4',
        severity: 'medium',
        description: `Duration (${durationMs_computed.toFixed(2)}ms) exceeds safe integer range; precision loss likely`,
        recommendation: 'For long-running spans (>2.5 hours), consider breaking into sub-spans or use BigInt',
        startTime: startTimeNs,
        endTime: endTimeNs,
      });
    }
  }

  // GAP-3: Duration mismatch between provided durationMs and computed duration
  if (durationMs !== undefined && startTimeNs && endTimeNs) {
    const computedMs = (endTimeNs - startTimeNs) / 1000000;
    const mismatch = Math.abs(computedMs - durationMs);

    // Allow 10ms tolerance for clock jitter
    if (mismatch > 10) {
      warnings.push(
        `Duration mismatch: provided=${durationMs}ms, computed=${computedMs.toFixed(2)}ms (diff=${mismatch.toFixed(2)}ms)`
      );
    }
  }

  const valid = gaps.length === 0 && gaps.every((g) => g.severity !== 'critical');

  return {
    valid,
    gaps,
    warnings,
  };
}

/**
 * Corrects a span timing if issues are detected.
 * Returns the corrected span or undefined if already valid.
 */
export function correctSpanTiming(
  traceId: string,
  spanId: string,
  name: string,
  startTimeNs: number | undefined,
  endTimeNs: number | undefined,
  durationMs?: number
): OtelSpanTiming | undefined {
  const verification = verifySpanTiming(startTimeNs, endTimeNs, durationMs);

  if (verification.valid) {
    return undefined; // No correction needed
  }

  let correctedStart = startTimeNs;
  let correctedEnd = endTimeNs;

  // GAP-1: Missing end_time
  if (!correctedEnd && correctedStart) {
    correctedEnd = correctedStart; // Zero-duration span
  }

  // GAP-2: Missing start_time
  if (!correctedStart && correctedEnd) {
    if (durationMs !== undefined) {
      correctedStart = correctedEnd - durationMs * 1000000;
    } else {
      correctedStart = correctedEnd; // Assume zero duration
    }
  }

  // GAP-5: Negative duration
  if (correctedStart && correctedEnd && correctedStart > correctedEnd) {
    [correctedStart, correctedEnd] = [correctedEnd, correctedStart];
  }

  // GAP-3: Duration mismatch
  if (durationMs !== undefined && correctedStart && correctedEnd) {
    const computedMs = (correctedEnd - correctedStart) / 1000000;
    if (Math.abs(computedMs - durationMs) > 10) {
      // Use provided durationMs as source of truth
      correctedEnd = correctedStart + durationMs * 1000000;
    }
  }

  if (correctedStart && correctedEnd) {
    return {
      trace_id: traceId,
      span_id: spanId,
      name,
      start_time: correctedStart,
      end_time: correctedEnd,
    };
  }

  return undefined;
}

/**
 * Validates that all spans in a trace have consistent timing.
 * Returns violations if parent spans don't contain their child spans.
 */
export function validateTraceTimingConsistency(
  spans: Array<{
    span_id: string;
    parent_span_id?: string;
    start_time: number;
    end_time: number;
  }>
): string[] {
  const violations: string[] = [];
  const spanMap = new Map(spans.map((s) => [s.span_id, s]));

  spans.forEach((child) => {
    if (child.parent_span_id) {
      const parent = spanMap.get(child.parent_span_id);
      if (parent) {
        // Child must not start before parent
        if (child.start_time < parent.start_time) {
          violations.push(
            `Child span ${child.span_id} starts before parent ${child.parent_span_id}`
          );
        }
        // Child must not end after parent
        if (child.end_time > parent.end_time) {
          violations.push(
            `Child span ${child.span_id} ends after parent ${child.parent_span_id}`
          );
        }
      }
    }
  });

  return violations;
}

/**
 * Computes the elapsed wall-clock time in nanoseconds.
 * Handles Date.now() which returns milliseconds.
 */
export function nowNanoseconds(): number {
  return Date.now() * 1000000;
}

/**
 * Safely converts nanoseconds to milliseconds without precision loss
 * for durations up to 2.5 hours.
 */
export function nanosToMillis(nanos: number): number {
  return Math.round(nanos / 1000000);
}

/**
 * Safely converts milliseconds to nanoseconds.
 * Returns undefined if overflow would occur.
 */
export function millisToNanos(ms: number): number | undefined {
  const nanos = ms * 1000000;
  if (nanos > Number.MAX_SAFE_INTEGER) {
    return undefined; // Overflow
  }
  return nanos;
}

/**
 * Returns true if a duration in milliseconds is safe to convert to nanoseconds
 * without precision loss.
 */
export function isSafeDuration(durationMs: number): boolean {
  return durationMs * 1000000 <= Number.MAX_SAFE_INTEGER;
}

/**
 * Summary report of all timing gaps found in a set of spans.
 */
export interface TimingAuditReport {
  totalSpans: number;
  validSpans: number;
  spansWithGaps: number;
  criticalGaps: number;
  allGaps: TimingGap[];
  allWarnings: string[];
  recommendations: string[];
}

/**
 * Audits a collection of spans and generates a comprehensive report.
 */
export function auditSpanTiming(
  spans: Array<{
    start_time?: number;
    end_time?: number;
    duration_ms?: number;
  }>
): TimingAuditReport {
  const allGaps: TimingGap[] = [];
  const allWarnings: string[] = [];
  let validSpans = 0;
  const spansWithGapsSet = new Set<number>();

  spans.forEach((span, idx) => {
    const result = verifySpanTiming(span.start_time, span.end_time, span.duration_ms);
    if (result.valid) {
      validSpans++;
    } else {
      spansWithGapsSet.add(idx);
      allGaps.push(...result.gaps);
    }
    allWarnings.push(...result.warnings);
  });

  const recommendations: string[] = [];

  // Generate recommendations based on gap patterns
  const gapIds = new Set(allGaps.map((g) => g.id));
  if (gapIds.has('GAP-1')) {
    recommendations.push(
      'Ensure end_time is set on all completed spans (required by OTEL spec)'
    );
  }
  if (gapIds.has('GAP-2')) {
    recommendations.push('Capture start_time BEFORE operation begins for accurate timing');
  }
  if (gapIds.has('GAP-5')) {
    recommendations.push('Validate that start_time <= end_time for all spans');
  }
  if (gapIds.has('GAP-4')) {
    recommendations.push('For long-running operations (>2.5 hours), break into child spans');
  }

  return {
    totalSpans: spans.length,
    validSpans,
    spansWithGaps: spansWithGapsSet.size,
    criticalGaps: allGaps.filter((g) => g.severity === 'critical').length,
    allGaps,
    allWarnings,
    recommendations,
  };
}
