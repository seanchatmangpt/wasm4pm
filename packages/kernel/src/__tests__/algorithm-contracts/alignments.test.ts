import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/alignments.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: alignments', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
