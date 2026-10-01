import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/compute_trace_similarity_matrix.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: compute_trace_similarity_matrix', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
