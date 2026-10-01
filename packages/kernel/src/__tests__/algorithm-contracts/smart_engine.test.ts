import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/smart_engine.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: smart_engine', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
