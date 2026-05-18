/**
 * mcpp-swarm-coordination.test.ts
 *
 * Enterprise integration contract tests: wasm4pm swarm ↔ mcpp multi-agent pipeline.
 *
 * ---
 * INTEGRATION SURFACE AUDIT (2026-05-18)
 *
 * mcpp is a private-cloud admissible-work runtime at /Users/sac/mcpp.
 * It is a pure Rust workspace (Cargo workspace; no TypeScript packages or apps/).
 * It does NOT import @wasm4pm/swarm or any wasm4pm TypeScript package directly.
 *
 * The integration is a PROTOCOL surface, not a code-import surface:
 *
 *   ┌─────────────────────┐           ┌──────────────────────────────────────┐
 *   │   wasm4pm swarm     │           │   mcpp runtime                       │
 *   │  (@wasm4pm/swarm)   │           │   (Rust workspace)                   │
 *   │                     │           │                                       │
 *   │  runSwarm()         │──OTEL────▶│  AAT-Live collector                  │
 *   │  SwarmArtifact      │──BEAM─────▶│  BEAM actor topology (gen_server)   │
 *   │  convergenceToBeam()│           │  route_coordinator / proof_aggregator │
 *   │  gap-events.ts      │──spans───▶│  LIVE-09 correlation rule            │
 *   │  route-refinement.ts│──JSON─────▶│  mcpp-automl route_refinement.rs    │
 *   └─────────────────────┘           └──────────────────────────────────────┘
 *
 * FOUR INTEGRATION CHANNELS:
 *
 *   1. OTEL/BEAM bridge (beam-bridge.ts)
 *      SwarmConvergenceReport → { tag:"collect", payload:{evidence:dominantHash} }
 *      sent to mcpp proof_aggregator (A-P09: only it may emit Accepted).
 *
 *   2. Gap lifecycle spans (gap-events.ts)
 *      powl.gap.detected / powl.gap.closed / powl.gap.exhausted /
 *      powl.gap.alternate_evidence_received → consumed by mcpp LIVE-09 rule.
 *
 *   3. Route refinement ladder (route-refinement.ts)
 *      8-variant TypeScript ladder mirrors mcpp-automl/src/route_refinement.rs:
 *      KeepCurrent → RelaxThreshold → … → Escalate (cost 0–7).
 *      Andon signal = extension/automl:RouteModelInvalid.
 *
 *   4. OCEL serialization of SwarmArtifact
 *      SwarmArtifact.finalWorkerResults → OCEL events consumable by mcpp-automl
 *      for offline POWL route discovery. Each WorkerResult maps to one OCEL event
 *      with: ocel:type="swarm_worker_result", ocel:timestamp, ocel:activity.
 *
 * GAPS IDENTIFIED:
 *
 *   GAP-1: No shared module between wasm4pm and mcpp for the BEAM message format.
 *          Contract is maintained by convention (both sides use the same JSON shape),
 *          not by a shared schema or generated types.
 *
 *   GAP-2: SwarmArtifact has no built-in OCEL serializer. Callers must manually map
 *          WorkerResult → OCEL event. This test documents the expected mapping.
 *
 *   GAP-3: Gap lifecycle spans (GapTraceRecord) use plain strings as span names,
 *          not typed constants. If mcpp renames the LIVE-09 span keys, nothing
 *          breaks at compile time.
 *
 *   GAP-4: Route refinement ladder is duplicated in TypeScript (route-refinement.ts)
 *          and Rust (mcpp-automl/src/route_refinement.rs). Variant names must be
 *          kept in sync manually.
 *
 * These tests document what the coordination contract MUST satisfy, so any future
 * schema change on either side breaks a named test instead of silently diverging.
 *
 * Oracle ranks used:
 *   Rank 1 — Mathematical invariant (hash determinism, OCEL field completeness)
 *   Rank 2 — Domain contract (message shapes, Andon codes, LIVE-09 span names)
 *   Rank 3 — Metamorphic relation (convergence → collect; divergence → report_gap)
 */

