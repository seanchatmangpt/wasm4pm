import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/streaming_log.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: streaming_log', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
