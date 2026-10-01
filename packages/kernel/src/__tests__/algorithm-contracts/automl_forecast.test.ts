import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/automl_forecast.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: automl_forecast', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
