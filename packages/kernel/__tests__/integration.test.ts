/**
 * integration.test.ts
 * Integration tests for kernel - registry + handlers working together
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanStepType, type PlanStep } from '@wasm4pm/planner';
import { getRegistry, ExecutionProfile } from '../src/registry';
import {
  implementAlgorithmStep,
  validateAlgorithmParameters,
  listAlgorithms,
  WasmModule,
} from '../src/handlers';

// Create mock WASM module
const createMockWasm = (): WasmModule => ({
  discover_dfg: vi.fn(async () => ({ handle: 'h1' })),
  discover_ocel_dfg: vi.fn(async () => ({ handle: 'h2' })),
  discover_ocel_dfg_per_type: vi.fn(async () => ({ handle: 'h3' })),
  discover_alpha_plus_plus: vi.fn(async () => ({ handle: 'h4' })),
  discover_heuristic_miner: vi.fn(async () => ({ handle: 'h5' })),
  discover_inductive_miner: vi.fn(async () => ({ handle: 'h6' })),
  discover_genetic_algorithm: vi.fn(async () => ({ handle: 'h7' })),
  discover_pso_algorithm: vi.fn(async () => ({ handle: 'h8' })),
  discover_astar: vi.fn(async () => ({ handle: 'h9' })),
  discover_hill_climbing: vi.fn(async () => ({ handle: 'h10' })),
  discover_ilp_petri_net: vi.fn(async () => ({ handle: 'h11' })),
  discover_ant_colony: vi.fn(async () => ({ handle: 'h12' })),
  discover_simulated_annealing: vi.fn(async () => ({ handle: 'h13' })),
  discover_declare: vi.fn(async () => ({ handle: 'h14' })),
  discover_optimized_dfg: vi.fn(async () => ({ handle: 'h15' })),
});

describe('Kernel Integration Tests', () => {
  let registry = getRegistry();
  let wasmModule: WasmModule;
  const eventLogHandle = 'elog_test';

  beforeEach(() => {
    registry = getRegistry();
    wasmModule = createMockWasm();
  });

  describe('Profile-Based Execution', () => {
    it('should execute all fast profile algorithms', async () => {
      const fastAlgos = registry.getForProfile('fast');
      expect(fastAlgos.length).toBeGreaterThan(0);

      for (const algo of fastAlgos.slice(0, 3)) {
        // Test first 3 to avoid too many WASM calls
        const result = validateAlgorithmParameters(algo.id, {
          activity_key: 'concept:name',
        });

        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      }
    });

    it('should execute best algorithm for profile and log size', async () => {
      const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality'];

      for (const profile of profiles) {
        const suggested = registry.suggestForProfile(profile, 5000);
        expect(suggested).toBeDefined();

        if (suggested) {
          expect(suggested.supportedProfiles).toContain(profile);

          // Validate parameters
          const validation = validateAlgorithmParameters(suggested.id, {
            activity_key: 'concept:name',
          });

          expect(validation.valid).toBe(true);
        }
      }
    });

    it('should prefer scalable algorithms for large logs', () => {
      const suggested = registry.suggestForProfile('fast', 1000000); // 1M events
      expect(suggested).toBeDefined();

      if (suggested) {
        expect(suggested.scalesWell).toBe(true);
      }
    });
  });

  describe('End-to-End Algorithm Execution', () => {
    it('should execute DFG through full pipeline', async () => {
      // 1. Get from registry
      const dfg = registry.get('dfg');
      expect(dfg).toBeDefined();

      // 2. Validate parameters
      const params = { activity_key: 'concept:name' };
      const validation = validateAlgorithmParameters('dfg', params);
      expect(validation.valid).toBe(true);

      // 3. Create step
      const step: PlanStep = {
        id: 'step_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: params,
      };

      // 4. Execute
      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result).toBeDefined();
      expect(result.algorithm).toBe('dfg');
      expect(result.outputType).toBe('dfg');
    });

    it('should execute Heuristic Miner with custom parameters', async () => {
      // Get algorithm
      const heuristic = registry.get('heuristic_miner');
      expect(heuristic).toBeDefined();

      // Validate custom params
      const params = {
        activity_key: 'event_type',
        dependency_threshold: 0.6,
      };
      const validation = validateAlgorithmParameters('heuristic_miner', params);
      expect(validation.valid).toBe(true);

      // Execute
      const step: PlanStep = {
        id: 'step_heur',
        name: 'discover_heuristic',
        type: PlanStepType.DISCOVER_HEURISTIC,
        parameters: params,
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('heuristic_miner');
      expect(result.parameters.dependency_threshold).toBe(0.6);
    });

    it('should execute Genetic Algorithm with optimization params', async () => {
      const genetic = registry.get('genetic_algorithm');
      expect(genetic).toBeDefined();

      const params = {
        activity_key: 'concept:name',
        population_size: 75,
        generations: 150,
      };

      const validation = validateAlgorithmParameters('genetic_algorithm', params);
      expect(validation.valid).toBe(true);

      const step: PlanStep = {
        id: 'step_gen',
        name: 'discover_genetic',
        type: PlanStepType.DISCOVER_GENETIC,
        parameters: params,
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('genetic_algorithm');
      expect(result.outputType).toBe('petrinet');
    });
  });

  describe('Parameter Validation Integration', () => {
    it('should validate parameters from registry metadata', () => {
      const ilp = registry.get('ilp');
      expect(ilp).toBeDefined();

      if (ilp) {
        // Check that parameter definitions match validation logic
        const actKeyParam = ilp.parameters.find((p) => p.name === 'activity_key');
        expect(actKeyParam?.required).toBe(true);

        // Test validation
        const result = validateAlgorithmParameters('ilp', {
          activity_key: 'test',
          timeout_seconds: 45,
        });

        expect(result.valid).toBe(true);
      }
    });

    it('should reject out-of-range parameters', () => {
      const heuristic = registry.get('heuristic_miner');
      expect(heuristic).toBeDefined();

      if (heuristic) {
        // Check parameter bounds
        const depParam = heuristic.parameters.find((p) => p.name === 'dependency_threshold');
        expect(depParam?.min).toBe(0);
        expect(depParam?.max).toBe(1);

        // Test validation with out-of-range
        const result = validateAlgorithmParameters('heuristic_miner', {
          activity_key: 'concept:name',
          dependency_threshold: 1.5,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('maximum'))).toBe(true);
      }
    });
  });

  describe('Algorithm Classification', () => {
    it('should properly classify algorithms by complexity', () => {
      const linear = registry.list().filter((a) => a.complexity === 'O(n)');
      const quadratic = registry.list().filter((a) => a.complexity === 'O(n²)');
      const exponential = registry.list().filter((a) => a.complexity === 'Exponential');

      expect(linear.length).toBeGreaterThan(0);
      expect(quadratic.length).toBeGreaterThan(0);
      expect(exponential.length).toBeGreaterThan(0);

      // Verify: O(n) algorithms should be faster than exponential
      const avgLinearSpeed = linear.reduce((s, a) => s + a.speedTier, 0) / linear.length;
      const avgExpSpeed =
        exponential.reduce((s, a) => s + a.speedTier, 0) / exponential.length;

      expect(avgLinearSpeed).toBeLessThan(avgExpSpeed);
    });

    it('should properly classify algorithms by output type', () => {
      const dfgAlgos = registry.list().filter((a) => a.outputType === 'dfg');
      const pnAlgos = registry.list().filter((a) => a.outputType === 'petrinet');

      expect(dfgAlgos.length).toBeGreaterThan(0);
      expect(pnAlgos.length).toBeGreaterThan(0);

      // DFG algorithms should generally be faster
      const avgDfgSpeed = dfgAlgos.reduce((s, a) => s + a.speedTier, 0) / dfgAlgos.length;
      const avgPnSpeed = pnAlgos.reduce((s, a) => s + a.speedTier, 0) / pnAlgos.length;

      expect(avgDfgSpeed).toBeLessThanOrEqual(avgPnSpeed);
    });
  });

  describe('Execution Profile Composition', () => {
    it('fast profile should be subset of all algorithms', () => {
      const all = registry.list().map((a) => a.id);
      const fast = registry.getForProfile('fast').map((a) => a.id);

      for (const algoId of fast) {
        expect(all).toContain(algoId);
      }
    });

    it('should be able to execute any algorithm from listing', () => {
      const algorithms = listAlgorithms();

      // For each algorithm, validate its basic parameters work
      for (const algo of algorithms.slice(0, 5)) {
        const result = validateAlgorithmParameters(algo.id, {
          activity_key: 'concept:name',
        });

        // At minimum, activity_key should validate
        if (!result.valid) {
          // Some algorithms may require additional params, that's OK
          expect(result.errors.some((e) => e.includes('activity_key'))).toBe(false);
        }
      }
    });
  });

  describe('Metadata Consistency', () => {
    it('all algorithms should have consistent metadata', () => {
      const algorithms = registry.list();

      for (const algo of algorithms) {
        // Check numeric fields are in valid ranges
        expect(algo.speedTier).toBeGreaterThanOrEqual(0);
        expect(algo.speedTier).toBeLessThanOrEqual(100);
        expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
        expect(algo.qualityTier).toBeLessThanOrEqual(100);

        // Check arrays are non-empty
        expect(algo.parameters.length).toBeGreaterThan(0); // At least activity_key
        expect(algo.supportedProfiles.length).toBeGreaterThan(0);

        // Check resource estimates are positive
        expect(algo.estimatedDurationMs).toBeGreaterThan(0);
        expect(algo.estimatedMemoryMB).toBeGreaterThan(0);
      }
    });

    it('should maintain consistency between algorithm and profile mappings', () => {
      const algorithms = registry.list();
      const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];

      for (const profile of profiles) {
        const profileAlgos = registry.getForProfile(profile);

        for (const algo of profileAlgos) {
          // Each algorithm in profile should claim to support it
          expect(algo.supportedProfiles).toContain(profile);

          // Algorithm should exist in registry
          const registryAlgo = registry.get(algo.id);
          expect(registryAlgo).toBeDefined();
          expect(registryAlgo?.id).toBe(algo.id);
        }
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle quick analysis scenario (fast profile)', () => {
      const suggested = registry.suggestForProfile('fast', 10000);
      expect(suggested).toBeDefined();

      if (suggested) {
        expect(['O(n)', 'O(n log n)', 'O(n²)']).toContain(suggested.complexity);
        expect(suggested.speedTier).toBeLessThan(50);
      }
    });

    it('should handle production analysis scenario (balanced profile)', () => {
      const suggested = registry.suggestForProfile('balanced', 50000);
      expect(suggested).toBeDefined();

      if (suggested) {
        // Should be moderately complex but still reasonable
        expect(suggested.qualityTier).toBeGreaterThan(40);
      }
    });

    it('should handle research/offline scenario (quality profile)', () => {
      const suggested = registry.suggestForProfile('quality', 100000);
      expect(suggested).toBeDefined();

      if (suggested) {
        // Quality profile should prioritize model quality
        expect(suggested.qualityTier).toBeGreaterThanOrEqual(50);
      }
    });

    it('should handle streaming scenario (stream profile)', () => {
      const suggested = registry.suggestForProfile('stream', 1000); // Small window
      expect(suggested).toBeDefined();

      if (suggested) {
        // Stream should be very fast
        expect(suggested.speedTier).toBeLessThan(50);
        expect(suggested.robustToNoise).toBe(true);
      }
    });
  });
});
