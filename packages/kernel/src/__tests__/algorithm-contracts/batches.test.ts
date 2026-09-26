import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/batches.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: batches', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
