import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'analyze_variant_complexity',
  pattern: 'ALGORITHM-020',
}) satisfies AlgorithmContract;

export default contract;
