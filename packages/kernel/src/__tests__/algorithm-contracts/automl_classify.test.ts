import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/automl_classify.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: automl_classify', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