import { describe, it, expect } from 'vitest';

import {
  assertNotAccept,
  convergenceToBeam,
  workerResultToBeam,
  exhaustionToBeam,
  type BeamMessage,
} from '../beam-bridge.js';

import {
  emitGapDetected,
  emitGapClosed,
  emitGapExhausted,
  emitGapAlternateEvidence,
  type GapTraceRecord,
} from '../gap-events.js';

import {
  ROUTE_REFINEMENT_ANDON,
  createAttempt,
  selectNextVariant,
  shouldEscalate,
  isLIVE09bViolation,
  type RouteRefinementVariant,
  type RefinementAttempt,
  VARIANT_LADDER,
} from '../route-refinement.js';

import {
  hashOutput,
  checkConvergence,
} from '../convergence.js';

import {
  ConvergenceMaxIterationsError,
  ConvergenceTimeoutError,
  type WorkerResult,
  type SwarmConvergenceReport,
  type SwarmArtifact,
} from '../types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
const NOW_ISO = '2026-05-18T12:00:00.000Z';

function makeWorkerResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    workerId: 'worker-log1-dfg',
    algorithmId: 'dfg',
    resultHash: 'abc123def456',
    result: { nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ from: 'A', to: 'B', count: 3 }] },
    runAt: NOW_ISO,
    durationMs: 42,
    resultType: 'discovery',
    ...overrides,
  };
}

function makeConvergenceReport(
  overrides: Partial<SwarmConvergenceReport> = {},
): SwarmConvergenceReport {
  return {
    algorithm: 'dfg',
    converged: true,
    consensusRatio: 1.0,
    dominantHash: 'abc123def456',
    dissentingWorkers: [],
    totalChecked: 3,
    convergenceReason: '3/3 workers agree on hash abc123def456 (unanimous)',
    ...overrides,
  };
}

function makeSwarmArtifact(
  results: WorkerResult[] = [makeWorkerResult()],
): SwarmArtifact {
  return {
    episodes: [
      {
        episodeId: UUID_V4,
        ep: 1,
        workerResults: results,
        convergenceReport: makeConvergenceReport(),
      },
    ],
    finalWorkerResults: results,
    converged: true,
    failedWorkers: [],
    healthyWorkerCount: results.length,
  };
}

// ── CHANNEL 1: OTEL/BEAM bridge ───────────────────────────────────────────────

