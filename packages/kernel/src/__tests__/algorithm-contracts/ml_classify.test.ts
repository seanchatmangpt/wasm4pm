import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_classify.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_classify', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
