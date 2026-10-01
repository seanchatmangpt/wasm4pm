import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_regress.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_regress', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
