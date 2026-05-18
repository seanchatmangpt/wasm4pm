/**
 * Streaming bridge: translate wasm4pm StreamingLog telemetry into mcpp LIVE
 * correlation event format (LIVE-01..LIVE-16).
 *
 * The Rust `StreamingLog` (wasm4pm/src/probabilistic/streaming_log.rs) emits
 * activity frequencies and directly-follows graph (DFG) edge counts via OTel
 * span attributes.  This module:
 *   1. Declares the attribute key constants those spans use.
 *   2. Defines `StreamingEventSummary` — the bridge DTO.
 *   3. `extractStreamingSummary` — parses raw OTel span events into summaries.
 *   4. `toMcppLiveCorrelationEvent` — formats a summary as a mcpp `TraceRecord`-
 *      compatible object ready for LIVE-01..LIVE-16 correlation checks.
 *
 * References:
 *   - Rust type: `StreamingLog` (4096×16 Count-Min Sketch, ~135 KB, O(1) per add_event)
 *   - mcpp input type: `TraceRecord` (mcpp-server/src/aat/correlation.rs)
 *     Fields: kind, name, fields (JSON object), ts_ns (wall-clock nanoseconds)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Attribute name constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OTel span attribute names emitted by wasm4pm streaming spans.
 *
 * These match what the Rust `StreamingLog` instrumentation writes when it
 * records a `streaming.event` or `streaming.dfg_edge` span event.
 */
