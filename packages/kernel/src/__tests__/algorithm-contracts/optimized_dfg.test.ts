import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/optimized_dfg.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: optimized_dfg', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
