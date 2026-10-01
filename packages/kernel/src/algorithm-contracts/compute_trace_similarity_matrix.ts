import type { AlgorithmContract } from './contract.js';

export const contract = Object.freeze({
  id: 'compute_trace_similarity_matrix',
  pattern: 'ALGORITHM-024',
}) satisfies AlgorithmContract;

export default contract;
