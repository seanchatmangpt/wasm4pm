import { describe, expect, it } from 'vitest';
import { resolveAlgorithmId } from '../templates/algorithm-registry.js';

const REGISTRY_IDS = [
  'dfg',
  'heuristic_miner',
  'inductive_miner',
  'alpha_plus_plus',
  'genetic_algorithm',
  'simd_streaming_dfg',
] as const;

describe('resolveAlgorithmId', () => {
  it('resolves exact registry IDs', () => {
    expect(resolveAlgorithmId('dfg', REGISTRY_IDS)).toBe('dfg');
    expect(resolveAlgorithmId('heuristic_miner', REGISTRY_IDS)).toBe('heuristic_miner');
  });

  it('resolves CLI aliases to registry IDs', () => {
    expect(resolveAlgorithmId('heuristic', REGISTRY_IDS)).toBe('heuristic_miner');
    expect(resolveAlgorithmId('inductive', REGISTRY_IDS)).toBe('inductive_miner');
    expect(resolveAlgorithmId('genetic', REGISTRY_IDS)).toBe('genetic_algorithm');
    expect(resolveAlgorithmId('simd-dfg', REGISTRY_IDS)).toBe('simd_streaming_dfg');
  });

  it('resolves normalized registry ID variants', () => {
    expect(resolveAlgorithmId('alpha-plus-plus', REGISTRY_IDS)).toBe('alpha_plus_plus');
    expect(resolveAlgorithmId('alpha_plus_plus', REGISTRY_IDS)).toBe('alpha_plus_plus');
  });

  it('returns undefined for unknown algorithms', () => {
    expect(resolveAlgorithmId('genetc', REGISTRY_IDS)).toBeUndefined();
    expect(resolveAlgorithmId('', REGISTRY_IDS)).toBeUndefined();
    expect(resolveAlgorithmId('   ', REGISTRY_IDS)).toBeUndefined();
  });

  it('does not resolve IDs absent from the provided registry list', () => {
    expect(resolveAlgorithmId('heuristic', ['dfg'])).toBeUndefined();
  });
});
