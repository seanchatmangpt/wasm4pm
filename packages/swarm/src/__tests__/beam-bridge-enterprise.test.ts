/**
 * beam-bridge-enterprise.test.ts — Enterprise A-P09 property tests for the BEAM bridge
 *
 * Oracle rank: Rank 2 (domain contract) and Rank 3 (metamorphic)
 *
 * Covers gaps not addressed in beam-bridge.test.ts:
 *   - A-P09 metamorphic property test (100 random swarm states)
 *   - assertNotAccept case-sensitivity (ACCEPTED, Accepted, "" — all safe)
 *   - assertNotAccept with various safe tags (exhaustive set)
 *   - BeamMessage payload structure invariants across all bridge functions
 *   - convergenceToBeam: converged=false + dominantHash=null combination
 *   - convergenceToBeam: large dissentingWorkers array (scale)
 *   - convergenceToBeam: consensusRatio=0.0 edge case
 *   - workerResultToBeam: empty activityId string is forwarded faithfully
 *   - workerResultToBeam: failed=false explicitly (vs absent)
 *   - workerResultToBeam: zero-length resultHash
 *   - exhaustionToBeam: ConvergenceTimeoutError payload.reason is non-empty string
 *   - exhaustionToBeam: MaxIterations boundary params (0 iterations)
 *   - Message isolation: two calls to workerResultToBeam don't share payload references
 *   - Full-pipeline: WorkerResult + ConvergenceReport → combined BEAM message set
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
    resultHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
    result: { nodes: [], edges: [] },
    runAt: '2026-05-17T00:00:00.000Z',
    durationMs: 42,
    ...overrides,
  };
}

function makeConvergenceReport(
  overrides: Partial<SwarmConvergenceReport> = {}
): SwarmConvergenceReport {
  return {
    algorithm: 'dfg',
    converged: true,
    consensusRatio: 1.0,
    dominantHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
    dissentingWorkers: [],
    totalChecked: 3,
    convergenceReason: '3/3 workers agree (unanimous)',
    ...overrides,
  };
}

/** Build a random-ish convergence report for metamorphic testing. */
function makeRandomConvergenceReport(seed: number): SwarmConvergenceReport {
  // Deterministic pseudo-random using seed (lcg)
  const lcg = (n: number) => (n * 1664525 + 1013904223) & 0x7fffffff;
  let s = seed;
  const rand = () => { s = lcg(s); return s / 0x7fffffff; };

  const converged = rand() > 0.5;
  const hasDominantHash = rand() > 0.3;
  const workerCount = Math.floor(rand() * 5);

  return {
    algorithm: converged ? 'dfg' : 'heuristic_miner',
    converged,
    consensusRatio: rand(),
    dominantHash: hasDominantHash
      ? `${'a'.repeat(32)}${'b'.repeat(32)}`
      : null,
    dissentingWorkers: Array.from({ length: workerCount }, (_, i) => `worker-${seed}-${i}`),
    totalChecked: workerCount + Math.floor(rand() * 3),
    convergenceReason: converged ? 'converged' : 'not converged',
  };
}

// ── A-P09 assertNotAccept — case-sensitivity ─────────────────────────────────

