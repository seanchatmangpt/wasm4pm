import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/working_together_network.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: working_together_network', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
