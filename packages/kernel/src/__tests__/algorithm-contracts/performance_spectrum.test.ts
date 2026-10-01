import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/performance_spectrum.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: performance_spectrum', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
