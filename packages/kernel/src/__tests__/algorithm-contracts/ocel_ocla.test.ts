import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_ocla.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_ocla', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
