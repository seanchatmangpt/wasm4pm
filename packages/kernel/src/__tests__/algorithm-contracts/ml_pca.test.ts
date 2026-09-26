import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_pca.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_pca', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
