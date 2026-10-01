import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/monte_carlo_simulation.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: monte_carlo_simulation', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
