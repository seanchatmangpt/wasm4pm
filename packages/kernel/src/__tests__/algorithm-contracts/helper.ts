import { expect } from 'vitest';
import { getRegistry } from '../../registry.js';
import type { AlgorithmContract } from '../../algorithm-contracts/contract.js';
import { validateAlgorithmMetadata } from '../../algorithm-contracts/contract.js';

export function expectAlgorithmContract(contract: AlgorithmContract): void {
  const registry = getRegistry();
  const first = registry.get(contract.id);
  const second = registry.get(contract.id);
  expect(validateAlgorithmMetadata(contract, first)).toEqual([]);
  expect(first).toBe(second);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
}
