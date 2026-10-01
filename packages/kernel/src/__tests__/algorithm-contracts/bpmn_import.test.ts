import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/bpmn_import.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: bpmn_import', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
