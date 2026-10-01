import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/predict_outcome.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: predict_outcome', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
