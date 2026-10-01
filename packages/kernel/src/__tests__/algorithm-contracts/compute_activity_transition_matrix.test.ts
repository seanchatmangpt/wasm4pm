import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/compute_activity_transition_matrix.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: compute_activity_transition_matrix', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
