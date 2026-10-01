import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/generalization.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: generalization', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
