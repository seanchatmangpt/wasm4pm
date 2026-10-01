import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/complexity_metrics.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: complexity_metrics', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
