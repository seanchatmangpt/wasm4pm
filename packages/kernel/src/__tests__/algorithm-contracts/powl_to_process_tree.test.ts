import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/powl_to_process_tree.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: powl_to_process_tree', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
