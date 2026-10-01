import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_forecast.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_forecast', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
