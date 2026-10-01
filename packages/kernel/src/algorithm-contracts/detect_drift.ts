import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'detect_drift',
  pattern: 'ALGORITHM-046',
}) satisfies AlgorithmContract;

export default contract;
