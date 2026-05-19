import { describe, it, expect, beforeEach } from 'vitest';
import { checkConvergence, checkSwarmConvergence, hashOutput } from '../convergence.js';
import type { SwarmConvergenceReport, WorkerResult } from '../types.js';

describe('ConvergenceDetector — consensus detection', () => {
  it('should hash output deterministically', () => {
    const output1 = { result: 'test', version: 1 };
    const output2 = { result: 'test', version: 1 };

    const hash1 = hashOutput(output1);
    const hash2 = hashOutput(output2);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('should distinguish different outputs by hash', () => {
    const output1 = { result: 'test1', version: 1 };
    const output2 = { result: 'test2', version: 1 };

    const hash1 = hashOutput(output1);
    const hash2 = hashOutput(output2);

    expect(hash1).not.toBe(hash2);
  });

  it('should detect consensus when all workers agree', () => {
    // Mock worker results with identical hashes
    const sharedHash = 'abc123def456';
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: { edges: 10 },
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: { edges: 10 },
        runAt: new Date().toISOString(),
        durationMs: 95,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: { edges: 10 },
        runAt: new Date().toISOString(),
        durationMs: 105,
      },
    ];

    const report = checkConvergence(results, 'dfg');
    expect(report).toHaveProperty('converged');
    expect(report).toHaveProperty('consensusRatio');
    expect(report.consensusRatio).toBeGreaterThan(0);
  });

  it('should detect dissent when workers disagree', () => {
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'hash_a',
        result: { edges: 10 },
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'hash_b',
        result: { edges: 15 },
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    const report = checkConvergence(results, 'dfg');
    expect(report).toHaveProperty('dissentingWorkers');
    expect(Array.isArray(report.dissentingWorkers)).toBe(true);
  });

  it('should calculate consensus ratio correctly', () => {
    const sharedHash = 'abc123';
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: 'different',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w4',
        algorithmId: 'dfg',
        resultHash: sharedHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    const report = checkConvergence(results, 'dfg');
    expect(report.consensusRatio).toBe(0.75); // 3 out of 4 agree
  });

  it('should track total checked workers', () => {
    const results: WorkerResult[] = Array.from({ length: 5 }, (_, i) => ({
      workerId: `w${i}`,
      algorithmId: 'test_algo',
      resultHash: `hash_${i}`,
      result: {},
      runAt: new Date().toISOString(),
      durationMs: 100,
    }));

    const report = checkConvergence(results, 'test_algo');
    expect(report.totalChecked).toBe(5);
  });
});

describe('convergenceReason — human-readable explanations', () => {
  it('returns reason explaining no-results case', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.convergenceReason).toMatch(/no workers produced results for algorithm dfg/);
  });

  it('returns unanimous reason when all workers agree', () => {
    const hash = 'aaa111';
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: hash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: hash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: hash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(true);
    expect(report.convergenceReason).toMatch(/unanimous/);
    expect(report.convergenceReason).toMatch(/3\/3/);
  });

  it('returns threshold-not-met reason when quorum fails', () => {
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: 'bbb',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w4',
        algorithmId: 'dfg',
        resultHash: 'ccc',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    // threshold=1.0 (default): 2/4 do not meet unanimous requirement
    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(false);
    expect(report.convergenceReason).toMatch(/not met/);
    expect(report.convergenceReason).toMatch(/2\/4/);
  });

  it('returns threshold-met reason when quorum passes at sub-unanimous threshold', () => {
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w4',
        algorithmId: 'dfg',
        resultHash: 'bbb',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    // threshold=0.75: 3/4 meets it
    const report = checkConvergence(results, 'dfg', 0.75);
    expect(report.converged).toBe(true);
    expect(report.convergenceReason).toMatch(/threshold 0\.75 met/);
    expect(report.convergenceReason).not.toMatch(/unanimous/);
  });
});

describe('checkSwarmConvergence — convergenceReason', () => {
  it('returns reason when no workers ran', () => {
    const history = new Map<string, string[]>();
    const { convergenceReason } = checkSwarmConvergence([], history, 2);
    expect(convergenceReason).toMatch(/no workers ran/);
  });

  it('returns stable-all reason when all workers converge', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'hash1',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'hash2',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    // Prime history with identical hashes for convergenceRuns=2
    checkSwarmConvergence(results, history, 2);
    const { converged, convergenceReason } = checkSwarmConvergence(results, history, 2);
    expect(converged).toBe(true);
    expect(convergenceReason).toMatch(/all 2 worker\(s\) stable/);
  });

  it('returns partial-stable reason when some workers are unstable', () => {
    const history = new Map<string, string[]>();
    const r1: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'bbb',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    const r2: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: 'aaa',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: 'ccc',
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 10,
      },
    ];
    checkSwarmConvergence(r1, history, 2);
    const { converged, convergenceReason } = checkSwarmConvergence(r2, history, 2);
    expect(converged).toBe(false);
    expect(convergenceReason).toMatch(/1\/2 stable after 2 rounds/);
  });
});
