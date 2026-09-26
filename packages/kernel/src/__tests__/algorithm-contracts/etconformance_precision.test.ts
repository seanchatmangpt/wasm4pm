import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/etconformance_precision.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: etconformance_precision', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