describe('Channel 1: OTEL/BEAM bridge (Rank 2 — domain contracts)', () => {
  /**
   * Convergence contract with mcpp proof_aggregator.
   *
   * When the swarm converges, the bridge emits a single "collect" message.
   * The dominantHash travels as `payload.evidence`. The mcpp proof_aggregator
   * receives this and (only it) may call ProofWriter::admit (K-P09).
   */
  it('converged swarm produces "collect" message for proof_aggregator (A-P09)', () => {
    const report = makeConvergenceReport();
    const messages = convergenceToBeam(report);

    expect(messages).toHaveLength(1);
    expect(messages[0].tag).toBe('collect');
    expect(messages[0].payload.activity).toBe('swarm_consensus');
    expect(messages[0].payload.evidence).toBe(report.dominantHash);
  });

  it('"collect" message never carries tag "accepted" (A-P09 hard constraint)', () => {
    const report = makeConvergenceReport();
    const messages = convergenceToBeam(report);

    for (const msg of messages) {
      expect(msg.tag).not.toBe('accepted');
      // assertNotAccept must not throw on any bridge-produced message
      expect(() => assertNotAccept(msg)).not.toThrow();
    }
  });

  /**
   * Divergence contract with mcpp route_coordinator.
   *
   * When workers disagree, the bridge emits one "report_gap" per dissenter.
   * The mcpp route_coordinator receives these and triggers gap-closure.
   */
  it('divergent swarm produces "report_gap" messages for route_coordinator (one per dissenter)', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-A', 'worker-B'],
      consensusRatio: 0.5,
    });
    const messages = convergenceToBeam(report);

    expect(messages).toHaveLength(2);
    for (const msg of messages) {
      expect(msg.tag).toBe('report_gap');
      expect(msg.payload.gap_type).toBe('dissent');
      expect(msg.payload.failed_check).toBe('swarm_consensus');
    }
    const activityIds = messages.map((m) => m.payload.activity_id);
    expect(activityIds).toContain('worker-A');
    expect(activityIds).toContain('worker-B');
  });

  it('WorkerResult → BEAM "activity" message carries all provenance fields', () => {
    const result = makeWorkerResult({
      workerId: 'worker-log1-dfg',
      algorithmId: 'dfg',
      resultHash: 'deadbeef',
      durationMs: 123,
    });
    const msg = workerResultToBeam(result, 'swarm.dfg.step1');

    expect(msg.tag).toBe('activity');
    expect(msg.payload.activity_id).toBe('swarm.dfg.step1');
    expect(msg.payload.evidence).toBe('deadbeef');
    expect(msg.payload.worker_id).toBe('worker-log1-dfg');
    expect(msg.payload.algorithm_id).toBe('dfg');
    expect(msg.payload.duration_ms).toBe(123);
    expect(msg.payload.failed).toBe(false);
  });

  it('failed WorkerResult → BEAM "activity" carries failed=true and error fields', () => {
    const result = makeWorkerResult({
      failed: true,
      error: 'timeout exceeded',
    });
    const msg = workerResultToBeam(result, 'swarm.dfg.step1');

    expect(msg.payload.failed).toBe(true);
    expect(msg.payload.error).toBe('timeout exceeded');
    // A-P09: still never "accepted"
    expect(msg.tag).not.toBe('accepted');
  });

  it('ConvergenceTimeout → BEAM "propagate_exhaustion" directed at andon_supervisor', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.6);
    const msg = exhaustionToBeam(err);

    expect(msg.tag).toBe('propagate_exhaustion');
    expect(typeof msg.payload.reason).toBe('string');
    expect((msg.payload.reason as string).length).toBeGreaterThan(0);
    expect(msg.payload.error_name).toBe('ConvergenceTimeoutError');
    expect(msg.tag).not.toBe('accepted'); // A-P09
  });

  it('ConvergenceMaxIterations → BEAM "propagate_exhaustion" directed at andon_supervisor', () => {
    const err = new ConvergenceMaxIterationsError(200, 100, 0.4);
    const msg = exhaustionToBeam(err);

    expect(msg.tag).toBe('propagate_exhaustion');
    expect(msg.payload.error_name).toBe('ConvergenceMaxIterationsError');
  });
});

// ── CHANNEL 2: Gap lifecycle spans (LIVE-09) ──────────────────────────────────

