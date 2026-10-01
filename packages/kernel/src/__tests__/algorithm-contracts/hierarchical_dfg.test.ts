import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/hierarchical_dfg.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: hierarchical_dfg', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
