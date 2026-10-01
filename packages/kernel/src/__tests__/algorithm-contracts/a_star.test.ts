import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/a_star.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: a_star', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
