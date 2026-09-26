import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/predict_next_activity.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: predict_next_activity', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
