import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'compute_activity_transition_matrix',
  pattern: 'ALGORITHM-023',
}) satisfies AlgorithmContract;

export default contract;
