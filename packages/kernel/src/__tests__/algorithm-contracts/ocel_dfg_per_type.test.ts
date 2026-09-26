import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_dfg_per_type.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_dfg_per_type', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
