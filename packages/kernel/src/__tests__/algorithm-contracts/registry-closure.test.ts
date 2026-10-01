import { describe, expect, it } from 'vitest';
import { algorithmContracts } from '../../algorithm-contracts/index.js';
import { getRegistry } from '../../registry.js';

describe('algorithm contract registry closure', () => {
  it('has exactly one contract for every registered algorithm', () => {
    const contractIds = [...algorithmContracts.map((contract) => contract.id)].sort();
    const registryIds = [...getRegistry().list().map((algorithm) => algorithm.id)].sort();
    expect(contractIds).toHaveLength(60);
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(contractIds).toEqual(registryIds);
  });
});
