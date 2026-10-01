import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/agentic_pipeline.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: agentic_pipeline', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
