/**
 * error-recovery.test.ts
 *
 * Convergence error type invariants and worker registry error isolation contracts.
 * No LLM calls — tests construct error types and registry functions directly.
 *
 * Group 1 — Rank 1 (mathematical): Error type invariants
 * Group 2 — Rank 2 (domain contract): Error field semantics and propagation shape
 * Group 3 — Rank 2 (domain contract): Worker registry error isolation
 * Group 4 — Rank 3 (metamorphic): Error message quality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConvergenceMaxIterationsError, ConvergenceTimeoutError } from '../types.js';
import type { WorkerResult } from '../types.js';
import {
  spawnWorker,
  getWorker,
  setWorkerStatus,
  storeResult,
  resetSwarm,
} from '../worker-registry.js';

// ---------------------------------------------------------------------------
// Group 1 — Rank 1 (mathematical): Error type invariants
// ---------------------------------------------------------------------------

describe('Group 1 — Rank 1: ConvergenceMaxIterationsError type invariants', () => {
  it('has a positive integer maxIterations field', () => {
    const err = new ConvergenceMaxIterationsError(120, 100, 0.5);
    expect(Number.isInteger(err.maxIterations)).toBe(true);
    expect(err.maxIterations).toBeGreaterThan(0);
  });

  it('has a positive integer iterationsRun field', () => {
    const err = new ConvergenceMaxIterationsError(120, 100, 0.5);
    expect(Number.isInteger(err.iterationsRun)).toBe(true);
    expect(err.iterationsRun).toBeGreaterThan(0);
  });

  it('extends Error (instanceof Error)', () => {
    const err = new ConvergenceMaxIterationsError(10, 5, 0.0);
    expect(err instanceof Error).toBe(true);
  });

  it('is instanceof ConvergenceMaxIterationsError', () => {
    const err = new ConvergenceMaxIterationsError(10, 5, 0.0);
    expect(err instanceof ConvergenceMaxIterationsError).toBe(true);
  });

  it('name field is exactly "ConvergenceMaxIterationsError"', () => {
    const err = new ConvergenceMaxIterationsError(10, 5, 0.0);
    expect(err.name).toBe('ConvergenceMaxIterationsError');
  });

  it('serializes to JSON with distinguishing fields (iterationsRun, maxIterations)', () => {
    const err = new ConvergenceMaxIterationsError(55, 50, 0.75);
    const asJson = JSON.stringify({
      name: err.name,
      message: err.message,
      iterationsRun: err.iterationsRun,
      maxIterations: err.maxIterations,
      finalAgreementRate: err.finalAgreementRate,
    });
    const parsed = JSON.parse(asJson) as Record<string, unknown>;
    expect(parsed['name']).toBe('ConvergenceMaxIterationsError');
    expect(parsed['iterationsRun']).toBe(55);
    expect(parsed['maxIterations']).toBe(50);
    expect(parsed['finalAgreementRate']).toBe(0.75);
  });

  it('finalAgreementRate is in [0, 1]', () => {
    for (const rate of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      const err = new ConvergenceMaxIterationsError(10, 5, rate);
      expect(err.finalAgreementRate).toBeGreaterThanOrEqual(0);
      expect(err.finalAgreementRate).toBeLessThanOrEqual(1);
    }
  });
});

describe('Group 1 — Rank 1: ConvergenceTimeoutError type invariants', () => {
  it('has a positive integer maxEpisodes field', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.3);
    expect(Number.isInteger(err.maxEpisodes)).toBe(true);
    expect(err.maxEpisodes).toBeGreaterThan(0);
  });

  it('has a non-negative integer episodesRun field', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.3);
    expect(Number.isInteger(err.episodesRun)).toBe(true);
    expect(err.episodesRun).toBeGreaterThanOrEqual(0);
  });

  it('extends Error (instanceof Error)', () => {
    const err = new ConvergenceTimeoutError(3, 3, 0.1);
    expect(err instanceof Error).toBe(true);
  });

  it('is instanceof ConvergenceTimeoutError', () => {
    const err = new ConvergenceTimeoutError(3, 3, 0.1);
    expect(err instanceof ConvergenceTimeoutError).toBe(true);
  });

  it('name field is exactly "ConvergenceTimeoutError"', () => {
    const err = new ConvergenceTimeoutError(3, 3, 0.1);
    expect(err.name).toBe('ConvergenceTimeoutError');
  });

  it('serializes to JSON with distinguishing fields (episodesRun, maxEpisodes)', () => {
    const err = new ConvergenceTimeoutError(7, 10, 0.4);
    const asJson = JSON.stringify({
      name: err.name,
      message: err.message,
      episodesRun: err.episodesRun,
      maxEpisodes: err.maxEpisodes,
      finalAgreementRate: err.finalAgreementRate,
    });
    const parsed = JSON.parse(asJson) as Record<string, unknown>;
    expect(parsed['name']).toBe('ConvergenceTimeoutError');
    expect(parsed['episodesRun']).toBe(7);
    expect(parsed['maxEpisodes']).toBe(10);
    expect(parsed['finalAgreementRate']).toBe(0.4);
  });

  it('finalAgreementRate is in [0, 1]', () => {
    for (const rate of [0.0, 0.33, 0.67, 1.0]) {
      const err = new ConvergenceTimeoutError(5, 5, rate);
      expect(err.finalAgreementRate).toBeGreaterThanOrEqual(0);
      expect(err.finalAgreementRate).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Rank 2 (domain contract): Error field semantics
// ---------------------------------------------------------------------------

describe('Group 2 — Rank 2: ConvergenceMaxIterationsError field semantics', () => {
  it('iterationsRun exceeds maxIterations when the cap is blown', () => {
    // By domain contract: the error is thrown when iterationsRun > maxIterations
    const iterationsRun = 101;
    const maxIterations = 100;
    const err = new ConvergenceMaxIterationsError(iterationsRun, maxIterations, 0.5);
    expect(err.iterationsRun).toBeGreaterThan(err.maxIterations);
  });

  it('preserves exact values passed to constructor (no rounding)', () => {
    const err = new ConvergenceMaxIterationsError(999, 500, 0.123456789);
    expect(err.iterationsRun).toBe(999);
    expect(err.maxIterations).toBe(500);
    expect(err.finalAgreementRate).toBe(0.123456789);
  });

  it('is catchable by generic Error catch block', () => {
    let caught: Error | null = null;
    try {
      throw new ConvergenceMaxIterationsError(200, 100, 0.0);
    } catch (e) {
      if (e instanceof Error) caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught?.name).toBe('ConvergenceMaxIterationsError');
  });

  it('two different ConvergenceMaxIterationsError instances have independent field values', () => {
    const err1 = new ConvergenceMaxIterationsError(10, 5, 0.2);
    const err2 = new ConvergenceMaxIterationsError(30, 20, 0.8);
    expect(err1.iterationsRun).not.toBe(err2.iterationsRun);
    expect(err1.maxIterations).not.toBe(err2.maxIterations);
    expect(err1.finalAgreementRate).not.toBe(err2.finalAgreementRate);
  });
});

describe('Group 2 — Rank 2: ConvergenceTimeoutError field semantics', () => {
  it('episodesRun equals maxEpisodes at timeout (all episodes exhausted)', () => {
    // By domain contract: timeout fires when all episodes are exhausted
    const err = new ConvergenceTimeoutError(5, 5, 0.3);
    expect(err.episodesRun).toBe(err.maxEpisodes);
  });

  it('preserves exact values passed to constructor (no rounding)', () => {
    const err = new ConvergenceTimeoutError(42, 50, 0.987654321);
    expect(err.episodesRun).toBe(42);
    expect(err.maxEpisodes).toBe(50);
    expect(err.finalAgreementRate).toBe(0.987654321);
  });

  it('is catchable by generic Error catch block', () => {
    let caught: Error | null = null;
    try {
      throw new ConvergenceTimeoutError(3, 3, 0.0);
    } catch (e) {
      if (e instanceof Error) caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught?.name).toBe('ConvergenceTimeoutError');
  });

  it('two different ConvergenceTimeoutError instances have independent field values', () => {
    const err1 = new ConvergenceTimeoutError(1, 1, 0.1);
    const err2 = new ConvergenceTimeoutError(10, 10, 0.9);
    expect(err1.episodesRun).not.toBe(err2.episodesRun);
    expect(err1.finalAgreementRate).not.toBe(err2.finalAgreementRate);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Rank 2 (domain contract): Worker registry error isolation
// ---------------------------------------------------------------------------

const XES_STUB =
  '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';

function makeWorkerResult(workerId: string, overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    workerId,
    algorithmId: 'dfg',
    resultHash: 'abc123',
    result: { edges: [] },
    runAt: new Date().toISOString(),
    durationMs: 10,
    ...overrides,
  };
}

describe('Group 3 — Rank 2: worker registry error isolation', () => {
  beforeEach(() => {
    resetSwarm();
  });

  afterEach(() => {
    resetSwarm();
  });

  it('getWorker returns undefined for an unknown worker ID (no exception)', () => {
    expect(() => {
      const result = getWorker('non-existent-worker-id-xyz');
      // Should be undefined, not throw
      expect(result).toBeUndefined();
    }).not.toThrow();
  });

  it('setWorkerStatus does not throw for a valid registered worker ID', () => {
    spawnWorker('w-alpha', XES_STUB);
    expect(() => {
      setWorkerStatus('w-alpha', 'error');
    }).not.toThrow();
  });

  it('setWorkerStatus does not throw for an unknown worker ID (silently skips)', () => {
    // The implementation does registry.get(workerId) and only mutates if found
    expect(() => {
      setWorkerStatus('ghost-worker', 'error');
    }).not.toThrow();
  });

  it('setWorkerStatus("error") is reflected in subsequent getWorker call', () => {
    spawnWorker('w-beta', XES_STUB);
    setWorkerStatus('w-beta', 'error');
    const worker = getWorker('w-beta');
    expect(worker?.status).toBe('error');
  });

  it('failed worker status does not corrupt other workers in the registry', () => {
    spawnWorker('w-healthy', XES_STUB);
    spawnWorker('w-failing', XES_STUB);

    setWorkerStatus('w-failing', 'error');

    // Healthy worker retains its status
    const healthy = getWorker('w-healthy');
    expect(healthy?.status).toBe('ready');

    // Failing worker has its status updated
    const failing = getWorker('w-failing');
    expect(failing?.status).toBe('error');
  });

  it('storeResult with failed:true is stored without corrupting sibling workers', () => {
    spawnWorker('w-good', XES_STUB);
    spawnWorker('w-bad', XES_STUB);

    const goodResult = makeWorkerResult('w-good', {
      resultHash: 'deadbeef',
      result: { nodes: ['A', 'B'] },
    });
    const badResult = makeWorkerResult('w-bad', {
      resultHash: 'FAILED',
      result: null,
      error: 'Worker crashed',
      failed: true,
    });

    storeResult('w-good', goodResult);
    storeResult('w-bad', badResult);

    const good = getWorker('w-good');
    const bad = getWorker('w-bad');

    // Good worker result preserved correctly
    expect(good?.results.get('dfg')?.resultHash).toBe('deadbeef');
    expect(good?.results.get('dfg')?.failed).toBeUndefined();

    // Bad worker result stored with failure marker
    expect(bad?.results.get('dfg')?.failed).toBe(true);
    expect(bad?.results.get('dfg')?.error).toBe('Worker crashed');

    // Cross-contamination check: good worker doesn't see bad result
    expect(good?.results.get('dfg')?.error).toBeUndefined();
  });

  it('storeResult for non-existent worker ID does not throw', () => {
    const result = makeWorkerResult('ghost-worker');
    expect(() => {
      storeResult('ghost-worker', result);
    }).not.toThrow();
  });

  it('multiple storeResult calls for same worker/algorithm keep only the latest result', () => {
    spawnWorker('w-repeat', XES_STUB);

    const first = makeWorkerResult('w-repeat', { resultHash: 'first-hash' });
    const second = makeWorkerResult('w-repeat', { resultHash: 'second-hash' });

    storeResult('w-repeat', first);
    storeResult('w-repeat', second);

    const worker = getWorker('w-repeat');
    // Map keyed on algorithmId — last write wins
    expect(worker?.results.get('dfg')?.resultHash).toBe('second-hash');
  });

  it('different algorithm results on the same worker are stored independently', () => {
    spawnWorker('w-multi', XES_STUB);

    const dfgResult = makeWorkerResult('w-multi', {
      algorithmId: 'dfg',
      resultHash: 'dfg-hash',
    });
    const alphaResult = makeWorkerResult('w-multi', {
      algorithmId: 'alpha_plus_plus',
      resultHash: 'alpha-hash',
    });

    storeResult('w-multi', dfgResult);
    storeResult('w-multi', alphaResult);

    const worker = getWorker('w-multi');
    expect(worker?.results.size).toBe(2);
    expect(worker?.results.get('dfg')?.resultHash).toBe('dfg-hash');
    expect(worker?.results.get('alpha_plus_plus')?.resultHash).toBe('alpha-hash');
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Rank 3 (metamorphic): Error message quality
// ---------------------------------------------------------------------------

describe('Group 4 — Rank 3: error message quality', () => {
  it('ConvergenceMaxIterationsError.message mentions "iterations" or "max"', () => {
    const err = new ConvergenceMaxIterationsError(110, 100, 0.6);
    const msg = err.message.toLowerCase();
    expect(msg.includes('iteration') || msg.includes('max')).toBe(true);
  });

  it('ConvergenceTimeoutError.message mentions "timeout" or "time"', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.4);
    const msg = err.message.toLowerCase();
    expect(msg.includes('timeout') || msg.includes('time')).toBe(true);
  });

  it('ConvergenceMaxIterationsError.message is a non-empty string', () => {
    const err = new ConvergenceMaxIterationsError(10, 5, 0.3);
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('ConvergenceTimeoutError.message is a non-empty string', () => {
    const err = new ConvergenceTimeoutError(3, 3, 0.2);
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('ConvergenceMaxIterationsError.message contains the actual iteration count', () => {
    const err = new ConvergenceMaxIterationsError(77, 50, 0.0);
    expect(err.message).toContain('77');
  });

  it('ConvergenceTimeoutError.message contains the maxEpisodes count', () => {
    const err = new ConvergenceTimeoutError(8, 8, 0.0);
    expect(err.message).toContain('8');
  });

  it('error messages differ between two different ConvergenceMaxIterationsError instances', () => {
    const err1 = new ConvergenceMaxIterationsError(10, 5, 0.1);
    const err2 = new ConvergenceMaxIterationsError(200, 100, 0.9);
    expect(err1.message).not.toBe(err2.message);
  });

  it('error messages differ between two different ConvergenceTimeoutError instances', () => {
    const err1 = new ConvergenceTimeoutError(1, 1, 0.1);
    const err2 = new ConvergenceTimeoutError(20, 20, 0.9);
    expect(err1.message).not.toBe(err2.message);
  });

  it('ConvergenceMaxIterationsError and ConvergenceTimeoutError messages are distinct', () => {
    const maxIterErr = new ConvergenceMaxIterationsError(10, 5, 0.5);
    const timeoutErr = new ConvergenceTimeoutError(5, 5, 0.5);
    // Different error types must produce distinct messages
    expect(maxIterErr.message).not.toBe(timeoutErr.message);
  });
});
