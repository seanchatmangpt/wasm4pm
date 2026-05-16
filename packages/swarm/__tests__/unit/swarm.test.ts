/**
 * Unit tests for @wasm4pm/swarm
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import after resetting module state
let spawnWorker: typeof import('../../src/worker-registry.ts').spawnWorker;
let getWorker: typeof import('../../src/worker-registry.ts').getWorker;
let listWorkers: typeof import('../../src/worker-registry.ts').listWorkers;
let dissolveWorkers: typeof import('../../src/worker-registry.ts').dissolveWorkers;
let getSwarmId: typeof import('../../src/worker-registry.ts').getSwarmId;
let resetSwarm: typeof import('../../src/worker-registry.ts').resetSwarm;
let hashOutput: typeof import('../../src/convergence.ts').hashOutput;
let checkConvergence: typeof import('../../src/convergence.ts').checkConvergence;
let checkSwarmConvergence: typeof import('../../src/convergence.ts').checkSwarmConvergence;
let checkMlConvergence: typeof import('../../src/convergence.ts').checkMlConvergence;
let aggregate: typeof import('../../src/aggregation.ts').aggregate;
let sendDirective: typeof import('../../src/directive-bus.ts').sendDirective;

beforeEach(async () => {
  // Reset module state between tests
  const mod = await import('../../src/worker-registry.ts');
  mod.resetSwarm();

  const reg = await import('../../src/worker-registry.ts');
  spawnWorker = reg.spawnWorker;
  getWorker = reg.getWorker;
  listWorkers = reg.listWorkers;
  dissolveWorkers = reg.dissolveWorkers;
  getSwarmId = reg.getSwarmId;
  resetSwarm = reg.resetSwarm;

  const conv = await import('../../src/convergence.ts');
  hashOutput = conv.hashOutput;
  checkConvergence = conv.checkConvergence;
  checkSwarmConvergence = conv.checkSwarmConvergence;
  checkMlConvergence = conv.checkMlConvergence;

  const agg = await import('../../src/aggregation.ts');
  aggregate = agg.aggregate;

  const dir = await import('../../src/directive-bus.ts');
  sendDirective = dir.sendDirective;
});

// ─── Worker Registry ─────────────────────────────────────────────────────────

describe('Worker Registry', () => {
  it('should spawn a worker with correct initial state', () => {
    const worker = spawnWorker('w1', '<log>content</log>', 'test-worker');

    expect(worker.workerId).toBe('w1');
    expect(worker.label).toBe('test-worker');
    expect(worker.status).toBe('ready');
    expect(worker.xesContent).toBe('<log>content</log>');
    expect(worker.logHash).toHaveLength(64); // SHA-256 hex
    expect(worker.results.size).toBe(0);
    expect(worker.directives).toHaveLength(0);
    expect(worker.createdAt).toBeTruthy();
  });

  it('should default label to null', () => {
    const worker = spawnWorker('w2', '<log/>');
    expect(worker.label).toBeNull();
  });

  it('should retrieve worker by ID', () => {
    spawnWorker('w1', '<log/>');
    const w = getWorker('w1');
    expect(w).toBeDefined();
    expect(w!.workerId).toBe('w1');
  });

  it('should return undefined for non-existent worker', () => {
    expect(getWorker('nonexistent')).toBeUndefined();
  });

  it('should list all workers', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');
    spawnWorker('w3', '<log/>');

    const all = listWorkers();
    expect(all).toHaveLength(3);
    expect(all.map(w => w.workerId)).toEqual(['w1', 'w2', 'w3']);
  });

  it('should list workers filtered by status', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');

    // w1 is still 'ready', getWorker('w1') status is 'ready'
    const ready = listWorkers('ready');
    expect(ready).toHaveLength(2);
    const running = listWorkers('running');
    expect(running).toHaveLength(0);
  });

  it('should dissolve specific workers', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');
    spawnWorker('w3', '<log/>');

    const dissolved = dissolveWorkers(['w1', 'w3']);
    expect(dissolved).toEqual(['w1', 'w3']);
    expect(listWorkers()).toHaveLength(1);
    expect(getWorker('w1')).toBeUndefined();
  });

  it('should dissolve all workers when no IDs specified', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');

    const dissolved = dissolveWorkers();
    expect(dissolved).toHaveLength(2);
    expect(listWorkers()).toHaveLength(0);
  });

  it('should return empty array when dissolving non-existent workers', () => {
    const dissolved = dissolveWorkers(['ghost']);
    expect(dissolved).toEqual([]);
  });

  it('should generate a swarm ID', () => {
    const id = getSwarmId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should reset swarm state', () => {
    spawnWorker('w1', '<log/>');
    const oldId = getSwarmId();
    resetSwarm();

    expect(listWorkers()).toHaveLength(0);
    const newId = getSwarmId();
    expect(newId).not.toBe(oldId);
  });
});

// ─── Convergence ────────────────────────────────────────────────────────────────

describe('hashOutput', () => {
  it('should produce deterministic SHA-256 hash', () => {
    const hash1 = hashOutput({ a: 1, b: 2 });
    const hash2 = hashOutput({ a: 1, b: 2 });
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should sort object keys for deterministic hashing', () => {
    const hash1 = hashOutput({ b: 1, a: 2 });
    const hash2 = hashOutput({ a: 2, b: 1 });
    expect(hash1).toBe(hash2);
  });

  it('should handle nested objects', () => {
    const hash1 = hashOutput({ items: [1, 2, 3] });
    const hash2 = hashOutput({ items: [1, 2, 3] });
    expect(hash1).toBe(hash2);
  });

  it('should handle null', () => {
    const hash = hashOutput(null);
    expect(hash).toHaveLength(64);
  });
});

describe('checkConvergence', () => {
  const makeResults = (hash: string, count: number, algo = 'alpha') =>
    Array.from({ length: count }, (_, i) => ({
      workerId: `w${i}`,
      algorithmId: algo,
      resultHash: hash,
      result: {},
      runAt: new Date().toISOString(),
      durationMs: 100,
    }));

  it('should detect unanimous convergence', () => {
    const results = makeResults('hash_abc', 3);
    const report = checkConvergence(results, 'alpha');

    expect(report.converged).toBe(true);
    expect(report.consensusRatio).toBe(1);
    expect(report.dominantHash).toBe('hash_abc');
    expect(report.dissentingWorkers).toHaveLength(0);
    expect(report.totalChecked).toBe(3);
  });

  it('should detect partial convergence with threshold', () => {
    const results = [
      ...makeResults('hash_abc', 2),
      ...makeResults('hash_xyz', 1),
    ];
    // 2/3 ≈ 0.667 < 0.8, so NOT converged
    const report = checkConvergence(results, 'alpha', 0.8);

    expect(report.converged).toBe(false);
    expect(report.consensusRatio).toBeCloseTo(2 / 3);
    // When not converged, ALL workers are listed as dissenting
    expect(report.dissentingWorkers).toHaveLength(3);
  });

  it('should detect convergence with low threshold', () => {
    const results = [
      ...makeResults('hash_abc', 2),
      ...makeResults('hash_xyz', 1),
    ];
    // 2/3 ≈ 0.667 >= 0.6, so converged
    const report = checkConvergence(results, 'alpha', 0.6);

    expect(report.converged).toBe(true);
    expect(report.consensusRatio).toBeCloseTo(2 / 3);
    expect(report.dissentingWorkers).toEqual(['w0']); // makeResults('hash_xyz', 1) creates w0
  });

  it('should detect non-convergence below threshold', () => {
    const results = [
      ...makeResults('hash_abc', 1),
      ...makeResults('hash_xyz', 1),
      ...makeResults('hash_pqr', 1),
    ];
    const report = checkConvergence(results, 'alpha');

    expect(report.converged).toBe(false);
    expect(report.consensusRatio).toBeCloseTo(1 / 3);
  });

  it('should return not converged for empty results', () => {
    const report = checkConvergence([], 'alpha');
    expect(report.converged).toBe(false);
    expect(report.totalChecked).toBe(0);
  });

  it('should filter by worker IDs', () => {
    const results = [
      ...makeResults('hash_abc', 2),
      { workerId: 'w2', algorithmId: 'alpha', resultHash: 'hash_xyz', result: {}, runAt: new Date().toISOString(), durationMs: 100 },
    ];
    const report = checkConvergence(results, 'alpha', 1.0, ['w0', 'w1']);

    expect(report.totalChecked).toBe(2);
    expect(report.converged).toBe(true);
  });
});

describe('checkSwarmConvergence', () => {
  it('should detect stability across runs', () => {
    const results = [
      { workerId: 'w0', algorithmId: 'alpha', resultHash: 'h1', result: {}, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'alpha', resultHash: 'h1', result: {}, runAt: '', durationMs: 0 },
    ];
    const history = new Map<string, string[]>();

    // First run: not stable yet (need convergenceRuns=2)
    const report1 = checkSwarmConvergence(results, history, 2);
    expect(report1.converged).toBe(false);
    expect(report1.stableWorkers).toHaveLength(0);
    expect(report1.unstableWorkers).toHaveLength(2);

    // Second run: same hash -> stable
    const report2 = checkSwarmConvergence(results, history, 2);
    expect(report2.converged).toBe(true);
    expect(report2.stableWorkers).toHaveLength(2);
    expect(report2.unstableWorkers).toHaveLength(0);
  });

  it('should detect instability when hash changes', () => {
    const results1 = [
      { workerId: 'w0', algorithmId: 'alpha', resultHash: 'h1', result: {}, runAt: '', durationMs: 0 },
    ];
    const results2 = [
      { workerId: 'w0', algorithmId: 'alpha', resultHash: 'h2', result: {}, runAt: '', durationMs: 0 },
    ];
    const history = new Map<string, string[]>();

    checkSwarmConvergence(results1, history, 2);
    const report2 = checkSwarmConvergence(results2, history, 2);

    expect(report2.converged).toBe(false);
  });
});

describe('checkMlConvergence', () => {
  it('should converge with identical numeric results', () => {
    const mlResult = { predictions: [{ caseId: 'c1', predicted: 'yes', confidence: 0.95 }] };
    const results = [
      { workerId: 'w0', algorithmId: 'ml_classify', resultHash: 'h1', result: mlResult, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'ml_classify', resultHash: 'h1', result: mlResult, runAt: '', durationMs: 0 },
    ];
    const report = checkMlConvergence(results, 'ml_classify');
    expect(report.converged).toBe(true);
  });

  it('should converge with epsilon-tolerant numeric differences', () => {
    const results = [
      { workerId: 'w0', algorithmId: 'ml_regress', resultHash: 'h1', result: { coefficient: 0.950 }, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'ml_regress', resultHash: 'h2', result: { coefficient: 0.955 }, runAt: '', durationMs: 0 },
    ];
    const report = checkMlConvergence(results, 'ml_regress', 0.01);
    expect(report.converged).toBe(true); // within epsilon
  });

  it('should not converge when differences exceed epsilon', () => {
    const results = [
      { workerId: 'w0', algorithmId: 'ml_regress', resultHash: 'h1', result: { coefficient: 0.9 }, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'ml_regress', resultHash: 'h2', result: { coefficient: 0.5 }, runAt: '', durationMs: 0 },
    ];
    const report = checkMlConvergence(results, 'ml_regress', 0.01);
    expect(report.converged).toBe(false);
  });
});

// ─── iter-12 regression: NaN/Inf threshold guard (Rank-1 — mathematical invariant) ──────────

describe('checkConvergence — NaN/Inf threshold guard', () => {
  const makeResult = (hash: string, worker: string) => ({
    workerId: worker,
    algorithmId: 'dfg',
    resultHash: hash,
    result: {},
    runAt: '',
    durationMs: 0,
  });

  it('NaN threshold must not make swarm permanently non-convergent', () => {
    // Rank-1: consensusRatio >= NaN is always false in JS, meaning a NaN threshold
    // causes every convergence check to return converged=false regardless of agreement.
    // After the fix, NaN is clamped to 1.0, so three workers with identical hashes converge.
    const results = [makeResult('h1', 'w0'), makeResult('h1', 'w1'), makeResult('h1', 'w2')];
    const report = checkConvergence(results, 'dfg', NaN);
    // With three unanimous results and NaN clamped to 1.0, unanimity must still converge.
    expect(report.converged).toBe(true);
    expect(report.consensusRatio).toBe(1);
  });

  it('Infinity threshold must clamp to 1.0 and not prevent convergence of unanimous results', () => {
    const results = [makeResult('h1', 'w0'), makeResult('h1', 'w1')];
    const report = checkConvergence(results, 'dfg', Infinity);
    expect(report.converged).toBe(true);
    expect(report.consensusRatio).toBe(1);
  });

  it('negative threshold must clamp to 0 (every single result is convergent)', () => {
    const results = [makeResult('h1', 'w0'), makeResult('h2', 'w1')];
    const report = checkConvergence(results, 'dfg', -5);
    // consensusRatio = 0.5 >= 0 (clamped from -5) → converged
    expect(report.converged).toBe(true);
  });

  it('threshold > 1 must clamp to 1.0', () => {
    // Two workers agree — consensusRatio=1.0. threshold=2.0 clamped to 1.0 → still converges.
    const results = [makeResult('h1', 'w0'), makeResult('h1', 'w1')];
    const report = checkConvergence(results, 'dfg', 2.0);
    expect(report.converged).toBe(true);
  });
});

describe('checkMlConvergence — NaN/Inf epsilon and threshold guard', () => {
  const makeResult = (coeff: number, worker: string) => ({
    workerId: worker,
    algorithmId: 'ml_regress',
    resultHash: `h_${worker}`,
    result: { coefficient: coeff },
    runAt: '',
    durationMs: 0,
  });

  it('NaN epsilon must not make all comparisons trivially equal', () => {
    // Rank-1: with NaN epsilon, Math.abs(a-b) <= NaN is always false.
    // Every pair would be placed in its own group, so no convergence is ever detected.
    // After the fix, NaN epsilon falls back to 0.01.
    // Two results within 0.005 of each other must still converge.
    const results = [makeResult(0.950, 'w0'), makeResult(0.955, 'w1')];
    const report = checkMlConvergence(results, 'ml_regress', NaN);
    // 0.955 - 0.950 = 0.005 < fallback epsilon 0.01 → converged
    expect(report.converged).toBe(true);
  });

  it('NaN threshold with identical results must still converge', () => {
    const results = [makeResult(0.9, 'w0'), makeResult(0.9, 'w1')];
    const report = checkMlConvergence(results, 'ml_regress', 0.01, NaN);
    expect(report.converged).toBe(true);
  });
});

// ─── iter-12 regression: double-push race in checkSwarmConvergence (Rank-1) ─────────────────

describe('checkSwarmConvergence — single-push ring buffer invariant', () => {
  it('must not converge on the first episode when convergenceRuns=2 (double-push race)', () => {
    // Rank-1 invariant: with convergenceRuns=2 the ring buffer must hold at least 2
    // *distinct* episodes before a key is considered stable.
    // The double-push bug caused the same hash to appear twice in the buffer after a
    // single call, making hist = ['h1', 'h1'] → Set.size===1 → false stable read.
    const results = [
      { workerId: 'w0', algorithmId: 'dfg', resultHash: 'h1', result: {}, runAt: '', durationMs: 0 },
    ];
    const history = new Map<string, string[]>();

    const report = checkSwarmConvergence(results, history, 2);
    // One call = one episode. The ring buffer for 'w0/dfg' should be ['h1'] (length 1).
    // length 1 < convergenceRuns 2 → not stable yet.
    expect(report.converged).toBe(false);
    expect(report.stableWorkers).toHaveLength(0);

    // Verify the ring buffer has exactly ONE entry, not two.
    const buf = history.get('w0/dfg');
    expect(buf).toHaveLength(1);
    expect(buf![0]).toBe('h1');
  });

  it('ring buffer must hold at most convergenceRuns entries after many calls', () => {
    // Rank-1: ring buffer bounded by convergenceRuns (shift removes oldest).
    const results = [
      { workerId: 'w0', algorithmId: 'dfg', resultHash: 'h1', result: {}, runAt: '', durationMs: 0 },
    ];
    const history = new Map<string, string[]>();
    const runs = 10;
    for (let i = 0; i < runs; i++) {
      checkSwarmConvergence(results, history, 3);
    }
    const buf = history.get('w0/dfg');
    // Buffer must never grow beyond convergenceRuns=3
    expect(buf!.length).toBeLessThanOrEqual(3);
  });
});

// ─── iter-12 regression: dominantHash must reflect actual majority (Rank-2) ──────────────────

describe('checkConvergence — dominantHash integrity', () => {
  it('dominantHash must be the hash held by the plurality, not a positional artifact', () => {
    // Rank-2 domain contract: dominantHash is defined as "the hash with the highest
    // worker count". Taking workerResults[0].resultHash is a PR #66 doctrine defect —
    // it returns a plausible-looking value carrying no majority-agreement signal.
    const results = [
      { workerId: 'w0', algorithmId: 'dfg', resultHash: 'minority_hash', result: {}, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'dfg', resultHash: 'majority_hash', result: {}, runAt: '', durationMs: 0 },
      { workerId: 'w2', algorithmId: 'dfg', resultHash: 'majority_hash', result: {}, runAt: '', durationMs: 0 },
    ];
    // w0 appears first but holds minority_hash. Majority is majority_hash (2/3).
    const report = checkConvergence(results, 'dfg', 0.5);
    expect(report.dominantHash).toBe('majority_hash');
    expect(report.dominantHash).not.toBe('minority_hash');
  });

  it('dominantHash must be null for empty result set', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.dominantHash).toBeNull();
  });
});

// ─── Aggregation ────────────────────────────────────────────────────────────────

describe('aggregate', () => {
  const makeResults = (algo: string, hash: string, result: unknown) => [
    { workerId: 'w0', algorithmId: algo, resultHash: hash, result, runAt: '', durationMs: 0 },
    { workerId: 'w1', algorithmId: algo, resultHash: hash, result, runAt: '', durationMs: 0 },
  ];

  it('should return empty aggregate for no results', () => {
    const result = aggregate([], 'alpha');
    expect(result.workersIncluded).toBe(0);
    expect(result.aggregate).toBeNull();
    expect(result.consensusRatio).toBe(0);
  });

  it('should aggregate with union strategy (default)', () => {
    const dfg1 = { nodes: ['A', 'B'], edges: [{ source: 'A', target: 'B', weight: 1 }] };
    const dfg2 = { nodes: ['A', 'B', 'C'], edges: [{ source: 'A', target: 'B', weight: 1 }, { source: 'B', target: 'C', weight: 1 }] };
    const results = makeResults('alpha', 'h1', dfg1);
    results[1] = { ...results[1], resultHash: 'h2', result: dfg2 };

    const agg = aggregate(results, 'alpha', 'union');
    expect(agg.workersIncluded).toBe(2);
    expect((agg.aggregate as any).nodes).toContain('C'); // union adds C
  });

  it('should aggregate with majority_vote strategy', () => {
    const results = [
      ...makeResults('alpha', 'h1', { answer: 'X' }),
      ...makeResults('alpha', 'h1', { answer: 'X' }),
      makeResults('alpha', 'h2', { answer: 'Y' })[0],
    ];
    // 4 results with h1 (X), 1 with h2 (Y) → consensus = 4/5
    const agg = aggregate(results, 'alpha', 'majority_vote');
    expect(agg.consensusRatio).toBeCloseTo(4 / 5);
    expect((agg.aggregate as any).answer).toBe('X');
  });

  it('should aggregate ML classification with ml_ensemble', () => {
    const mlResult = { predictions: [{ caseId: 'c1', predicted: 'yes', confidence: 0.9 }] };
    const results = makeResults('ml_classify', 'h1', mlResult);
    const agg = aggregate(results, 'ml_classify', 'ml_ensemble');
    expect(agg.workersIncluded).toBe(2);
    expect((agg.aggregate as any).method).toBe('ensemble');
  });

  it('should aggregate ML forecast with ml_ensemble', () => {
    const fc1 = { forecast: [1.0, 2.0, 3.0], seriesLength: 3 };
    const fc2 = { forecast: [1.5, 2.5, 3.5], seriesLength: 3 };
    const results = [
      { workerId: 'w0', algorithmId: 'ml_forecast', resultHash: 'h1', result: fc1, runAt: '', durationMs: 0 },
      { workerId: 'w1', algorithmId: 'ml_forecast', resultHash: 'h2', result: fc2, runAt: '', durationMs: 0 },
    ];
    const agg = aggregate(results, 'ml_forecast', 'ml_ensemble');
    const forecast = (agg.aggregate as any).forecast;
    expect(forecast[0]).toBeCloseTo(1.25);
    expect(forecast[1]).toBeCloseTo(2.25);
  });

  it('should filter by worker IDs', () => {
    const results = makeResults('alpha', 'h1', {});
    const agg = aggregate(results, 'alpha', 'union', ['w0']);
    expect(agg.workersIncluded).toBe(1);
  });
});

// ─── Directive Bus ─────────────────────────────────────────────────────────────

describe('sendDirective', () => {
  it('should broadcast directive to all workers', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');

    const result = sendDirective('*', { type: 'run' });
    expect(result.deliveredTo).toEqual(['w1', 'w2']);
    expect(result.directiveId).toBeTruthy();
    expect(result.timestamp).toBeTruthy();

    // Check directives were enqueued
    expect(getWorker('w1')!.directives).toHaveLength(1);
    expect(getWorker('w2')!.directives).toHaveLength(1);
    expect(getWorker('w1')!.directives[0].type).toBe('run');
  });

  it('should target specific worker', () => {
    spawnWorker('w1', '<log/>');
    spawnWorker('w2', '<log/>');

    const result = sendDirective('w1', { type: 'stop' });
    expect(result.deliveredTo).toEqual(['w1']);
    expect(getWorker('w1')!.directives).toHaveLength(1);
    expect(getWorker('w2')!.directives).toHaveLength(0);
  });

  it('should still deliver directive for non-existent target (fire-and-forget)', () => {
    const result = sendDirective('ghost', { type: 'run' });
    // sendDirective enqueues without checking existence
    expect(result.deliveredTo).toEqual(['ghost']);
  });
});