describe('assertNotAccept — case-sensitivity (A-P09)', () => {
  it('does NOT throw for tag="ACCEPTED" (uppercase — not the forbidden value)', () => {
    const msg: BeamMessage = { tag: 'ACCEPTED', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('does NOT throw for tag="Accepted" (mixed case — not the forbidden value)', () => {
    const msg: BeamMessage = { tag: 'Accepted', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('does NOT throw for tag="ACCEPTED " (trailing space)', () => {
    const msg: BeamMessage = { tag: 'ACCEPTED ', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('DOES throw for tag="accepted" (exact lowercase — A-P09 violation)', () => {
    const msg: BeamMessage = { tag: 'accepted', payload: {} };
    expect(() => assertNotAccept(msg)).toThrow(/A-P09/);
  });

  it('does NOT throw for empty tag string', () => {
    const msg: BeamMessage = { tag: '', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('does NOT throw for tag="accept" (prefix of forbidden — not the forbidden value)', () => {
    const msg: BeamMessage = { tag: 'accept', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('does NOT throw for tag="acceptedd" (suffix — not the forbidden value)', () => {
    const msg: BeamMessage = { tag: 'acceptedd', payload: {} };
    expect(() => assertNotAccept(msg)).not.toThrow();
  });

  it('A-P09 error message includes the forbidden tag name for diagnosis', () => {
    const msg: BeamMessage = { tag: 'accepted', payload: { verdict: 'ok' } };
    let caught: Error | null = null;
    try { assertNotAccept(msg); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('accepted');
    expect(caught!.message).toContain('A-P09');
  });
});

// ── A-P09 metamorphic: 100 random convergence states ─────────────────────────

describe('A-P09 metamorphic property — 100 random swarm reports', () => {
  it('property: 100 random convergence states never produce tag="accepted"', () => {
    for (let i = 0; i < 100; i++) {
      const report = makeRandomConvergenceReport(i * 7919 + 1); // distinct primes
      const msgs = convergenceToBeam(report);
      for (const msg of msgs) {
        expect(msg.tag).not.toBe('accepted');
      }
    }
  });

  it('property: all tags produced by convergenceToBeam are in the allowed set', () => {
    const allowedTags = new Set(['collect', 'report_gap']);
    for (let i = 0; i < 100; i++) {
      const report = makeRandomConvergenceReport(i * 3571 + 13);
      const msgs = convergenceToBeam(report);
      for (const msg of msgs) {
        expect(allowedTags.has(msg.tag)).toBe(true);
      }
    }
  });

  it('property: all payloads from convergenceToBeam are plain objects', () => {
    for (let i = 0; i < 100; i++) {
      const report = makeRandomConvergenceReport(i * 6271 + 17);
      const msgs = convergenceToBeam(report);
      for (const msg of msgs) {
        expect(typeof msg.payload).toBe('object');
        expect(msg.payload).not.toBeNull();
        expect(Array.isArray(msg.payload)).toBe(false);
      }
    }
  });
});

// ── convergenceToBeam — edge cases not in base tests ─────────────────────────

describe('convergenceToBeam — additional edge cases', () => {
  it('converged=false with dominantHash=null returns report_gap messages (not collect)', () => {
    const report = makeConvergenceReport({
      converged: false,
      dominantHash: null,
      dissentingWorkers: ['worker-a'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].tag).toBe('report_gap');
  });

  it('converged=false with dominantHash set still routes to report_gap (not collect)', () => {
    // dominantHash is irrelevant when converged=false — the dissent path is taken
    const report = makeConvergenceReport({
      converged: false,
      dominantHash: 'some-hash',
      dissentingWorkers: ['worker-x'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].tag).toBe('report_gap');
    expect(msgs[0].tag).not.toBe('collect');
  });

  it('large dissentingWorkers array (50 workers) produces exactly 50 report_gap messages', () => {
    const workers = Array.from({ length: 50 }, (_, i) => `worker-${i}`);
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: workers,
    });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(50);
    for (const msg of msgs) {
      expect(msg.tag).toBe('report_gap');
    }
  });

  it('consensusRatio=0.0 with converged=false and empty dissentingWorkers → empty array', () => {
    const report = makeConvergenceReport({
      converged: false,
      consensusRatio: 0.0,
      dominantHash: null,
      dissentingWorkers: [],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs).toHaveLength(0);
  });

  it('collect message evidence is the exact dominantHash string', () => {
    const dominantHash = 'cafebabe'.repeat(8);
    const report = makeConvergenceReport({ converged: true, dominantHash });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.evidence).toBe(dominantHash);
    expect(msgs[0].payload.evidence).toHaveLength(64);
  });

  it('report_gap payload.evidence is null (bridge does not fabricate evidence)', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-q'],
    });
    const msgs = convergenceToBeam(report);
    expect(msgs[0].payload.evidence).toBeNull();
  });
});

// ── workerResultToBeam — additional coverage ──────────────────────────────────

describe('workerResultToBeam — additional coverage', () => {
  it('always produces tag="activity" regardless of WorkerResult content', () => {
    const variants: Partial<WorkerResult>[] = [
      {},
      { failed: true, error: 'boom' },
      { failed: false },
      { resultHash: '' },
      { durationMs: 0 },
      { algorithmId: 'genetic_algorithm' },
    ];
    for (const override of variants) {
      const msg = workerResultToBeam(makeWorkerResult(override), 'any_activity');
      expect(msg.tag).toBe('activity');
    }
  });

  it('forwards empty activityId faithfully (no default substitution)', () => {
    const msg = workerResultToBeam(makeWorkerResult(), '');
    expect(msg.payload.activity_id).toBe('');
  });

  it('forwards zero-length resultHash faithfully', () => {
    const result = makeWorkerResult({ resultHash: '' });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.evidence).toBe('');
  });

  it('failed=false explicitly (not absent) maps to payload.failed=false', () => {
    const result = makeWorkerResult({ failed: false });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.failed).toBe(false);
  });

  it('durationMs=0 is preserved (not coerced to falsy omission)', () => {
    const result = makeWorkerResult({ durationMs: 0 });
    const msg = workerResultToBeam(result, 'act');
    expect(msg.payload.duration_ms).toBe(0);
  });

  it('two independent calls do not share payload object references', () => {
    const r1 = makeWorkerResult({ workerId: 'w1' });
    const r2 = makeWorkerResult({ workerId: 'w2' });
    const m1 = workerResultToBeam(r1, 'act');
    const m2 = workerResultToBeam(r2, 'act');
    // Mutating one payload must not affect the other
    (m1.payload as Record<string, unknown>)['worker_id'] = 'MUTATED';
    expect(m2.payload.worker_id).toBe('w2');
  });

  it('payload is a plain Record (not an array, not null, not a class instance)', () => {
    const msg = workerResultToBeam(makeWorkerResult(), 'act');
    expect(typeof msg.payload).toBe('object');
    expect(msg.payload).not.toBeNull();
    expect(Array.isArray(msg.payload)).toBe(false);
    expect(Object.getPrototypeOf(msg.payload)).toBe(Object.prototype);
  });
});

// ── exhaustionToBeam — additional coverage ────────────────────────────────────

describe('exhaustionToBeam — additional coverage', () => {
  it('ConvergenceTimeoutError: payload.reason is a non-empty string', () => {
    const error = new ConvergenceTimeoutError(10, 10, 0.4);
    const msg = exhaustionToBeam(error);
    expect(typeof msg.payload.reason).toBe('string');
    expect((msg.payload.reason as string).length).toBeGreaterThan(0);
  });

  it('ConvergenceTimeoutError: payload.reason contains the episode count', () => {
    const error = new ConvergenceTimeoutError(7, 7, 0.55);
    const msg = exhaustionToBeam(error);
    expect(msg.payload.reason as string).toMatch(/7/);
  });

  it('ConvergenceMaxIterationsError: boundary params (0 iterations, limit 0)', () => {
    // Degenerate case: swarm that had 0 budget
    const error = new ConvergenceMaxIterationsError(0, 0, 0.0);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).toBe('propagate_exhaustion');
    expect(typeof msg.payload.reason).toBe('string');
    expect(msg.payload.error_name).toBe('ConvergenceMaxIterationsError');
  });

  it('ConvergenceMaxIterationsError: payload.reason contains iterationsRun', () => {
    const error = new ConvergenceMaxIterationsError(999, 500, 0.72);
    const msg = exhaustionToBeam(error);
    expect(msg.payload.reason as string).toMatch(/999/);
  });

  it('both error classes produce the same tag', () => {
    const maxIter = exhaustionToBeam(new ConvergenceMaxIterationsError(1, 1, 0.0));
    const timeout = exhaustionToBeam(new ConvergenceTimeoutError(1, 1, 0.0));
    expect(maxIter.tag).toBe(timeout.tag);
    expect(maxIter.tag).toBe('propagate_exhaustion');
  });

  it('error classes produce distinct error_name values', () => {
    const maxIter = exhaustionToBeam(new ConvergenceMaxIterationsError(1, 1, 0.0));
    const timeout = exhaustionToBeam(new ConvergenceTimeoutError(1, 1, 0.0));
    expect(maxIter.payload.error_name).not.toBe(timeout.payload.error_name);
  });

  it('never emits tag "accepted" for ConvergenceTimeoutError — A-P09 holds', () => {
    const error = new ConvergenceTimeoutError(5, 5, 0.2);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).not.toBe('accepted');
  });
});

// ── Payload structure invariants ──────────────────────────────────────────────

describe('BeamMessage payload structure invariants', () => {
  it('collect message payload has evidence and activity fields', () => {
    const report = makeConvergenceReport({ converged: true, dominantHash: 'hash42' });
    const msgs = convergenceToBeam(report);
    const collectMsg = msgs[0];
    expect('evidence' in collectMsg.payload).toBe(true);
    expect('activity' in collectMsg.payload).toBe(true);
  });

  it('report_gap message payload has activity_id, gap_type, failed_check fields', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['worker-1'],
    });
    const msgs = convergenceToBeam(report);
    const gapMsg = msgs[0];
    expect('activity_id' in gapMsg.payload).toBe(true);
    expect('gap_type' in gapMsg.payload).toBe(true);
    expect('failed_check' in gapMsg.payload).toBe(true);
  });

  it('activity message payload has activity_id, evidence, worker_id, algorithm_id, run_at, duration_ms, failed', () => {
    const msg = workerResultToBeam(makeWorkerResult(), 'my_act');
    const required = ['activity_id', 'evidence', 'worker_id', 'algorithm_id', 'run_at', 'duration_ms', 'failed'];
    for (const field of required) {
      expect(field in msg.payload).toBe(true);
    }
  });

  it('propagate_exhaustion message payload has reason and error_name', () => {
    const msg = exhaustionToBeam(new ConvergenceMaxIterationsError(10, 10, 0.5));
    expect('reason' in msg.payload).toBe(true);
    expect('error_name' in msg.payload).toBe(true);
  });
});

// ── Full-pipeline integration ─────────────────────────────────────────────────

describe('Full-pipeline: SwarmEpisode results → complete BEAM message set', () => {
  it('pipeline: converged episode + worker results produces collect + activity messages', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'dfg' }),
    ];
    const convergence = makeConvergenceReport({
      converged: true,
      dominantHash: 'deadbeef'.repeat(8),
      totalChecked: 2,
    });

    const workerMsgs = workers.map((w) => workerResultToBeam(w, `${w.algorithmId}_result`));
    const convMsgs = convergenceToBeam(convergence);

    const allMsgs = [...workerMsgs, ...convMsgs];

    // A-P09 holds for the entire pipeline output
    for (const msg of allMsgs) {
      expect(msg.tag).not.toBe('accepted');
    }

    const tags = allMsgs.map((m) => m.tag);
    expect(tags).toContain('activity');
    expect(tags).toContain('collect');
    expect(tags).not.toContain('accepted');
  });

  it('pipeline: failed episode produces propagate_exhaustion instead of collect', () => {
    const error = new ConvergenceMaxIterationsError(200, 100, 0.3);
    const exhaustionMsg = exhaustionToBeam(error);

    expect(exhaustionMsg.tag).toBe('propagate_exhaustion');
    expect(exhaustionMsg.tag).not.toBe('collect');
    expect(exhaustionMsg.tag).not.toBe('accepted');
  });

  it('pipeline: dissent episode produces report_gap messages, never collect or accepted', () => {
    const convergence = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['w1', 'w2', 'w3'],
    });
    const msgs = convergenceToBeam(convergence);

    for (const msg of msgs) {
      expect(msg.tag).not.toBe('collect');
      expect(msg.tag).not.toBe('accepted');
    }
    expect(msgs.every((m) => m.tag === 'report_gap')).toBe(true);
  });
});
