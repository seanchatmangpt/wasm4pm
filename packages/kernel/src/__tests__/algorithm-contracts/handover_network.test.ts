import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/handover_network.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: handover_network', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
