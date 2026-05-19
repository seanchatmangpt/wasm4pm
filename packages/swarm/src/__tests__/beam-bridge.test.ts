/**
 * beam-bridge.test.ts — Domain-contract tests for the wasm4pm → BEAM bridge
 *
 * Oracle rank: Rank 2 (domain contract) — properties derived from the A-P09
 * constraint and the BEAM actor message protocol, not from implementation
 * internals.
 *
 * Tested functions:
 *   assertNotAccept()       — A-P09 guard
 *   convergenceToBeam()     — SwarmConvergenceReport → BeamMessage[]
 *   workerResultToBeam()    — WorkerResult → BeamMessage
 *   exhaustionToBeam()      — error classes → BeamMessage
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
  ConvergenceMaxIterationsError,
  ConvergenceTimeoutError,
  type WorkerResult,
  type SwarmConvergenceReport,
} from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWorkerResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    workerId: 'worker-log1-dfg',
    algorithmId: 'dfg',
    resultHash: 'abc123def456',
    result: { nodes: [], edges: [] },
    runAt: '2026-05-17T00:00:00.000Z',
    durationMs: 42,
    ...overrides,
  };
}

function makeConvergenceReport(overrides: Partial<SwarmConvergenceReport> = {}): SwarmConvergenceReport {
  return {
    algorithm: 'dfg',
    converged: true,
    consensusRatio: 1.0,
    dominantHash: 'abc123def456',
    dissentingWorkers: [],
    totalChecked: 3,
    convergenceReason: '3/3 workers agree (unanimous)',
    ...overrides,
  };
}

// ── assertNotAccept ───────────────────────────────────────────────────────────

describe('assertNotAccept', () => {
  it('does not throw for non-accepted tags', () => {
    const safeMessages: BeamMessage[] = [
      { tag: 'collect', payload: { evidence: 'hash1' } },
      { tag: 'report_gap', payload: { activity_id: 'w1' } },
      { tag: 'activity', payload: { evidence: 'hash2' } },
      { tag: 'propagate_exhaustion', payload: { reason: 'timeout' } },
    ];
    for (const msg of safeMessages) {
      expect(() => assertNotAccept(msg)).not.toThrow();
    }
  });

  it('throws for tag "accepted" — A-P09 violation', () => {
    const forbidden: BeamMessage = { tag: 'accepted', payload: { verdict: 'ok' } };
    expect(() => assertNotAccept(forbidden)).toThrow(/A-P09/);
    expect(() => assertNotAccept(forbidden)).toThrow(/accepted/);
  });
});

// ── convergenceToBeam ─────────────────────────────────────────────────────────

describe('convergenceToBeam — converged=true, dominantHash present', () => {
  it('returns exactly one "collect" message', () => {
    const report = makeConvergenceReport({ converged: true, dominantHash: 'abc123' });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].tag).toBe('collect');
  });

  it('embeds the dominantHash as evidence', () => {
    const report = makeConvergenceReport({ dominantHash: 'deadbeef' });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.evidence).toBe('deadbeef');
  });

  it('sets activity to "swarm_consensus"', () => {
    const report = makeConvergenceReport({ dominantHash: 'hash99' });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.activity).toBe('swarm_consensus');
  });

  it('never emits tag "accepted" — A-P09 must hold', () => {
    const report = makeConvergenceReport({ dominantHash: 'xyz' });
    const msgs = convergenceToBeam(report);
    for (const msg of msgs) {
      expect(msg.tag).not.toBe('accepted');
    }
  });
});

describe('convergenceToBeam — converged=true, dominantHash is null', () => {
  it('returns an empty array (no evidence to forward)', () => {
    const report = makeConvergenceReport({ converged: true, dominantHash: null });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(0);
  });
});

describe('convergenceToBeam — converged=false (dissent path)', () => {
  it('returns one "report_gap" message per dissenting worker', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-a', 'worker-b', 'worker-c'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(3);
    for (const msg of msgs) {
      expect(msg.tag).toBe('report_gap');
    }
  });

  it('maps each dissenting worker ID to activity_id in payload', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-x', 'worker-y'],
    });
    const msgs = convergenceToBeam(report);
    const ids = msgs.map((m) => m.payload.activity_id);
    expect(ids).toContain('worker-x');
    expect(ids).toContain('worker-y');
  });

  it('sets gap_type to "dissent"', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-z'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.gap_type).toBe('dissent');
  });

  it('sets failed_check to "swarm_consensus"', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-z'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.failed_check).toBe('swarm_consensus');
  });

  it('never emits tag "accepted" — A-P09 must hold', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['w1', 'w2'],
    });
    const msgs = convergenceToBeam(report);
    for (const msg of msgs) {
      expect(msg.tag).not.toBe('accepted');
    }
  });

  it('returns empty array when dissentingWorkers is empty', () => {
    const report = makeConvergenceReport({ converged: false, dissentingWorkers: [] });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(0);
  });
});

// ── workerResultToBeam ────────────────────────────────────────────────────────

describe('workerResultToBeam', () => {
  it('returns a message with tag "activity"', () => {
    const msg = workerResultToBeam(makeWorkerResult(), 'discover_dfg');
    expect(msg.tag).toBe('activity');
  });

  it('maps activityId parameter to payload.activity_id', () => {
    const msg = workerResultToBeam(makeWorkerResult(), 'my_activity');
    expect(msg.payload.activity_id).toBe('my_activity');
  });

  it('maps resultHash to payload.evidence', () => {
    const result = makeWorkerResult({ resultHash: 'hashXYZ' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.evidence).toBe('hashXYZ');
  });

  it('maps workerId to payload.worker_id', () => {
    const result = makeWorkerResult({ workerId: 'worker-log1-dfg' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.worker_id).toBe('worker-log1-dfg');
  });

  it('maps algorithmId to payload.algorithm_id', () => {
    const result = makeWorkerResult({ algorithmId: 'ilp' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.algorithm_id).toBe('ilp');
  });

  it('maps runAt to payload.run_at', () => {
    const result = makeWorkerResult({ runAt: '2026-05-17T12:00:00.000Z' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.run_at).toBe('2026-05-17T12:00:00.000Z');
  });

  it('maps durationMs to payload.duration_ms', () => {
    const result = makeWorkerResult({ durationMs: 99 });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.duration_ms).toBe(99);
  });

  it('defaults failed to false when WorkerResult.failed is absent', () => {
    const result = makeWorkerResult();
    // makeWorkerResult does not set failed
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.failed).toBe(false);
  });

  it('propagates failed=true from WorkerResult', () => {
    const result = makeWorkerResult({ failed: true, error: 'WASM load failed' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.failed).toBe(true);
  });

  it('includes error field when WorkerResult.error is set', () => {
    const result = makeWorkerResult({ failed: true, error: 'out of memory' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.error).toBe('out of memory');
  });

  it('omits error field when WorkerResult.error is absent', () => {
    const result = makeWorkerResult();
    const msg = workerResultToBeam(result, 'act');
    expect('error' in msg.payload).toBe(false);
  });

  it('never emits tag "accepted" — A-P09 must hold', () => {
    const msg = workerResultToBeam(makeWorkerResult(), 'act');
    expect(msg.tag).not.toBe('accepted');
  });
});

// ── exhaustionToBeam ──────────────────────────────────────────────────────────

describe('exhaustionToBeam — ConvergenceMaxIterationsError', () => {
  it('returns a message with tag "propagate_exhaustion"', () => {
    const error = new ConvergenceMaxIterationsError(150, 100, 0.6);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).toBe('propagate_exhaustion');
  });

  it('embeds the error message in payload.reason', () => {
    const error = new ConvergenceMaxIterationsError(150, 100, 0.6);
    const msg = exhaustionToBeam(error);
    expect(typeof msg.payload.reason).toBe('string');
    expect((msg.payload.reason as string).length).toBeGreaterThan(0);
  });

  it('embeds error_name in the payload', () => {
    const error = new ConvergenceMaxIterationsError(150, 100, 0.6);
    const msg = exhaustionToBeam(error);
    expect(msg.payload.error_name).toBe('ConvergenceMaxIterationsError');
  });

  it('never emits tag "accepted" — A-P09 must hold', () => {
    const error = new ConvergenceMaxIterationsError(10, 5, 0.3);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).not.toBe('accepted');
  });
});

describe('exhaustionToBeam — ConvergenceTimeoutError', () => {
  it('returns a message with tag "propagate_exhaustion"', () => {
    const error = new ConvergenceTimeoutError(10, 10, 0.4);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).toBe('propagate_exhaustion');
  });

  it('embeds error_name as ConvergenceTimeoutError', () => {
    const error = new ConvergenceTimeoutError(10, 10, 0.4);
    const msg = exhaustionToBeam(error);
    expect(msg.payload.error_name).toBe('ConvergenceTimeoutError');
  });
});
