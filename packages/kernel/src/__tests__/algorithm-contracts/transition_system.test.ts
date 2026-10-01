import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/transition_system.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: transition_system', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
