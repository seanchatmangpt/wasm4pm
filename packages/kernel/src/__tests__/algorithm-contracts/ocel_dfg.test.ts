import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_dfg.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_dfg', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
