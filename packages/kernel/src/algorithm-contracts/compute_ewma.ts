import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'compute_ewma',
  pattern: 'ALGORITHM-045',
}) satisfies AlgorithmContract;

export default contract;
