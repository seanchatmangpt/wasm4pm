/**
 * gap-events — LIVE-09 span event emitters for the POWL gap lifecycle.
 *
 * The mcpp AAT-Live LIVE-09 correlation rule checks for four span events:
 *   - powl.gap.detected                  (event 1/4): gap activity first encountered
 *   - powl.gap.closed                    (event 2/4): gap resolved via a RouteRefinementVariant
 *   - powl.gap.exhausted                 (event 3/4): all variants exhausted; triggers escalation ladder
 *   - powl.gap.alternate_evidence_received (event 4/4): gap resolved via evidence from a different model/source
 *
 * These records are structurally compatible with the @wasm4pm/observability
 * TraceRecord type and can be forwarded to any OTEL-compatible exporter.
 */

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface GapDetectedEvent {
  runId: string;
  gapActivityId: string;
  correlationId: string;
  detectedAt: string;
}

export interface GapClosedEvent {
  runId: string;
  gapActivityId: string;
  correlationId: string;
  closedAt: string;
  /** The RouteRefinementVariant that resolved the gap. */
  closingVariant: string;
}

export interface GapExhaustedEvent {
  runId: string;
  gapActivityId: string;
  correlationId: string;
  exhaustedAt: string;
  attemptsCount: number;
}

export interface GapAlternateEvidenceEvent {
  runId: string;
  gapActivityId: string;
  correlationId: string;
  receivedAt: string;
  evidenceSource: string;
}

// ---------------------------------------------------------------------------
// Trace record shape
// ---------------------------------------------------------------------------

export interface GapTraceRecord {
  name: string;
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

/** Emits powl.gap.detected (LIVE-09 event 1/3). */
export function emitGapDetected(evt: GapDetectedEvent): GapTraceRecord {
  return {
    name: 'powl.gap.detected',
    timestamp: evt.detectedAt,
    attributes: {
      'run.id': evt.runId,
      'powl.gap.activity_id': evt.gapActivityId,
      'powl.gap.correlation_id': evt.correlationId,
    },
  };
}

/** Emits powl.gap.closed (LIVE-09 event 2/3). */
export function emitGapClosed(evt: GapClosedEvent): GapTraceRecord {
  return {
    name: 'powl.gap.closed',
    timestamp: evt.closedAt,
    attributes: {
      'run.id': evt.runId,
      'powl.gap.activity_id': evt.gapActivityId,
      'powl.gap.correlation_id': evt.correlationId,
      'powl.gap.closing_variant': evt.closingVariant,
    },
  };
}

/** Emits powl.gap.exhausted (LIVE-09 event 3/4).
 * This event triggers the RouteRefinementPolicy escalation ladder. */
export function emitGapExhausted(evt: GapExhaustedEvent): GapTraceRecord {
  return {
    name: 'powl.gap.exhausted',
    timestamp: evt.exhaustedAt,
    attributes: {
      'run.id': evt.runId,
      'powl.gap.activity_id': evt.gapActivityId,
      'powl.gap.correlation_id': evt.correlationId,
      'powl.gap.attempts_count': evt.attemptsCount,
    },
  };
}

/** Emits powl.gap.alternate_evidence_received (LIVE-09 event 4/4).
 * Fires when a gap is resolved by receiving evidence from a different model/source
 * rather than by escalating through the RouteRefinementVariant ladder. */
export function emitGapAlternateEvidence(evt: GapAlternateEvidenceEvent): GapTraceRecord {
  return {
    name: 'powl.gap.alternate_evidence_received',
    timestamp: evt.receivedAt,
    attributes: {
      'run.id': evt.runId,
      'powl.gap.activity_id': evt.gapActivityId,
      'powl.gap.correlation_id': evt.correlationId,
      'powl.gap.evidence_source': evt.evidenceSource,
    },
  };
}
