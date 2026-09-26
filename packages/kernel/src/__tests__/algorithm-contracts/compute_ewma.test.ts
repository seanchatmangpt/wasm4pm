import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/compute_ewma.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: compute_ewma', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