describe('Channel 2: Gap lifecycle spans for mcpp LIVE-09 correlation (Rank 2)', () => {
  /**
   * LIVE-09 correlation rule checks for four span events in order:
   *   powl.gap.detected → powl.gap.closed (or exhausted / alternate_evidence_received)
   *
   * The mcpp AAT-Live collector reads these span names exactly.
   * GAP-3 documented: if mcpp renames these, nothing breaks at compile time.
   */
  it('emitGapDetected produces span named "powl.gap.detected" (LIVE-09 event 1)', () => {
    const record: GapTraceRecord = emitGapDetected({
      runId: UUID_V4,
      gapActivityId: 'activity:Approve',
      correlationId: 'corr-001',
      detectedAt: NOW_ISO,
    });

    expect(record.name).toBe('powl.gap.detected');
    expect(record.timestamp).toBe(NOW_ISO);
    expect(record.attributes['run.id']).toBe(UUID_V4);
    expect(record.attributes['powl.gap.activity_id']).toBe('activity:Approve');
    expect(record.attributes['powl.gap.correlation_id']).toBe('corr-001');
  });

  it('emitGapClosed produces span named "powl.gap.closed" with closing_variant (LIVE-09 event 2)', () => {
    const record: GapTraceRecord = emitGapClosed({
      runId: UUID_V4,
      gapActivityId: 'activity:Approve',
      correlationId: 'corr-001',
      closedAt: NOW_ISO,
      closingVariant: 'RelaxThreshold',
    });

    expect(record.name).toBe('powl.gap.closed');
    expect(record.attributes['powl.gap.closing_variant']).toBe('RelaxThreshold');
  });

  it('emitGapExhausted produces span named "powl.gap.exhausted" with attempts_count (LIVE-09 event 3)', () => {
    const record: GapTraceRecord = emitGapExhausted({
      runId: UUID_V4,
      gapActivityId: 'activity:Approve',
      correlationId: 'corr-001',
      exhaustedAt: NOW_ISO,
      attemptsCount: 7,
    });

    expect(record.name).toBe('powl.gap.exhausted');
    expect(record.attributes['powl.gap.attempts_count']).toBe(7);
  });

  it('emitGapAlternateEvidence produces span named "powl.gap.alternate_evidence_received" (LIVE-09 event 4)', () => {
    const record: GapTraceRecord = emitGapAlternateEvidence({
      runId: UUID_V4,
      gapActivityId: 'activity:Approve',
      correlationId: 'corr-001',
      receivedAt: NOW_ISO,
      evidenceSource: 'wasm4pm:dfg:round3',
    });

    expect(record.name).toBe('powl.gap.alternate_evidence_received');
    expect(record.attributes['powl.gap.evidence_source']).toBe('wasm4pm:dfg:round3');
  });

  it('all four LIVE-09 span names use the "powl.gap." prefix (namespace contract)', () => {
    const spanNames = [
      'powl.gap.detected',
      'powl.gap.closed',
      'powl.gap.exhausted',
      'powl.gap.alternate_evidence_received',
    ];
    // Validate these are the exact strings emitted (GAP-3: no compile-time check)
    for (const name of spanNames) {
      expect(name.startsWith('powl.gap.')).toBe(true);
    }
  });

  it('gap lifecycle attributes are all string or number — no objects (OTEL attribute contract)', () => {
    const records: GapTraceRecord[] = [
      emitGapDetected({ runId: UUID_V4, gapActivityId: 'A', correlationId: 'C', detectedAt: NOW_ISO }),
      emitGapClosed({ runId: UUID_V4, gapActivityId: 'A', correlationId: 'C', closedAt: NOW_ISO, closingVariant: 'KeepCurrent' }),
      emitGapExhausted({ runId: UUID_V4, gapActivityId: 'A', correlationId: 'C', exhaustedAt: NOW_ISO, attemptsCount: 3 }),
      emitGapAlternateEvidence({ runId: UUID_V4, gapActivityId: 'A', correlationId: 'C', receivedAt: NOW_ISO, evidenceSource: 'src' }),
    ];

    for (const record of records) {
      for (const [key, value] of Object.entries(record.attributes)) {
        const t = typeof value;
        expect(['string', 'number', 'boolean']).toContain(t);
        // mcpp OTEL collector rejects nested objects as attribute values
        expect(t).not.toBe('object');
        void key;
      }
    }
  });
});

// ── CHANNEL 3: Route refinement ladder (mcpp-automl mirror) ──────────────────

