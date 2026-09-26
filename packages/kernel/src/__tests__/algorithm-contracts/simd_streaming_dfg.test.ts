import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/simd_streaming_dfg.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: simd_streaming_dfg', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
