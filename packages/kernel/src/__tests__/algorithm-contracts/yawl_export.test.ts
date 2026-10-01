import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/yawl_export.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: yawl_export', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
