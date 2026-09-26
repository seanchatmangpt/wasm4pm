import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_encode.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_encode', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
