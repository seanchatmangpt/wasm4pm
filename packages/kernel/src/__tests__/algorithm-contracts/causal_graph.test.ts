import { describe, it } from 'vitest';
import contract from '../../algorithm-contracts/causal_graph.js';
import { expectAlgorithmContract } from './helper.js';

describe('algorithm contract: causal_graph', () => {
  it('resolves to complete deterministic registry metadata', () => {
    expectAlgorithmContract(contract);
  });
});
