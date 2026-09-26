import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ilp.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ilp', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
