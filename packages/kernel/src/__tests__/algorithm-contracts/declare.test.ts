import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/declare.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: declare', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
