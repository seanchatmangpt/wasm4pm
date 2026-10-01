import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/hill_climbing.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: hill_climbing', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
