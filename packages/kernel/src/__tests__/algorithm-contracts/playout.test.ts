import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/playout.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: playout', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
