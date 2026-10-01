import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/log_to_trie.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: log_to_trie', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
