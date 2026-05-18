import { describe, it, expect, beforeEach } from 'vitest';
import { checkConvergence, hashOutput } from '../convergence';
import type { SwarmConvergenceReport, WorkerResult } from '../types';

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
      { workerId: 'w1', algorithmId: 'dfg', resultHash: sharedHash, result: {}, runAt: new Date().toISOString(), durationMs: 100 },
      { workerId: 'w2', algorithmId: 'dfg', resultHash: sharedHash, result: {}, runAt: new Date().toISOString(), durationMs: 100 },
      { workerId: 'w3', algorithmId: 'dfg', resultHash: 'different', result: {}, runAt: new Date().toISOString(), durationMs: 100 },
      { workerId: 'w4', algorithmId: 'dfg', resultHash: sharedHash, result: {}, runAt: new Date().toISOString(), durationMs: 100 },
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
