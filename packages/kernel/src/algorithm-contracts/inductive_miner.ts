import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'inductive_miner',
  pattern: 'ALGORITHM-010',
}) satisfies AlgorithmContract;

export default contract;
