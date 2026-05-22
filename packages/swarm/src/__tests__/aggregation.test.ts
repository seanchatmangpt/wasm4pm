import { describe, it, expect } from 'vitest';
import { aggregate } from '../aggregation.js';
import type { WorkerResult } from '../types.js';

function makeResult(workerId: string, algorithmId: string, data: unknown, hash?: string): WorkerResult {
  return {
    workerId,
    algorithmId,
    result: data,
    resultHash: hash ?? String(JSON.stringify(data)).length.toString(),
    runAt: new Date().toISOString(), durationMs: 100,
    success: true,
  } as WorkerResult;
}

describe('aggregation — result merging', () => {
  it('should aggregate results from multiple workers', () => {
    const r1 = makeResult('w1', 'dfg', { nodes: 3 }, 'hash-a');
    const r2 = makeResult('w2', 'dfg', { nodes: 3 }, 'hash-a');
    const r3 = makeResult('w3', 'dfg', { nodes: 4 }, 'hash-b');

    const result = aggregate([r1, r2, r3], 'dfg', 'majority_vote');
    expect(result.algorithm).toBe('dfg');
    expect(result.workersIncluded).toBe(3);
    expect(result.consensusRatio).toBeCloseTo(2 / 3, 5);
    expect(result.aggregateHash).toBeDefined();
  });

  it('should handle partial failures gracefully', () => {
    const result = aggregate([], 'dfg', 'union');
    expect(result.workersIncluded).toBe(0);
    expect(result.consensusRatio).toBe(0);
    expect(result.aggregate).toBeNull();
  });
});
