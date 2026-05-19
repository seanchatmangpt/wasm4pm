/**
 * beam-bridge.ts — wasm4pm → BEAM actor message translator
 *
 * Maps wasm4pm swarm output types to BEAM/Erlang actor message tuples as
 * defined by the mcpp-erlang-gen Tera templates.
 *
 * Actor role mapping (A-P09 constraint enforced):
 *   runSwarm coordinator      → route_coordinator
 *   aggregate()               → agg_mailbox
 *   SwarmConvergenceReport    → proof_aggregator ({collect, Evidence})
 *     converged=true          → {tag:"collect", evidence:dominantHash}
 *     converged=false         → [{tag:"report_gap", ...}] per dissenting worker
 *   ConvergenceMaxIterationsError / ConvergenceTimeoutError
 *                             → {tag:"propagate_exhaustion", ...} → andon_supervisor
 *   WorkerResult              → {tag:"activity", activity_id, evidence:resultHash}
 *
 * A-P09: ONLY proof_aggregator may emit Accepted.
 *   - dominantHash is forwarded ONLY as a "collect" message (→ proof_aggregator).
 *   - "accepted" is NEVER emitted by this bridge.
 *   - assertNotAccept() guards every outbound message.
 */

import type {
  SwarmConvergenceReport,
  WorkerResult,
  ConvergenceMaxIterationsError,
  ConvergenceTimeoutError,
} from './types.js';

// ── Core message type ─────────────────────────────────────────────────────────

/**
 * A typed BEAM message tuple in JSON-serialisable form.
 *
 * `tag` corresponds to the Erlang atom in the first position of the tuple,
 * e.g. `{collect, Evidence}` → `{ tag: "collect", payload: { evidence: ... } }`.
 */
export type BeamMessage = {
  tag: string;
  payload: Record<string, unknown>;
};

// ── A-P09 guard ───────────────────────────────────────────────────────────────

/**
 * A-P09 constraint: this bridge MUST NOT emit a message tagged "accepted".
 * Only the proof_aggregator BEAM actor (agg_mailbox template) may emit Accepted.
 *
 * Call this on every BeamMessage before forwarding it to the transport layer.
 *
 * @throws {Error} if msg.tag === "accepted"
 */
export function assertNotAccept(msg: BeamMessage): void {
  if (msg.tag === 'accepted') {
    throw new Error(
      'A-P09 violation: beam-bridge must never emit a message tagged "accepted". ' +
        'Only proof_aggregator (agg_mailbox) is the sole Accepted emitter. ' +
        `Received message with tag="${msg.tag}" and payload=${JSON.stringify(msg.payload)}`
    );
  }
}

// ── Convergence report → BEAM messages ───────────────────────────────────────

/**
 * Translate a SwarmConvergenceReport to one or more BEAM actor messages.
 *
 * converged=true (dominantHash present):
 *   Returns a single "collect" message directed at proof_aggregator.
 *   Payload mirrors the Erlang tuple:
 *     {collect, [{activity, "swarm_consensus"}, {evidence, DominantHash}]}
 *
 * converged=true (dominantHash is null):
 *   Returns an empty array — no evidence to forward; the swarm had no results.
 *
 * converged=false:
 *   Returns one "report_gap" message per dissenting worker, directed at
 *   route_coordinator. Payload mirrors:
 *     {report_gap, ActivityId, GapType, FailedCheck, Evidence}
 *
 * All messages are checked via assertNotAccept before being returned.
 */
export function convergenceToBeam(report: SwarmConvergenceReport): BeamMessage[] {
  const messages: BeamMessage[] = [];

  if (report.converged) {
    // dominantHash may be null when no workers ran (empty relevant set).
    if (report.dominantHash === null) {
      return [];
    }

    // Forward ONLY to proof_aggregator via "collect" (A-P09).
    // The BEAM agg_mailbox template receives: {collect, Evidence}
    // where Evidence is a proplist [{activity, Id}, {evidence, Hash}].
    const msg: BeamMessage = {
      tag: 'collect',
      payload: {
        evidence: report.dominantHash,
        activity: 'swarm_consensus',
      },
    };
    assertNotAccept(msg);
    messages.push(msg);
  } else {
    // Dissent path → route_coordinator receives {report_gap, ActivityId, GapType, ...}
    // Each dissenting worker becomes a separate gap report.
    for (const workerId of report.dissentingWorkers) {
      const msg: BeamMessage = {
        tag: 'report_gap',
        payload: {
          activity_id: workerId,
          gap_type: 'dissent',
          // failed_check and evidence mirror the route_coordinator template args:
          // handle_call({report_gap, ActivityId, GapType, FailedCheck, Evidence}, ...)
          failed_check: 'swarm_consensus',
          evidence: null,
        },
      };
      assertNotAccept(msg);
      messages.push(msg);
    }
  }

  return messages;
}

// ── WorkerResult → BEAM message ───────────────────────────────────────────────

/**
 * Translate a WorkerResult to a BEAM "activity" evidence message.
 *
 * Maps to the branch_actor template's evidence emission:
 *   Evidence = mcpp_core:emit_evidence(ActivityId, Inputs)
 *
 * The agg_mailbox template receives:
 *   {actor_completed, ActorId, Evidence}
 *
 * Here we use the lower-level "activity" tag that the route_coordinator
 * would place in a {collect, [...]} proplist entry:
 *   {activity, ActivityId}, {evidence, ResultHash}
 *
 * @param result    - WorkerResult from the swarm worker
 * @param activityId - Logical activity ID for the BEAM routing layer
 */
export function workerResultToBeam(result: WorkerResult, activityId: string): BeamMessage {
  const msg: BeamMessage = {
    tag: 'activity',
    payload: {
      activity_id: activityId,
      evidence: result.resultHash,
      // Carry provenance fields for OTEL correlation on the BEAM side.
      worker_id: result.workerId,
      algorithm_id: result.algorithmId,
      run_at: result.runAt,
      duration_ms: result.durationMs,
      // Propagate failure flag so route_coordinator can decide gap-closure.
      failed: result.failed ?? false,
      ...(result.error !== undefined ? { error: result.error } : {}),
    },
  };
  assertNotAccept(msg);
  return msg;
}

// ── Exhaustion errors → BEAM message ─────────────────────────────────────────

/**
 * Translate a ConvergenceMaxIterationsError or ConvergenceTimeoutError to a
 * BEAM "propagate_exhaustion" message directed at andon_supervisor.
 *
 * Maps to the route_coordinator helper:
 *   propagate_exhaustion(ActivityId, AttemptedSources, CorrId, Authority)
 * which casts: {propagate, {RefusalClass, ActivityId, AttemptedSources, CorrId}}
 * to the andon_supervisor.
 *
 * The andon_supervisor template's handle_call({propagate, Reason}, ...) receives
 * this and stores it as a refusal — it never emits Accepted (A-P09 compliant).
 */
export function exhaustionToBeam(
  error: InstanceType<typeof ConvergenceMaxIterationsError> | InstanceType<typeof ConvergenceTimeoutError>
): BeamMessage {
  const msg: BeamMessage = {
    tag: 'propagate_exhaustion',
    payload: {
      reason: error.message,
      error_name: error.name,
    },
  };
  assertNotAccept(msg);
  return msg;
}
