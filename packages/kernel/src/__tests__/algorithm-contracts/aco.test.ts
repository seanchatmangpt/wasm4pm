import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/aco.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: aco', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
