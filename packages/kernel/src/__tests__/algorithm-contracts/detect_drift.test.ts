import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/detect_drift.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: detect_drift', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