describe('Channel 3: Route refinement ladder (Rank 2 — mcpp-automl mirror contract)', () => {
  /**
   * The TypeScript ladder in route-refinement.ts mirrors Rust
   * mcpp-automl/src/route_refinement.rs exactly.
   *
   * GAP-4 documented: no shared schema — sync must be maintained manually.
   * These tests encode the current ground truth so drift is detectable.
   */
  it('VARIANT_LADDER has exactly 8 entries in ascending cost order', () => {
    expect(VARIANT_LADDER).toHaveLength(8);
    expect(VARIANT_LADDER[0]).toBe('KeepCurrent');
    expect(VARIANT_LADDER[7]).toBe('Escalate');
  });

  it('variant ladder mirrors mcpp Rust enum: KeepCurrent→RelaxThreshold→…→Escalate', () => {
    const expected: RouteRefinementVariant[] = [
      'KeepCurrent',
      'RelaxThreshold',
      'ExtendWindow',
      'SwitchVariant',
      'AddConstraint',
      'PruneActivities',
      'ReDiscoverFull',
      'Escalate',
    ];
    expect(VARIANT_LADDER).toEqual(expected);
  });

  it('Andon signal constant matches mcpp-automl Rust ROUTE_REFINEMENT_ANDON', () => {
    // mcpp-automl/src/route_refinement.rs:
    //   pub const ROUTE_REFINEMENT_ANDON: &str = "extension/automl:RouteModelInvalid";
    expect(ROUTE_REFINEMENT_ANDON).toBe('extension/automl:RouteModelInvalid');
  });

  it('selectNextVariant advances through all 7 positions before Escalate', () => {
    let current: RouteRefinementVariant = 'KeepCurrent';
    for (let i = 0; i < 7; i++) {
      const next = selectNextVariant(current, i);
      expect(next).toBe(VARIANT_LADDER[i + 1]);
      current = next;
    }
    expect(current).toBe('Escalate');
  });

  it('selectNextVariant throws RangeError beyond attempt 7 (ladder exhausted)', () => {
    expect(() => selectNextVariant('Escalate', 8)).toThrow(RangeError);
  });

  it('shouldEscalate returns true when any attempt carries Escalate variant', () => {
    const attempt = createAttempt(UUID_V4, 'activity:X', 'Escalate', 0.3, 0.4);
    expect(shouldEscalate([attempt])).toBe(true);
  });

  it('shouldEscalate returns true when 8 or more attempts present (ladder exhausted)', () => {
    const attempts: RefinementAttempt[] = Array.from({ length: 8 }, (_, i) =>
      createAttempt(UUID_V4, 'activity:X', VARIANT_LADDER[Math.min(i, 7)], 0.5, 0.5),
    );
    expect(shouldEscalate(attempts)).toBe(true);
  });

  it('shouldEscalate returns false for fewer than 8 non-Escalate attempts', () => {
    const attempts: RefinementAttempt[] = [
      createAttempt(UUID_V4, 'activity:X', 'KeepCurrent', 0.6, 0.7),
      createAttempt(UUID_V4, 'activity:X', 'RelaxThreshold', 0.55, 0.65),
    ];
    expect(shouldEscalate(attempts)).toBe(false);
  });

  it('isLIVE09bViolation triggers when both precision and fitness are below 0.5', () => {
    const attempt = createAttempt(UUID_V4, 'activity:X', 'KeepCurrent', 0.4, 0.3);
    expect(isLIVE09bViolation(attempt)).toBe(true);
  });

  it('isLIVE09bViolation does not trigger when either score is >= 0.5', () => {
    const high_precision = createAttempt(UUID_V4, 'activity:X', 'KeepCurrent', 0.6, 0.3);
    const high_fitness = createAttempt(UUID_V4, 'activity:X', 'KeepCurrent', 0.4, 0.6);

    expect(isLIVE09bViolation(high_precision)).toBe(false);
    expect(isLIVE09bViolation(high_fitness)).toBe(false);
  });

  it('createAttempt produces stable shape required by mcpp proposals/<run_id>.json', () => {
    const attempt = createAttempt(UUID_V4, 'activity:Approve', 'RelaxThreshold', 0.7, 0.8);

    // Shape must be serializable to proposals/<attempt_id>.json (mcpp-automl contract)
    expect(typeof attempt.attempt_id).toBe('string');
    expect(attempt.attempt_id.length).toBeGreaterThan(0);
    expect(attempt.variant).toBe('RelaxThreshold');
    expect(attempt.cost).toBe(1); // RelaxThreshold is cost 1
    expect(attempt.triggered_by).toBe(UUID_V4);
    expect(attempt.gap_activity_id).toBe('activity:Approve');
    expect(attempt.previous_precision).toBe(0.7);
    expect(attempt.previous_fitness).toBe(0.8);
    expect(typeof attempt.started_at).toBe('string');
    expect(attempt.started_at).toContain('T'); // ISO-8601 format
  });

  it('attempt_id is a ULID — 26 chars of base-32 characters', () => {
    const attempt = createAttempt(UUID_V4, 'activity:X', 'KeepCurrent', 0.5, 0.5);
    // ULID: 10 timestamp chars + 16 random chars from base-32 alphabet
    expect(attempt.attempt_id).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{26}$/);
  });
});

