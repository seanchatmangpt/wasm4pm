import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/heuristic_miner.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: heuristic_miner', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
