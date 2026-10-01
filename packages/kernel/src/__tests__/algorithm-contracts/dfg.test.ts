import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/dfg.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: dfg', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