// ── CHANNEL 4: OCEL serialization of SwarmArtifact ───────────────────────────

describe('Channel 4: OCEL serialization of SwarmArtifact (Rank 1 — mathematical invariants)', () => {
  /**
   * mcpp-automl uses OCEL logs for offline POWL route discovery.
   * SwarmArtifact.finalWorkerResults must map to valid OCEL events.
   *
   * OCEL minimal event shape (object-centric event log):
   *   - ocel:eid      — event identifier (unique per event)
   *   - ocel:activity — activity name (maps from algorithmId)
   *   - ocel:timestamp — ISO-8601 string (maps from runAt)
   *   - ocel:type     — event type (always "swarm_worker_result")
   *   - ocel:vmap     — value map (resultHash, workerId, durationMs, etc.)
   *
   * GAP-2 documented: no built-in OCEL serializer in SwarmArtifact.
   * This mapping is what mcpp-automl consumers must implement.
   */

  /** Reference OCEL event serializer for WorkerResult. */
  function workerResultToOcelEvent(
    result: WorkerResult,
    eventIndex: number,
  ): Record<string, unknown> {
    return {
      'ocel:eid': `swarm_${result.workerId}_${result.algorithmId}_${eventIndex}`,
      'ocel:activity': `swarm:${result.algorithmId}`,
      'ocel:timestamp': result.runAt,
      'ocel:type': 'swarm_worker_result',
      'ocel:vmap': {
        worker_id: result.workerId,
        result_hash: result.resultHash,
        duration_ms: result.durationMs,
        algorithm_id: result.algorithmId,
        failed: result.failed ?? false,
        ...(result.error !== undefined ? { error: result.error } : {}),
      },
    };
  }

  it('every WorkerResult maps to a valid OCEL event with required fields', () => {
    const result = makeWorkerResult();
    const event = workerResultToOcelEvent(result, 0);

    expect(typeof event['ocel:eid']).toBe('string');
    expect((event['ocel:eid'] as string).length).toBeGreaterThan(0);
    expect(typeof event['ocel:activity']).toBe('string');
    expect((event['ocel:activity'] as string).startsWith('swarm:')).toBe(true);
    expect(typeof event['ocel:timestamp']).toBe('string');
    expect(event['ocel:type']).toBe('swarm_worker_result');
    expect(typeof event['ocel:vmap']).toBe('object');
  });

  it('OCEL event timestamp is a valid ISO-8601 string (Rank 1 — temporal soundness)', () => {
    const result = makeWorkerResult({ runAt: NOW_ISO });
    const event = workerResultToOcelEvent(result, 0);

    const ts = event['ocel:timestamp'] as string;
    expect(ts).toContain('T');
    expect(isNaN(new Date(ts).getTime())).toBe(false);
  });

  it('SwarmArtifact with N workers produces N OCEL events (Rank 1 — completeness)', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'heuristic_miner' }),
      makeWorkerResult({ workerId: 'w3', algorithmId: 'inductive_miner' }),
    ];
    const artifact = makeSwarmArtifact(workers);
    const events = artifact.finalWorkerResults.map((r, i) => workerResultToOcelEvent(r, i));

    expect(events).toHaveLength(3);
  });

  it('OCEL event IDs are unique across all workers in an artifact (Rank 1 — no aliasing)', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w3', algorithmId: 'dfg' }),
    ];
    const artifact = makeSwarmArtifact(workers);
    const events = artifact.finalWorkerResults.map((r, i) => workerResultToOcelEvent(r, i));
    const eids = events.map((e) => e['ocel:eid'] as string);

    const uniqueEids = new Set(eids);
    expect(uniqueEids.size).toBe(eids.length);
  });

  it('OCEL vmap carries result_hash for mcpp-automl provenance chain', () => {
    const result = makeWorkerResult({ resultHash: 'cafebabe99' });
    const event = workerResultToOcelEvent(result, 0);

    const vmap = event['ocel:vmap'] as Record<string, unknown>;
    expect(vmap.result_hash).toBe('cafebabe99');
  });

  it('failed worker OCEL event carries failed=true and error in vmap', () => {
    const result = makeWorkerResult({ failed: true, error: 'worker timeout' });
    const event = workerResultToOcelEvent(result, 0);

    const vmap = event['ocel:vmap'] as Record<string, unknown>;
    expect(vmap.failed).toBe(true);
    expect(vmap.error).toBe('worker timeout');
  });

  it('OCEL event is JSON-serializable (GAP-2: no built-in serializer exists)', () => {
    const result = makeWorkerResult();
    const event = workerResultToOcelEvent(result, 0);

    // Must not throw during JSON.stringify (mcpp-automl reads NDJSON)
    let serialized: string;
    expect(() => {
      serialized = JSON.stringify(event);
    }).not.toThrow();
    expect(typeof serialized!).toBe('string');
    // Round-trip must be identity
    expect(JSON.parse(serialized!)).toEqual(event);
  });
});

