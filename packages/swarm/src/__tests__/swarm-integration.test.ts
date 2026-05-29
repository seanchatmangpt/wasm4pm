/**
 * swarm-integration.test.ts
 *
 * Integration test: 2-worker swarm lifecycle — spawn workers, simulate episodes,
 * verify convergence is detected, dissolve workers.
 *
 * This test does NOT use generateText/LLM. Workers are mocked to return
 * identical DFG structures so convergence is deterministic.
 *
 * Rank-2 domain contract: A swarm of N workers all producing identical output
 * MUST converge after `convergenceRuns` identical consecutive rounds.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  spawnWorker,
  getWorker,
  dissolveWorkers,
  listWorkers,
} from '../worker-registry.js';
import { checkSwarmConvergence, hashOutput } from '../convergence.js';
import type { WorkerResult } from '../types.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_XES_W1 = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
  </trace>
</log>`;

const MOCK_XES_W2 = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-2"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
</log>`;

/** A mock DFG result — same structure for both workers so hashes match. */
const SHARED_DFG_RESULT = {
  activities: ['A', 'B'],
  edges: [
    { source: 'A', target: 'B', count: 42 },
  ],
  start_activities: { A: 10 },
  end_activities: { B: 10 },
};

function makeWorkerResult(
  workerId: string,
  algorithmId: string,
  result: unknown,
  overrides: Partial<WorkerResult> = {}
): WorkerResult {
  return {
    workerId,
    algorithmId,
    resultHash: hashOutput(result),
    result,
    runAt: new Date().toISOString(),
    durationMs: 5,
    resultType: 'discovery',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Worker lifecycle: spawn, inspect, dissolve
// ---------------------------------------------------------------------------

describe('Swarm integration: 2-worker lifecycle', () => {
  const W1 = 'integration-worker-1';
  const W2 = 'integration-worker-2';

  beforeEach(() => {
    // Clean up any workers left from prior tests
    dissolveWorkers([W1, W2]);
  });

  it('spawns 2 workers and registers them in the registry', () => {
    spawnWorker(W1, MOCK_XES_W1, 'worker-alpha');
    spawnWorker(W2, MOCK_XES_W2, 'worker-beta');

    const w1 = getWorker(W1);
    const w2 = getWorker(W2);

    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    expect(w1!.workerId).toBe(W1);
    expect(w2!.workerId).toBe(W2);
    expect(w1!.label).toBe('worker-alpha');
    expect(w2!.label).toBe('worker-beta');
    expect(w1!.status).toBe('ready');
    expect(w2!.status).toBe('ready');
  });

  it('workers are discoverable via listWorkers after spawn', () => {
    spawnWorker(W1, MOCK_XES_W1);
    spawnWorker(W2, MOCK_XES_W2);

    const all = listWorkers();
    const ids = all.map((w) => w.workerId);
    expect(ids).toContain(W1);
    expect(ids).toContain(W2);
  });

  it('dissolveWorkers removes workers from the registry', () => {
    spawnWorker(W1, MOCK_XES_W1);
    spawnWorker(W2, MOCK_XES_W2);

    const dissolved = dissolveWorkers([W1, W2]);
    expect(dissolved).toHaveLength(2);
    expect(dissolved).toContain(W1);
    expect(dissolved).toContain(W2);

    expect(getWorker(W1)).toBeUndefined();
    expect(getWorker(W2)).toBeUndefined();
  });

  it('dissolving already-gone workers returns empty list', () => {
    // Neither worker was spawned
    const dissolved = dissolveWorkers([W1, W2]);
    expect(dissolved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Convergence detection: 2 workers producing identical DFG output
// ---------------------------------------------------------------------------

describe('Swarm integration: convergence detection with 2 mocked workers', () => {
  const W1 = 'conv-worker-1';
  const W2 = 'conv-worker-2';
  const ALGO = 'dfg';
  const CONVERGENCE_RUNS = 2;

  beforeEach(() => {
    dissolveWorkers([W1, W2]);
  });

  it('does NOT converge on the first episode (ring buffer not yet full)', () => {
    const history = new Map<string, string[]>();

    const round1: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];

    const { converged, stableWorkers, unstableWorkers } =
      checkSwarmConvergence(round1, history, CONVERGENCE_RUNS);

    // After 1 round, no worker has accumulated 2 identical consecutive hashes
    expect(converged).toBe(false);
    expect(stableWorkers).toHaveLength(0);
    expect(unstableWorkers).toHaveLength(2);
  });

  it('converges after convergenceRuns=2 identical consecutive rounds', () => {
    const history = new Map<string, string[]>();

    const round: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];

    // Episode 1: prime the ring buffer
    const r1 = checkSwarmConvergence(round, history, CONVERGENCE_RUNS);
    expect(r1.converged).toBe(false);

    // Episode 2: both workers produce same hash again → ring buffer full, all equal
    const r2 = checkSwarmConvergence(round, history, CONVERGENCE_RUNS);
    expect(r2.converged).toBe(true);
    expect(r2.stableWorkers).toHaveLength(2);
    expect(r2.unstableWorkers).toHaveLength(0);
    expect(r2.agreementRate).toBe(1.0);
    expect(r2.convergenceReason).toMatch(/all 2 worker\(s\) stable/);
  });

  it('convergenceRuns=3 requires 3 identical consecutive rounds', () => {
    const history = new Map<string, string[]>();
    const RUNS = 3;

    const round: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];

    // Rounds 1 and 2 must not converge
    expect(checkSwarmConvergence(round, history, RUNS).converged).toBe(false);
    expect(checkSwarmConvergence(round, history, RUNS).converged).toBe(false);
    // Round 3 triggers convergence
    expect(checkSwarmConvergence(round, history, RUNS).converged).toBe(true);
  });

  it('hash change in round 3 resets stability and delays convergence', () => {
    const history = new Map<string, string[]>();

    const stableRound: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];

    // Round 1: prime buffer
    checkSwarmConvergence(stableRound, history, CONVERGENCE_RUNS);

    // Round 2: worker 1 returns a different result (changed output)
    const changedResult = { ...SHARED_DFG_RESULT, activities: ['A', 'B', 'C'] };
    const unstableRound: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, changedResult),   // different hash
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];
    const r2 = checkSwarmConvergence(unstableRound, history, CONVERGENCE_RUNS);
    // W1 changed hash → unstable; W2 still has old hash in buffer → also unstable
    expect(r2.converged).toBe(false);

    // Round 3: both workers stable on the new result for W1 and same result for W2
    const r3 = checkSwarmConvergence(unstableRound, history, CONVERGENCE_RUNS);
    // W2 now has 2× SHARED hash (from round 2 & 3) but W1 has 2× changedResult hash
    // Each worker's own ring buffer is full and identical → all stable
    expect(r3.converged).toBe(true);
  });

  it('failed worker never prevents healthy workers from converging', () => {
    const history = new Map<string, string[]>();

    const roundWithFailure: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, null, {         // failed worker
        resultHash: 'FAILED',
        result: null,
        failed: true,
        error: 'simulated timeout',
      }),
    ];

    // Episode 1: prime
    checkSwarmConvergence(roundWithFailure, history, CONVERGENCE_RUNS);
    // Episode 2: same results again (W2 is consistently FAILED)
    const r = checkSwarmConvergence(roundWithFailure, history, CONVERGENCE_RUNS);

    // Both workers are now "stable" (each has 2 identical consecutive hashes,
    // even though W2's hash happens to be 'FAILED')
    expect(r.converged).toBe(true);
    expect(r.stableWorkers).toContain(`${W1}/${ALGO}`);
    expect(r.stableWorkers).toContain(`${W2}/${ALGO}`);
  });

  it('agreementRate tracks the fraction of stable workers', () => {
    const history = new Map<string, string[]>();

    const round1: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];
    const r1 = checkSwarmConvergence(round1, history, CONVERGENCE_RUNS);
    expect(r1.agreementRate).toBe(0.0); // 0/2 stable after first episode

    const r2 = checkSwarmConvergence(round1, history, CONVERGENCE_RUNS);
    expect(r2.agreementRate).toBe(1.0); // 2/2 stable after second episode
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: spawn → simulate episodes → converge → dissolve
// ---------------------------------------------------------------------------

describe('Swarm integration: full start-converge-stop lifecycle', () => {
  const W1 = 'lifecycle-w1';
  const W2 = 'lifecycle-w2';
  const ALGO = 'dfg';

  beforeEach(() => {
    dissolveWorkers([W1, W2]);
  });

  it('completes full lifecycle: spawn 2 workers → converge in 2 episodes → dissolve', () => {
    // --- START: spawn workers ---
    spawnWorker(W1, MOCK_XES_W1);
    spawnWorker(W2, MOCK_XES_W2);
    expect(getWorker(W1)).toBeDefined();
    expect(getWorker(W2)).toBeDefined();

    const convergenceRuns = 2;
    const hashHistory = new Map<string, string[]>();

    // --- EPISODE 1: prime ring buffer ---
    const episode1Results: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];
    const ep1 = checkSwarmConvergence(episode1Results, hashHistory, convergenceRuns);
    expect(ep1.converged).toBe(false);

    // --- EPISODE 2: identical output → convergence ---
    const episode2Results: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];
    const ep2 = checkSwarmConvergence(episode2Results, hashHistory, convergenceRuns);
    expect(ep2.converged).toBe(true);
    expect(ep2.agreementRate).toBe(1.0);
    expect(ep2.convergenceReason).toMatch(/all 2 worker\(s\) stable for 2 consecutive rounds/);

    // --- STOP: dissolve workers ---
    const dissolved = dissolveWorkers([W1, W2]);
    expect(dissolved).toHaveLength(2);
    expect(getWorker(W1)).toBeUndefined();
    expect(getWorker(W2)).toBeUndefined();

    // Ring buffer still holds data (it's caller-managed), but workers are gone
    expect(hashHistory.has(`${W1}/${ALGO}`)).toBe(true);
  });

  it('convergence message cites the correct worker count and run count', () => {
    spawnWorker(W1, MOCK_XES_W1);
    spawnWorker(W2, MOCK_XES_W2);

    const history = new Map<string, string[]>();
    const runs = 3;

    const round: WorkerResult[] = [
      makeWorkerResult(W1, ALGO, SHARED_DFG_RESULT),
      makeWorkerResult(W2, ALGO, SHARED_DFG_RESULT),
    ];

    // Three identical rounds for convergenceRuns=3
    checkSwarmConvergence(round, history, runs);
    checkSwarmConvergence(round, history, runs);
    const { converged, convergenceReason } = checkSwarmConvergence(round, history, runs);

    expect(converged).toBe(true);
    expect(convergenceReason).toMatch(/all 2 worker\(s\) stable for 3 consecutive rounds/);

    dissolveWorkers([W1, W2]);
  });
});
