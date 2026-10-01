import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_cluster.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_cluster', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