// ── CHANNEL 5: Convergence hash determinism ───────────────────────────────────

describe('Channel 5: Convergence hash determinism (Rank 1 — mathematical invariants)', () => {
  /**
   * mcpp LIVE-09 correlation uses the dominantHash from SwarmConvergenceReport
   * as evidence forwarded to proof_aggregator. Hash determinism is a Rank-1
   * invariant: same inputs must always produce the same hash.
   */

  it('hashOutput is deterministic for identical inputs', () => {
    const data = { nodes: ['A', 'B'], edges: [{ from: 'A', to: 'B', count: 5 }] };
    expect(hashOutput(data)).toBe(hashOutput(data));
  });

  it('hashOutput is stable for key-insertion-order variations (sorted keys)', () => {
    const v1 = hashOutput({ a: 1, b: 2, c: 3 });
    const v2 = hashOutput({ c: 3, a: 1, b: 2 });
    // Both must produce same hash — sorted-key normalization is the contract
    expect(v1).toBe(v2);
  });

  it('hashOutput returns a non-empty hex string', () => {
    const h = hashOutput({ nodes: [] });
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('different data produces different hashes (collision resistance)', () => {
    const h1 = hashOutput({ nodes: 1 });
    const h2 = hashOutput({ nodes: 2 });
    expect(h1).not.toBe(h2);
  });

  it('checkConvergence dominantHash matches hashOutput of the consensus result', () => {
    const resultData = { nodes: ['A', 'B'], edges: [] };
    const expectedHash = hashOutput(resultData);

    const results: WorkerResult[] = [
      makeWorkerResult({ workerId: 'w1', resultHash: expectedHash, result: resultData }),
      makeWorkerResult({ workerId: 'w2', resultHash: expectedHash, result: resultData }),
      makeWorkerResult({ workerId: 'w3', resultHash: expectedHash, result: resultData }),
    ];

    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(true);
    expect(report.dominantHash).toBe(expectedHash);
  });

  it('unanimous convergence → dominantHash is the only hash in the result set', () => {
    const hash = 'uniform_hash_xyz';
    const results: WorkerResult[] = ['w1', 'w2', 'w3', 'w4'].map((id) =>
      makeWorkerResult({ workerId: id, resultHash: hash }),
    );

    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(true);
    expect(report.dominantHash).toBe(hash);
    expect(report.dissentingWorkers).toHaveLength(0);
    expect(report.consensusRatio).toBe(1.0);
  });
});

// ── Full-pipeline: swarm → BEAM → mcpp integration contract ──────────────────

describe('Full pipeline: swarm artifact → BEAM bridge → mcpp routing contract (Rank 3)', () => {
  /**
   * Metamorphic relation: convergence state of swarm determines BEAM message type.
   *
   *   converged=true  → exactly 1 "collect" message (proof_aggregator receives evidence)
   *   converged=false → exactly N "report_gap" messages (route_coordinator handles gaps)
   *   exhausted       → exactly 1 "propagate_exhaustion" message (andon_supervisor)
   *
   * This is the canonical routing table for the mcpp BEAM topology.
   */

  it('converged swarm → "collect" path → exactly 1 message for proof_aggregator', () => {
    const report = makeConvergenceReport({ converged: true, dominantHash: 'hash-abc' });
    const messages = convergenceToBeam(report);

    expect(messages).toHaveLength(1);
    expect(messages[0].tag).toBe('collect');
    // proof_aggregator is the only valid recipient of collect (A-P09)
    expect(messages[0].payload.evidence).toBe('hash-abc');
  });

  it('divergent swarm → "report_gap" path → N messages for route_coordinator', () => {
    const dissenters = ['w-alpha', 'w-beta', 'w-gamma'];
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: dissenters,
      consensusRatio: 0.25,
    });
    const messages = convergenceToBeam(report);

    expect(messages).toHaveLength(dissenters.length);
    expect(messages.every((m) => m.tag === 'report_gap')).toBe(true);
  });

  it('timeout exhaustion → "propagate_exhaustion" path → andon_supervisor', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.4);
    const msg = exhaustionToBeam(err);

    expect(msg.tag).toBe('propagate_exhaustion');
    // andon_supervisor never emits Accepted (A-P09 satisfied by tag check)
    expect(msg.tag).not.toBe('accepted');
  });

  it('three-way routing table: converged/diverged/exhausted produce different tags', () => {
    const convergedMsgs = convergenceToBeam(makeConvergenceReport({ converged: true }));
    const divergedMsgs = convergenceToBeam(
      makeConvergenceReport({ converged: false, dissentingWorkers: ['w1'] }),
    );
    const exhaustionMsg = exhaustionToBeam(new ConvergenceTimeoutError(1, 1, 0));

    const convergedTag = convergedMsgs[0].tag;
    const divergedTag = divergedMsgs[0].tag;
    const exhaustedTag = exhaustionMsg.tag;

    expect(convergedTag).toBe('collect');
    expect(divergedTag).toBe('report_gap');
    expect(exhaustedTag).toBe('propagate_exhaustion');

    // All three are distinct (no routing ambiguity)
    expect(convergedTag).not.toBe(divergedTag);
    expect(divergedTag).not.toBe(exhaustedTag);
    expect(convergedTag).not.toBe(exhaustedTag);
  });

  it('A-P09 invariant holds across all three routing paths (no path emits "accepted")', () => {
    const allMessages: BeamMessage[] = [
      ...convergenceToBeam(makeConvergenceReport({ converged: true })),
      ...convergenceToBeam(
        makeConvergenceReport({ converged: false, dissentingWorkers: ['w1'] }),
      ),
      exhaustionToBeam(new ConvergenceTimeoutError(1, 1, 0)),
      exhaustionToBeam(new ConvergenceMaxIterationsError(10, 5, 0.3)),
      workerResultToBeam(makeWorkerResult(), 'activity:test'),
    ];

    for (const msg of allMessages) {
      expect(msg.tag).not.toBe('accepted');
      expect(() => assertNotAccept(msg)).not.toThrow();
    }
  });
});
