import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/analyze_variant_complexity.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: analyze_variant_complexity', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
