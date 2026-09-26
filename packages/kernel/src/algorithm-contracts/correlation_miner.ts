import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'correlation_miner',
  pattern: 'ALGORITHM-025',
}) satisfies AlgorithmContract;

export default contract;
