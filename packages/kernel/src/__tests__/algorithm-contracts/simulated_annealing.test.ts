import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/simulated_annealing.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: simulated_annealing', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
