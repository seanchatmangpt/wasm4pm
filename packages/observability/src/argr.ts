/**
 * ARGR — Actor-Resolved Gap Rate
 *
 * ARGR = resolved_gaps / detected_gaps
 *
 * Correlates with handover network density in process mining.
 * In the wasm4pm+mcpp context:
 *   - A "gap" is a POWL activity gap detected by the drift pre-screen
 *     when Jaccard distance > 0.30.
 *   - "Resolved" means the RouteRefinementPolicy successfully closed the gap
 *     (precision returned to > threshold after refinement).
 *
 * Higher ARGR = the automl/refinement loop is effective at resolving
 * discovered gaps.
 */

import { OtelEvent } from './types.js';

// ---------------------------------------------------------------------------
// GapRecord — single gap observation
// ---------------------------------------------------------------------------

/**
 * A single gap detected by the drift pre-screen and optionally resolved by
 * the RouteRefinementPolicy.
 */
export interface GapRecord {
  /** Unique identifier for this gap (e.g. ULID or UUID). */
  gap_id: string;
  /** The POWL activity IRI/ID where the gap was detected. */
  activity_id: string;
  /** ISO-8601 timestamp when the gap was first detected. */
  detected_at: string;
  /** run_id of the trace that triggered detection. */
  run_id: string;
  /** Conformance precision score at the moment of detection. */
  initial_precision: number;
  /** Whether the RouteRefinementPolicy has closed this gap. */
  resolved: boolean;
  /** ISO-8601 timestamp when the gap was resolved (if resolved). */
  resolved_at?: string;
  /** Conformance precision score after successful resolution. */
  final_precision?: number;
}

// ---------------------------------------------------------------------------
// ArgRTracker — stateful ARGR accumulator
// ---------------------------------------------------------------------------

/**
 * Tracks detected and resolved gaps across a run, computing the ARGR metric
 * and an approximation of handover network density.
 *
 * Usage:
 *   const tracker = new ArgRTracker();
 *   tracker.recordDetected('gap-1', 'activity:A', 'run-123', 0.45);
 *   tracker.recordResolved('gap-1', 0.82);
 *   console.log(tracker.computeArgR()); // → 1
 */
export class ArgRTracker {
  /** All detected gaps, keyed by gap_id. */
  private gaps: Map<string, GapRecord> = new Map();

  /**
   * Record a newly detected POWL activity gap.
   *
   * @param gapId           Unique gap identifier.
   * @param activityId      POWL activity IRI/ID where the gap was detected.
   * @param runId           run_id of the triggering trace.
   * @param initialPrecision  Precision score at detection time.
   * @returns The created GapRecord.
   */
  recordDetected(
    gapId: string,
    activityId: string,
    runId: string,
    initialPrecision: number,
  ): GapRecord {
    const record: GapRecord = {
      gap_id: gapId,
      activity_id: activityId,
      detected_at: new Date().toISOString(),
      run_id: runId,
      initial_precision: initialPrecision,
      resolved: false,
    };
    this.gaps.set(gapId, record);
    return record;
  }

  /**
   * Mark a previously detected gap as resolved.
   *
   * No-ops silently if the gap_id is not known — callers should ensure they
   * call recordDetected first.
   *
   * @param gapId          Unique gap identifier (must match a prior detectd gap).
   * @param finalPrecision Precision score after the RouteRefinementPolicy closed the gap.
   */
  recordResolved(gapId: string, finalPrecision: number): void {
    const record = this.gaps.get(gapId);
    if (!record) {
      return;
    }
    record.resolved = true;
    record.resolved_at = new Date().toISOString();
    record.final_precision = finalPrecision;
  }

  /**
   * Compute ARGR: resolved_gaps / detected_gaps.
   *
   * Returns 0 when no gaps have been detected (avoids division-by-zero and
   * correctly signals no refinement activity).
   */
  computeArgR(): number {
    const detected = this.gaps.size;
    if (detected === 0) {
      return 0;
    }
    const resolved = this._resolvedCount();
    return resolved / detected;
  }

  /**
   * Approximate handover network density.
   *
   * Defined as:
   *   unique activity_ids with at least one resolved gap
   *   ─────────────────────────────────────────────────
   *   total unique activity_ids across all detected gaps
   *
   * Returns 0 when no gaps have been detected.
   */
  handoverNetworkDensity(): number {
    if (this.gaps.size === 0) {
      return 0;
    }

    const allActivities = new Set<string>();
    const resolvedActivities = new Set<string>();

    for (const record of this.gaps.values()) {
      allActivities.add(record.activity_id);
      if (record.resolved) {
        resolvedActivities.add(record.activity_id);
      }
    }

    if (allActivities.size === 0) {
      return 0;
    }
    return resolvedActivities.size / allActivities.size;
  }

  /**
   * Return OTEL-compatible flat attributes for use in span metadata.
   *
   * Keys follow the `argr.*` namespace convention.
   */
  toOtelAttributes(): Record<string, number | string> {
    return {
      'argr.resolved': this._resolvedCount(),
      'argr.detected': this.gaps.size,
      'argr.rate': this.computeArgR(),
      'argr.handover_density': this.handoverNetworkDensity(),
    };
  }

  /** Number of resolved gaps (internal helper). */
  private _resolvedCount(): number {
    let count = 0;
    for (const record of this.gaps.values()) {
      if (record.resolved) {
        count++;
      }
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// createArgRSpan — OTel-compatible span event factory
// ---------------------------------------------------------------------------

/**
 * Create an OTel-compatible span event object summarising the current ARGR
 * state of an ArgRTracker.
 *
 * The returned object conforms to {@link OtelEvent} and can be emitted to
 * any OTLP exporter that accepts the open-ontologies span format.
 *
 * @param tracker  The ArgRTracker whose state to snapshot.
 * @param spanName Human-readable span name (e.g. `"argr.refinement.summary"`).
 * @returns        An OtelEvent object ready for export.
 */
export function createArgRSpan(tracker: ArgRTracker, spanName: string): OtelEvent {
  const nowNs = BigInt(Date.now()) * 1_000_000n;

  return {
    trace_id: _randomHex(32),
    span_id: _randomHex(16),
    name: spanName,
    kind: 'INTERNAL',
    start_time: Number(nowNs),
    end_time: Number(nowNs),
    status: {
      code: 'OK',
    },
    attributes: {
      'service.name': 'wasm4pm.observability',
      ...tracker.toOtelAttributes(),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a random lowercase hex string of the given character length. */
function _randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
