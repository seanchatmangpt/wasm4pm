import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_oc_declare.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_oc_declare', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
