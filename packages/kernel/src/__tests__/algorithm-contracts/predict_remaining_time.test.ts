import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/predict_remaining_time.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: predict_remaining_time', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