export const STREAMING_SPAN_ATTRIBUTES = {
  /** Name of the activity recorded by this event (interned vocab string). */
  ACTIVITY_NAME: 'streaming.activity.name',
  /** Exact frequency count for this activity (kept in node_freqs vec). */
  ACTIVITY_FREQUENCY: 'streaming.activity.frequency',
  /**
   * Approximate directly-follows count for the FROM→TO edge pair estimated
   * from the Count-Min Sketch.  May be slightly over-counted due to hash
   * collisions; never under-counted (no false negatives).
   */
  DIRECT_FOLLOW_COUNT: 'streaming.dfg.direct_follow_count',
  /** Activity that immediately precedes the current activity in the DFG edge. */
  DIRECT_FOLLOW_FROM: 'streaming.dfg.from',
  /** Activity that immediately follows in the DFG edge. */
  DIRECT_FOLLOW_TO: 'streaming.dfg.to',
  /** Whether this event is the first in its trace (is_trace_start). */
  IS_TRACE_START: 'streaming.event.is_trace_start',
  /** Whether this event is the last in its trace (is_trace_end). */
  IS_TRACE_END: 'streaming.event.is_trace_end',
  /**
   * Approximate unique-trace cardinality estimated by the HyperLogLog
   * (1 024 registers, ≤ 1.6 % standard error).
   */
  TRACE_CARDINALITY: 'streaming.hll.trace_cardinality',
  /** Total events processed since StreamingLog was created. */
  TOTAL_EVENTS: 'streaming.total_events',
  /** Number of unique activity labels seen (exact, bounded vocabulary). */
  ACTIVITY_COUNT: 'streaming.activity_count',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Bridge DTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distilled summary of one activity emitted by a wasm4pm streaming span.
 *
 * Produced by `extractStreamingSummary`; consumed by `toMcppLiveCorrelationEvent`.
 */
export interface StreamingEventSummary {
  /** Activity label (interned string from StreamingLog vocabulary). */
  activity: string;
  /**
   * Exact execution frequency for this activity across all traces seen so far.
   * Matches `StreamingLog::node_freqs[id]`.
   */
  frequency: number;
  /**
   * Approximate count of times this activity was directly followed by another
   * activity (sum of outgoing DFG edge estimates from Count-Min Sketch).
   * Zero if no outgoing edges were observed.
   */
  directFollowCount: number;
  /** ISO-8601 wall-clock timestamp of the originating OTel span event. */
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse raw OTel span events from a wasm4pm streaming span into
 * `StreamingEventSummary` records.
 *
 * The input is the `events` array of an `OtelEvent` (see `types.ts`).
 * Only events whose name is `"streaming.event"` or `"streaming.dfg_edge"` are
 * processed; all others are silently ignored.
 *
 * DFG-edge events (`streaming.dfg_edge`) are accumulated per FROM-activity and
 * their `direct_follow_count` values are summed to give a total outgoing-edge
 * weight for that activity.  Activity-frequency events (`streaming.event`)
 * supply the exact frequency and timestamp.
 *
 * @param spanEvents - The `events` array from an `OtelEvent`.
 * @returns One `StreamingEventSummary` per unique activity observed.
 */
export function extractStreamingSummary(
  spanEvents: Array<{ name: string; attributes: Record<string, unknown> }>
): StreamingEventSummary[] {
  // Accumulate per-activity data across multiple span events.
  const byActivity = new Map<
    string,
    { frequency: number; directFollowCount: number; timestamp: string }
  >();

  const ensureEntry = (
    activity: string,
    timestamp: string
  ): { frequency: number; directFollowCount: number; timestamp: string } => {
    if (!byActivity.has(activity)) {
      byActivity.set(activity, { frequency: 0, directFollowCount: 0, timestamp });
    }
    return byActivity.get(activity)!;
  };

  for (const ev of spanEvents) {
    const attrs = ev.attributes;

    if (ev.name === 'streaming.event') {
      const activity = attrs[STREAMING_SPAN_ATTRIBUTES.ACTIVITY_NAME];
      const frequency = attrs[STREAMING_SPAN_ATTRIBUTES.ACTIVITY_FREQUENCY];
      if (typeof activity !== 'string' || typeof frequency !== 'number') {
        continue;
      }
      const ts =
        typeof attrs['timestamp'] === 'string'
          ? (attrs['timestamp'] as string)
          : new Date().toISOString();
      const entry = ensureEntry(activity, ts);
      // Exact frequency — take the latest value (monotonically increasing).
      entry.frequency = frequency;
      entry.timestamp = ts;
    } else if (ev.name === 'streaming.dfg_edge') {
      const from = attrs[STREAMING_SPAN_ATTRIBUTES.DIRECT_FOLLOW_FROM];
      const count = attrs[STREAMING_SPAN_ATTRIBUTES.DIRECT_FOLLOW_COUNT];
      if (typeof from !== 'string' || typeof count !== 'number') {
        continue;
      }
      const ts =
        typeof attrs['timestamp'] === 'string'
          ? (attrs['timestamp'] as string)
          : new Date().toISOString();
      const entry = ensureEntry(from, ts);
      // Accumulate outgoing DFG edge weights for this activity.
      entry.directFollowCount += count;
    }
    // All other event names are ignored.
  }

  const summaries: StreamingEventSummary[] = [];
  for (const [activity, data] of byActivity) {
    summaries.push({
      activity,
      frequency: data.frequency,
      directFollowCount: data.directFollowCount,
      timestamp: data.timestamp,
    });
  }
  return summaries;
}

// ─────────────────────────────────────────────────────────────────────────────
// mcpp LIVE correlation event formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the JSON fields object inside a mcpp `TraceRecord`.
 * Mirrors the `fields: Value` (serde_json) field in the Rust struct.
 *
 * mcpp correlation.rs `TraceRecord`:
 *   pub kind:   String   — "span_open" | "span_record" | "event"
 *   pub name:   String   — closed-vocabulary identifier
 *   pub fields: Value    — JSON attribute bag
 *   pub ts_ns:  i64      — wall-clock nanoseconds since UNIX epoch
 */
export interface McppTraceRecord {
  /** Always `"event"` for streaming bridge records. */
  kind: 'span_open' | 'span_record' | 'event';
  /**
   * Closed-vocabulary span name consumed by LIVE checks.
   * We use `"streaming.activity.observed"` as the canonical name; mcpp
   * LIVE-01 checks for required span-spine presence by name.
   */
  name: string;
  /** Attribute bag evaluated by LIVE-01..LIVE-16 correlation rules. */
  fields: {
    /** Stable run identifier — used by LIVE-01, LIVE-02 proof-pack lookups. */
    'run.id': string;
    /** Activity label — used by LIVE-05 route-conformance gap checks. */
    'streaming.activity': string;
    /**
     * Exact activity execution frequency.
     * LIVE-11 (RealBEAMSpawnLatency) uses frequency as a proxy for
     * spawn-attempt count.
     */
    'streaming.frequency': number;
    /**
     * Approximate outgoing DFG edge weight (Count-Min Sketch estimate).
     * LIVE-05 uses this to validate that observed directly-follows relations
     * are consistent with the declared POWL route.
     */
    'streaming.direct_follow_count': number;
    /**
     * ISO-8601 observation timestamp.
     * LIVE-10 (CrossEnterpriseRelayValid) and LIVE-16 (TemporalFilingCompliance)
     * use timestamp ordering.
     */
    'streaming.observed_at': string;
    /**
     * Source component identifier — required by LIVE-08 (LiveLLMRuntimeLeak)
     * to confirm this record originates from the streaming probabilistic layer,
     * not from an LLM token stream.
     */
    'service.name': 'wasm4pm.streaming';
    /**
     * Probabilistic structure used — confirms Count-Min Sketch provenance for
     * LIVE-06 (LivePartUnbound) content-hash binding checks.
     */
    'streaming.sketch': 'count_min_sketch';
    /**
     * Role of the actor emitting this record — required by LIVE-04
     * (actor authority) to confirm the streaming bridge's identity.
     */
    'mcpp.actor.role'?: string;
    /**
     * Whether this actor is authorised to emit admitted verdicts.
     * LIVE-04 checks that only authorised actors can emit accepted verdicts.
     * The streaming bridge is not authorised to do so; always false.
     */
    'mcpp.actor.can_emit_accepted'?: boolean;
    /**
     * Explicit negative LLM-origin marker for LIVE-08 (LiveLLMRuntimeLeak).
     * `false` here is a positive assertion that this record did NOT originate
     * from an LLM token stream — giving mcpp a concrete field to check rather
     * than relying solely on the absence of LLM tokens in other field values.
     */
    'mcpp.llm_origin'?: boolean;
  };
  /**
   * Wall-clock nanoseconds since UNIX epoch.
   * Derived from the ISO-8601 timestamp; mcpp `TraceRecord.ts_ns` is `i64`.
   */
  ts_ns: number;
}

/**
 * Format a `StreamingEventSummary` as a mcpp LIVE correlation event.
 *
 * The returned object is structurally compatible with `TraceRecord` in
 * `mcpp-server/src/aat/correlation.rs` and can be JSON-serialised and fed
 * directly into mcpp's collector NDJSON buffer for LIVE rule correlation.
 *
 * Genuine rule coverage provided by this function:
 *   LIVE-04 — `mcpp.actor.role` and `mcpp.actor.can_emit_accepted` satisfy the
 *              actor authority check; streaming bridge declares it cannot emit
 *              accepted verdicts.
 *   LIVE-08 — `mcpp.llm_origin: false` is an explicit negative assertion that
 *              this record did NOT originate from an LLM token stream.  This is
 *              stronger than the previous implicit coverage via
 *              `service.name: "wasm4pm.streaming"` alone: mcpp now has a
 *              dedicated boolean field to assert rather than inferring LLM
 *              absence from the absence of LLM tokens in other values.
 *
 * Other LIVE rules (LIVE-01, LIVE-02, LIVE-05, LIVE-06, LIVE-10, LIVE-11,
 * LIVE-12, LIVE-16) require additional spine span emissions not yet implemented
 * and are NOT covered by this function.
 *
 * @param summary - Activity summary extracted from streaming span events.
 * @param runId   - Stable run UUID; must match the proof pack referenced by
 *                  LIVE-02 and LIVE-14 in the mcpp aggregator.
 * @returns A plain object ready for `JSON.stringify` and NDJSON emission.
 */
export function toMcppLiveCorrelationEvent(
  summary: StreamingEventSummary,
  runId: string
): McppTraceRecord {
  const ts_ns = new Date(summary.timestamp).getTime() * 1_000_000;

  return {
    kind: 'event',
    name: 'streaming.activity.observed',
    fields: {
      'run.id': runId,
      'streaming.activity': summary.activity,
      'streaming.frequency': summary.frequency,
      'streaming.direct_follow_count': summary.directFollowCount,
      'streaming.observed_at': summary.timestamp,
      'service.name': 'wasm4pm.streaming',
      'streaming.sketch': 'count_min_sketch',
      'mcpp.actor.role': 'wasm4pm.streaming',
      'mcpp.actor.can_emit_accepted': false,
      'mcpp.llm_origin': false,
    },
    ts_ns,
  };
}
