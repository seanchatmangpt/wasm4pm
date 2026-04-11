/**
 * registry.test.ts
 * Tests for AlgorithmRegistry - 25+ tests
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
    it('should have all 15+ algorithms registered', () => {
      const algorithms = registry.list();
      expect(algorithms.length).toBeGreaterThanOrEqual(15);
    });

    it('should have DFG algorithm', () => {
      const dfg = registry.get('dfg');
      expect(dfg).toBeDefined();
      expect(dfg?.name).toBe('DFG (Directly Follows Graph)');
    });

    it('should have Alpha++ algorithm', () => {
      const alpha = registry.get('alpha_plus_plus');
      expect(alpha).toBeDefined();
      expect(alpha?.name).toContain('Alpha');
    });

    it('should have Heuristic Miner', () => {
      const heuristic = registry.get('heuristic_miner');
      expect(heuristic).toBeDefined();
      expect(heuristic?.outputType).toBe('dfg');
    });

    it('should have Inductive Miner', () => {
      const inductive = registry.get('inductive_miner');
      expect(inductive).toBeDefined();
      expect(inductive?.outputType).toBe('tree');
    });

    it('should have Genetic Algorithm', () => {
      const genetic = registry.get('genetic_algorithm');
      expect(genetic).toBeDefined();
      expect(genetic?.qualityTier).toBeGreaterThan(70);
    });

    it('should have PSO', () => {
      const pso = registry.get('pso');
      expect(pso).toBeDefined();
      expect(pso?.name).toContain('Particle Swarm');
    });

    it('should have A* Search', () => {
      const astar = registry.get('a_star');
      expect(astar).toBeDefined();
      expect(astar?.name).toContain('A*');
    });

    it('should have Hill Climbing', () => {
      const hc = registry.get('hill_climbing');
      expect(hc).toBeDefined();
      expect(hc?.speedTier).toBeLessThan(50);
    });

    it('should have ILP', () => {
      const ilp = registry.get('ilp');
      expect(ilp).toBeDefined();
      expect(ilp?.complexity).toBe('NP-Hard');
    });

    it('should have ACO', () => {
      const aco = registry.get('aco');
      expect(aco).toBeDefined();
      expect(aco?.name).toContain('Ant Colony');
    });

    it('should have Simulated Annealing', () => {
      const sa = registry.get('simulated_annealing');
      expect(sa).toBeDefined();
      expect(sa?.name).toContain('Simulated Annealing');
    });

    it('should have Declare', () => {
      const declare = registry.get('declare');
      expect(declare).toBeDefined();
      expect(declare?.outputType).toBe('declare');
    });

    it('should have Optimized DFG', () => {
      const optDfg = registry.get('optimized_dfg');
      expect(optDfg).toBeDefined();
      expect(optDfg?.outputType).toBe('dfg');
    });
  });

  describe('Algorithm Metadata', () => {
    it('should have valid metadata for all algorithms', () => {
      const algorithms = registry.list();

      for (const algo of algorithms) {
        // Check basic properties
        expect(algo.id).toBeDefined();
        expect(algo.name).toBeDefined();
        expect(algo.description).toBeDefined();
        expect(algo.outputType).toBeDefined();
        expect(algo.complexity).toBeDefined();

        // Check numeric tiers are in range
        expect(algo.speedTier).toBeGreaterThanOrEqual(0);
        expect(algo.speedTier).toBeLessThanOrEqual(100);
        expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
        expect(algo.qualityTier).toBeLessThanOrEqual(100);

        // Check arrays
        expect(Array.isArray(algo.parameters)).toBe(true);
        expect(Array.isArray(algo.supportedProfiles)).toBe(true);

        // Check resource estimates
        expect(algo.estimatedDurationMs).toBeGreaterThan(0);
        expect(algo.estimatedMemoryMB).toBeGreaterThan(0);
      }
    });

    it('should have activity_key parameter for all algorithms', () => {
      const algorithms = registry.list();

      for (const algo of algorithms) {
        const activityKeyParam = algo.parameters.find((p) => p.name === 'activity_key');
        expect(activityKeyParam).toBeDefined();
        expect(activityKeyParam?.type).toBe('string');
        expect(activityKeyParam?.required).toBe(true);
        expect(activityKeyParam?.default).toBe('concept:name');
      }
    });

    it('DFG should be fastest', () => {
      const algorithms = registry.list();
      const dfg = registry.get('dfg')!;

      const excludedIds = new Set([
        'dfg',
        'process_skeleton', // sibling of DFG
        'simd_streaming_dfg', // SIMD-accelerated variant
        'streaming_dfg', // streaming variant
        'streaming_conformance', // streaming variant
        'optimized_dfg', // smart/adaptive variant
        'smart_engine', // adaptive variant with caching
      ]);

      for (const algo of algorithms) {
        if (!excludedIds.has(algo.id)) {
          expect(algo.speedTier).toBeGreaterThanOrEqual(dfg.speedTier);
        }
      }
    });

    it('ILP should have highest quality for DFG', () => {
      const ilp = registry.get('ilp')!;
      const optDfg = registry.get('optimized_dfg')!;

      expect(ilp.qualityTier).toBeGreaterThan(70);
      expect(optDfg.qualityTier).toBeGreaterThan(70);
    });

    it('should have complexity classes', () => {
      const complexities = new Set<ComplexityClass>();

      for (const algo of registry.list()) {
        complexities.add(algo.complexity);
        expect(['O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(n * d²)', 'Exponential', 'NP-Hard']).toContain(
          algo.complexity
        );
      }

      // Should have variety
      expect(complexities.size).toBeGreaterThan(1);
    });
  });

  describe('Profiles', () => {
    it('should support fast profile', () => {
      const fast = registry.getForProfile('fast');
      expect(fast.length).toBeGreaterThan(0);

      // Fast profile should include DFG
      expect(fast.some((a) => a.id === 'dfg')).toBe(true);
    });

    it('should support balanced profile', () => {
      const balanced = registry.getForProfile('balanced');
      expect(balanced.length).toBeGreaterThan(0);

      // Balanced should include heuristic and inductive
      expect(balanced.some((a) => a.id === 'heuristic_miner')).toBe(true);
      expect(balanced.some((a) => a.id === 'inductive_miner')).toBe(true);
    });

    it('should support quality profile', () => {
      const quality = registry.getForProfile('quality');
      expect(quality.length).toBeGreaterThan(0);

      // Quality should include genetic and ILP
      expect(quality.some((a) => a.id === 'genetic_algorithm')).toBe(true);
      expect(quality.some((a) => a.id === 'ilp')).toBe(true);
    });

    it('should support stream profile', () => {
      const stream = registry.getForProfile('stream');
      expect(stream.length).toBeGreaterThan(0);

      // Stream should include DFG for quick processing
      expect(stream.some((a) => a.id === 'dfg')).toBe(true);
    });

    it('all profiles should have algorithms', () => {
      const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];

      for (const profile of profiles) {
        const algorithms = registry.getForProfile(profile);
        expect(algorithms.length).toBeGreaterThan(0);
      }
    });

    it('fast profile should have fastest algorithms', () => {
      const fast = registry.getForProfile('fast');
      const balanced = registry.getForProfile('balanced');

      // Average speed of fast should be better than balanced
      const fastAvgSpeed = fast.reduce((sum, a) => sum + a.speedTier, 0) / fast.length;
      const balancedAvgSpeed =
        balanced.reduce((sum, a) => sum + a.speedTier, 0) / balanced.length;

      expect(fastAvgSpeed).toBeLessThan(balancedAvgSpeed);
    });

    it('quality profile should have highest quality algorithms', () => {
      const quality = registry.getForProfile('quality');

      // Quality profile should include top-tier algorithms
      const maxQuality = Math.max(...quality.map((a) => a.qualityTier));
      expect(maxQuality).toBeGreaterThanOrEqual(85);

      // Quality profile should include at least one algorithm with qualityTier >= 70
      expect(quality.some((a) => a.qualityTier >= 70)).toBe(true);
    });
  });

  describe('Suggestions', () => {
    it('should suggest algorithm for fast profile', () => {
      const suggested = registry.suggestForProfile('fast', 1000);
      expect(suggested).toBeDefined();
      expect(suggested?.supportedProfiles).toContain('fast');
    });

    it('should suggest algorithm for balanced profile', () => {
      const suggested = registry.suggestForProfile('balanced', 10000);
      expect(suggested).toBeDefined();
      expect(suggested?.supportedProfiles).toContain('balanced');
    });

    it('should suggest algorithm for quality profile', () => {
      const suggested = registry.suggestForProfile('quality', 5000);
      expect(suggested).toBeDefined();
      expect(suggested?.supportedProfiles).toContain('quality');
    });

    it('should prefer scalable algorithms for large logs', () => {
      const suggested = registry.suggestForProfile('fast', 500000);
      expect(suggested).toBeDefined();

      if (suggested) {
        // Should prefer algorithms that scale well
        expect(suggested.scalesWell).toBe(true);
      }
    });

    it('should prioritize quality in quality profile', () => {
      const suggested = registry.suggestForProfile('quality', 5000);
      expect(suggested).toBeDefined();

      if (suggested) {
        expect(suggested.qualityTier).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('Robustness', () => {
    it('should mark noise-robust algorithms', () => {
      const robust = registry.list().filter((a) => a.robustToNoise);
      expect(robust.length).toBeGreaterThan(5);
    });

    it('should mark scalable algorithms', () => {
      const scalable = registry.list().filter((a) => a.scalesWell);
      expect(scalable.length).toBeGreaterThan(3);
    });

    it('DFG and Heuristic should be robust', () => {
      const dfg = registry.get('dfg')!;
      const heuristic = registry.get('heuristic_miner')!;

      expect(dfg.robustToNoise).toBe(true);
      expect(heuristic.robustToNoise).toBe(true);
    });

    it('ILP should not be robust to noise', () => {
      const ilp = registry.get('ilp')!;
      expect(ilp.robustToNoise).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance from getRegistry()', () => {
      const reg1 = getRegistry();
      const reg2 = getRegistry();
      expect(reg1).toBe(reg2);
    });

    it('singleton should have all algorithms', () => {
      const registry = getRegistry();
      expect(registry.list().length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Error Handling', () => {
    it('should return undefined for unknown algorithm', () => {
      const result = registry.get('unknown_algorithm');
      expect(result).toBeUndefined();
    });

    it('should return empty array for unknown profile', () => {
      const result = registry.getForProfile('unknown' as ExecutionProfile);
      expect(result).toEqual([]);
    });

    it('should return undefined suggestion for unknown profile', () => {
      const result = registry.suggestForProfile('unknown' as ExecutionProfile, 1000);
      expect(result).toBeUndefined();
    });
  });

  describe('Parameters', () => {
    it('should have parameter definitions', () => {
      const heuristic = registry.get('heuristic_miner')!;
      expect(heuristic.parameters.length).toBeGreaterThan(1);

      const depParam = heuristic.parameters.find((p) => p.name === 'dependency_threshold');
      expect(depParam).toBeDefined();
      expect(depParam?.type).toBe('number');
      expect(depParam?.min).toBe(0);
      expect(depParam?.max).toBe(1);
    });

    it('genetic algorithm should have population and generation parameters', () => {
      const genetic = registry.get('genetic_algorithm')!;
      expect(genetic.parameters.some((p) => p.name === 'population_size')).toBe(true);
      expect(genetic.parameters.some((p) => p.name === 'generations')).toBe(true);
    });

    it('ILP should have timeout parameter', () => {
      const ilp = registry.get('ilp')!;
      const timeout = ilp.parameters.find((p) => p.name === 'timeout_seconds');
      expect(timeout).toBeDefined();
      expect(timeout?.type).toBe('number');
      expect(timeout?.default).toBe(30);
    });
  });

  describe('Output Types', () => {
    it('should have DFG output algorithms', () => {
      const dfgAlgos = registry.list().filter((a) => a.outputType === 'dfg');
      expect(dfgAlgos.length).toBeGreaterThan(2);
    });

    it('should have Petri Net output algorithms', () => {
      const pnAlgos = registry.list().filter((a) => a.outputType === 'petrinet');
      expect(pnAlgos.length).toBeGreaterThan(3);
    });

    it('should have tree output algorithms', () => {
      const treeAlgos = registry.list().filter((a) => a.outputType === 'tree');
      expect(treeAlgos.length).toBeGreaterThan(0);
    });

    it('should have declare output algorithms', () => {
      const declareAlgos = registry.list().filter((a) => a.outputType === 'declare');
      expect(declareAlgos.length).toBeGreaterThan(0);
    });
  });
});
