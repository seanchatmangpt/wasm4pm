import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ml_anomaly.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ml_anomaly', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
