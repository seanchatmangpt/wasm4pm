import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/analyze_process_speedup.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: analyze_process_speedup', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
