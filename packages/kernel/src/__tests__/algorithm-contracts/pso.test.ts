import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/pso.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: pso', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
