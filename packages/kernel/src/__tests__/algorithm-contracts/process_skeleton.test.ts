import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/process_skeleton.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: process_skeleton', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
