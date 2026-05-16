/**
 * registry.test.ts
 * Tests for AlgorithmRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlgorithmRegistry,
  getRegistry,
  ExecutionProfile,
  ComplexityClass,
} from '../src/registry';

describe('AlgorithmRegistry', () => {
  let registry: AlgorithmRegistry;

  beforeEach(() => {
    registry = new AlgorithmRegistry();
  });

  describe('Registration', () => {
    it('has all expected algorithms registered with correct metadata', () => {
      const algorithms = registry.list();
      expect(algorithms.length).toBeGreaterThanOrEqual(15);

      const dfg = registry.get('dfg');
      expect(dfg).toBeDefined();
      expect(dfg?.name).toBe('DFG (Directly Follows Graph)');

      const alpha = registry.get('alpha_plus_plus');
      expect(alpha).toBeDefined();
      expect(alpha?.name).toContain('Alpha');

      const heuristic = registry.get('heuristic_miner');
      expect(heuristic).toBeDefined();
      expect(heuristic?.outputType).toBe('dfg');

      const inductive = registry.get('inductive_miner');
      expect(inductive).toBeDefined();
      expect(inductive?.outputType).toBe('tree');

      const genetic = registry.get('genetic_algorithm');
      expect(genetic).toBeDefined();
      expect(genetic?.qualityTier).toBeGreaterThan(70);

      expect(registry.get('pso')?.name).toContain('Particle Swarm');
      expect(registry.get('a_star')?.name).toContain('A*');
      expect(registry.get('hill_climbing')?.speedTier).toBeLessThan(50);
      expect(registry.get('ilp')?.complexity).toBe('NP-Hard');
      expect(registry.get('aco')?.name).toContain('Ant Colony');
      expect(registry.get('simulated_annealing')?.name).toContain('Simulated Annealing');
      expect(registry.get('declare')?.outputType).toBe('declare');
      expect(registry.get('optimized_dfg')?.outputType).toBe('dfg');
    });
  });

  describe('Algorithm Metadata', () => {
    it('has valid metadata for all algorithms, activity_key for log-processing, and DFG is fastest', () => {
      const algorithms = registry.list();

      for (const algo of algorithms) {
        expect(algo.id).toBeDefined();
        expect(algo.name).toBeDefined();
        expect(algo.description).toBeDefined();
        expect(algo.outputType).toBeDefined();
        expect(algo.complexity).toBeDefined();
        expect(algo.speedTier).toBeGreaterThanOrEqual(0);
        expect(algo.speedTier).toBeLessThanOrEqual(100);
        expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
        expect(algo.qualityTier).toBeLessThanOrEqual(100);
        expect(Array.isArray(algo.parameters)).toBe(true);
        expect(Array.isArray(algo.supportedProfiles)).toBe(true);
        expect(algo.estimatedDurationMs).toBeGreaterThan(0);
        expect(algo.estimatedMemoryMB).toBeGreaterThan(0);
      }

      const logProcessingIds = [
        'dfg', 'process_skeleton', 'alpha_plus_plus', 'heuristic_miner',
        'inductive_miner', 'genetic_algorithm', 'pso', 'a_star',
        'hill_climbing', 'ilp', 'aco', 'simulated_annealing', 'declare',
        'optimized_dfg', 'simd_streaming_dfg', 'hierarchical_dfg',
        'streaming_log', 'smart_engine', 'transition_system', 'log_to_trie',
        'causal_graph', 'performance_spectrum', 'batches', 'correlation_miner',
        'ml_classify', 'ml_cluster', 'ml_forecast', 'ml_anomaly',
        'ml_regress', 'ml_pca',
      ];

      for (const algo of algorithms) {
        if (!logProcessingIds.includes(algo.id)) continue;
        const activityKeyParam = algo.parameters.find((p) => p.name === 'activity_key');
        expect(activityKeyParam, `${algo.id} should have activity_key`).toBeDefined();
        expect(activityKeyParam?.type).toBe('string');
        expect(activityKeyParam?.required).toBe(true);
        expect(activityKeyParam?.default).toBe('concept:name');
      }

      const dfg = registry.get('dfg')!;
      const excludedIds = new Set([
        'dfg', 'process_skeleton', 'simd_streaming_dfg', 'streaming_dfg',
        'streaming_conformance', 'optimized_dfg', 'smart_engine',
      ]);
      for (const algo of algorithms) {
        if (!excludedIds.has(algo.id)) {
          expect(algo.speedTier).toBeGreaterThanOrEqual(dfg.speedTier);
        }
      }

      expect(registry.get('ilp')!.qualityTier).toBeGreaterThan(70);
      expect(registry.get('optimized_dfg')!.qualityTier).toBeGreaterThan(70);

      const complexities = new Set<ComplexityClass>();
      for (const algo of registry.list()) {
        complexities.add(algo.complexity);
        expect(['O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(n * d²)', 'Exponential', 'NP-Hard']).toContain(algo.complexity);
      }
      expect(complexities.size).toBeGreaterThan(1);
    });
  });

  describe('Profiles', () => {
    it('all profiles have algorithms, fast has fastest, quality has highest quality', () => {
      const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];

      for (const profile of profiles) {
        expect(registry.getForProfile(profile).length).toBeGreaterThan(0);
      }

      const fast = registry.getForProfile('fast');
      expect(fast.some((a) => a.id === 'dfg')).toBe(true);

      const balanced = registry.getForProfile('balanced');
      expect(balanced.some((a) => a.id === 'heuristic_miner')).toBe(true);
      expect(balanced.some((a) => a.id === 'inductive_miner')).toBe(true);

      const quality = registry.getForProfile('quality');
      expect(quality.some((a) => a.id === 'genetic_algorithm')).toBe(true);
      expect(quality.some((a) => a.id === 'ilp')).toBe(true);

      const stream = registry.getForProfile('stream');
      expect(stream.some((a) => a.id === 'dfg')).toBe(true);

      const fastAvgSpeed = fast.reduce((sum, a) => sum + a.speedTier, 0) / fast.length;
      const balancedAvgSpeed = balanced.reduce((sum, a) => sum + a.speedTier, 0) / balanced.length;
      expect(fastAvgSpeed).toBeLessThan(balancedAvgSpeed);

      const maxQuality = Math.max(...quality.map((a) => a.qualityTier));
      expect(maxQuality).toBeGreaterThanOrEqual(85);
      expect(quality.some((a) => a.qualityTier >= 70)).toBe(true);
    });
  });

  describe('Suggestions', () => {
    it('suggests appropriate algorithms for each profile and large logs', () => {
      const fastSuggestion = registry.suggestForProfile('fast', 1000);
      expect(fastSuggestion).toBeDefined();
      expect(fastSuggestion?.supportedProfiles).toContain('fast');

      const balancedSuggestion = registry.suggestForProfile('balanced', 10000);
      expect(balancedSuggestion).toBeDefined();
      expect(balancedSuggestion?.supportedProfiles).toContain('balanced');

      const qualitySuggestion = registry.suggestForProfile('quality', 5000);
      expect(qualitySuggestion).toBeDefined();
      expect(qualitySuggestion?.supportedProfiles).toContain('quality');
      if (qualitySuggestion) {
        expect(qualitySuggestion.qualityTier).toBeGreaterThanOrEqual(50);
      }

      const largeSuggestion = registry.suggestForProfile('fast', 500000);
      expect(largeSuggestion).toBeDefined();
      if (largeSuggestion) {
        expect(largeSuggestion.scalesWell).toBe(true);
      }
    });
  });

  describe('Robustness', () => {
    it('marks noise-robust and scalable algorithms, DFG/Heuristic are robust, ILP is not', () => {
      expect(registry.list().filter((a) => a.robustToNoise).length).toBeGreaterThan(5);
      expect(registry.list().filter((a) => a.scalesWell).length).toBeGreaterThan(3);
      expect(registry.get('dfg')!.robustToNoise).toBe(true);
      expect(registry.get('heuristic_miner')!.robustToNoise).toBe(true);
      expect(registry.get('ilp')!.robustToNoise).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('returns same instance and has all algorithms', () => {
      const reg1 = getRegistry();
      const reg2 = getRegistry();
      expect(reg1).toBe(reg2);
      expect(reg1.list().length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Error Handling', () => {
    it('returns undefined for unknown algorithm, empty array for unknown profile', () => {
      expect(registry.get('unknown_algorithm')).toBeUndefined();
      expect(registry.getForProfile('unknown' as ExecutionProfile)).toEqual([]);
      expect(registry.suggestForProfile('unknown' as ExecutionProfile, 1000)).toBeUndefined();
    });
  });

  describe('Parameters', () => {
    it('has correct parameter definitions for heuristic, genetic, and ILP algorithms', () => {
      const heuristic = registry.get('heuristic_miner')!;
      expect(heuristic.parameters.length).toBeGreaterThan(1);
      const depParam = heuristic.parameters.find((p) => p.name === 'dependency_threshold');
      expect(depParam).toBeDefined();
      expect(depParam?.type).toBe('number');
      expect(depParam?.min).toBe(0);
      expect(depParam?.max).toBe(1);

      const genetic = registry.get('genetic_algorithm')!;
      expect(genetic.parameters.some((p) => p.name === 'population_size')).toBe(true);
      expect(genetic.parameters.some((p) => p.name === 'generations')).toBe(true);

      const ilp = registry.get('ilp')!;
      const activityKey = ilp.parameters.find((p) => p.name === 'activity_key');
      expect(activityKey).toBeDefined();
      expect(activityKey?.type).toBe('string');
      expect(activityKey?.default).toBe('concept:name');
    });
  });

  describe('Output Types', () => {
    it('has DFG, Petri Net, tree, and declare output algorithms', () => {
      expect(registry.list().filter((a) => a.outputType === 'dfg').length).toBeGreaterThan(2);
      expect(registry.list().filter((a) => a.outputType === 'petrinet').length).toBeGreaterThanOrEqual(1);
      expect(registry.list().filter((a) => a.outputType === 'tree').length).toBeGreaterThan(0);
      expect(registry.list().filter((a) => a.outputType === 'declare').length).toBeGreaterThan(0);
    });
  });

  describe('Registry Completeness', () => {
    it('has exactly 36 registered algorithms', () => {
      expect(registry.list().length).toBe(36);
    });

    it('has no duplicate algorithm IDs', () => {
      const ids = registry.list().map((a) => a.id);
      const uniqueIds = new Set(ids);
      const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
      expect(duplicates, `Duplicate IDs found: ${duplicates.join(', ')}`).toEqual([]);
      expect(uniqueIds.size).toBe(36);
    });

    it('every algorithm has a non-empty description', () => {
      const missing = registry
        .list()
        .filter((a) => !a.description || a.description.trim() === '');
      expect(
        missing.map((a) => a.id),
        `Algorithms missing descriptions: ${missing.map((a) => a.id).join(', ')}`,
      ).toEqual([]);
    });

    it('every algorithm has at least one deploymentProfile', () => {
      const missing = registry
        .list()
        .filter((a) => !a.deploymentProfiles || a.deploymentProfiles.length === 0);
      expect(
        missing.map((a) => a.id),
        `Algorithms missing deploymentProfiles: ${missing.map((a) => a.id).join(', ')}`,
      ).toEqual([]);
    });

    it('every algorithm has speedTier and qualityTier in range [0, 100]', () => {
      for (const algo of registry.list()) {
        expect(algo.speedTier, `${algo.id}.speedTier must be a number`).toBeTypeOf('number');
        expect(algo.qualityTier, `${algo.id}.qualityTier must be a number`).toBeTypeOf('number');
        expect(algo.speedTier).toBeGreaterThanOrEqual(0);
        expect(algo.speedTier).toBeLessThanOrEqual(100);
        expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
        expect(algo.qualityTier).toBeLessThanOrEqual(100);
      }
    });

    it('all 36 expected algorithm IDs are present', () => {
      const EXPECTED_IDS = [
        // Discovery
        'dfg', 'process_skeleton', 'alpha_plus_plus', 'heuristic_miner',
        'inductive_miner', 'genetic_algorithm', 'pso', 'a_star',
        'hill_climbing', 'aco', 'simulated_annealing', 'declare',
        'optimized_dfg', 'ilp', 'simd_streaming_dfg', 'hierarchical_dfg',
        'streaming_log', 'smart_engine',
        // ML Analysis
        'ml_cluster', 'ml_anomaly',
        // Analysis & Utilities
        'transition_system', 'log_to_trie', 'causal_graph',
        'performance_spectrum', 'batches', 'correlation_miner',
        'generalization', 'etconformance_precision', 'alignments',
        'complexity_metrics', 'pnml_import', 'bpmn_import',
        'powl_to_process_tree', 'yawl_export', 'playout',
        'monte_carlo_simulation',
      ] as const;

      expect(EXPECTED_IDS.length).toBe(36);

      const registered = new Set(registry.list().map((a) => a.id));
      const missing = EXPECTED_IDS.filter((id) => !registered.has(id));
      expect(
        missing,
        `Expected algorithm IDs not found in registry: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  });
});
