import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/correlation_miner.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: correlation_miner', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
