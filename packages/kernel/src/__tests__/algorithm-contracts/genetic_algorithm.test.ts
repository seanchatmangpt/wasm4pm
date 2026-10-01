import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/genetic_algorithm.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: genetic_algorithm', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
