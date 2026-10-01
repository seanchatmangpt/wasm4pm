import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/ocel_petri_net.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: ocel_petri_net', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
