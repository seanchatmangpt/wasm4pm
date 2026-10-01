import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/pnml_import.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: pnml_import', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
