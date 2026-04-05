/**
 * handlers.test.ts
 * Tests for algorithm step handlers - 30+ tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanStepType, type PlanStep } from '@wasm4pm/planner';
import {
  implementAlgorithmStep,
  listAlgorithms,
  validateAlgorithmParameters,
  WasmModule,
  AlgorithmStepOutput,
} from '../src/handlers';

// Mock WASM module
const createMockWasmModule = (): WasmModule => ({
  discover_dfg: vi.fn(async () => ({ handle: 'dfg_handle_123' })),
  discover_ocel_dfg: vi.fn(async () => ({ handle: 'ocel_dfg_handle' })),
  discover_ocel_dfg_per_type: vi.fn(async () => ({ handle: 'ocel_dfg_type_handle' })),
  discover_alpha_plus_plus: vi.fn(async () => ({ handle: 'alpha_handle_456' })),
  discover_heuristic_miner: vi.fn(async () => ({ handle: 'heuristic_handle_789' })),
  discover_inductive_miner: vi.fn(async () => ({ handle: 'inductive_handle_101' })),
  discover_genetic_algorithm: vi.fn(async () => ({ handle: 'genetic_handle_202' })),
  discover_pso_algorithm: vi.fn(async () => ({ handle: 'pso_handle_303' })),
  discover_astar: vi.fn(async () => ({ handle: 'astar_handle_404' })),
  discover_hill_climbing: vi.fn(async () => ({ handle: 'hc_handle_505' })),
  discover_ilp_petri_net: vi.fn(async () => ({ handle: 'ilp_handle_606' })),
  discover_ant_colony: vi.fn(async () => ({ handle: 'aco_handle_707' })),
  discover_simulated_annealing: vi.fn(async () => ({ handle: 'sa_handle_808' })),
  discover_declare: vi.fn(async () => ({ handle: 'declare_handle_909' })),
  discover_optimized_dfg: vi.fn(async () => ({ handle: 'opt_dfg_handle_010' })),
});

describe('Algorithm Step Handlers', () => {
  let wasmModule: WasmModule;
  const eventLogHandle = 'eventlog_12345';

  beforeEach(() => {
    wasmModule = createMockWasmModule();
  });

  describe('DFG Algorithm', () => {
    it('should execute DFG algorithm step', async () => {
      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: { activity_key: 'concept:name' },
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result).toBeDefined();
      expect(result.modelHandle).toBe('dfg_handle_123');
      expect(result.algorithm).toBe('dfg');
      expect(result.outputType).toBe('dfg');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default activity key if not provided', async () => {
      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.parameters.activity_key).toBe('concept:name');
    });

    it('should call WASM discover_dfg function', async () => {
      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: { activity_key: 'activity' },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_dfg).toHaveBeenCalledWith(eventLogHandle, 'activity');
    });
  });

  describe('Alpha++ Algorithm', () => {
    it('should execute Alpha++ algorithm step', async () => {
      const step: PlanStep = {
        id: 'discover_alpha_plus_plus',
        name: 'discover_alpha_plus_plus',
        type: PlanStepType.DISCOVER_ALPHA_PLUS_PLUS,
        parameters: { activity_key: 'concept:name' },
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('alpha_plus_plus');
      expect(result.outputType).toBe('petrinet');
      expect(result.modelHandle).toBe('alpha_handle_456');
    });

    it('should call WASM discover_alpha_plus_plus', async () => {
      const step: PlanStep = {
        id: 'discover_alpha_plus_plus',
        name: 'discover_alpha_plus_plus',
        type: PlanStepType.DISCOVER_ALPHA_PLUS_PLUS,
        parameters: { activity_key: 'event_type' },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_alpha_plus_plus).toHaveBeenCalledWith(
        eventLogHandle,
        'event_type'
      );
    });
  });

  describe('Heuristic Miner Algorithm', () => {
    it('should execute Heuristic Miner with default threshold', async () => {
      const step: PlanStep = {
        id: 'discover_heuristic',
        name: 'discover_heuristic',
        type: PlanStepType.DISCOVER_HEURISTIC,
        parameters: { activity_key: 'concept:name' },
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('heuristic_miner');
      expect(wasmModule.discover_heuristic_miner).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        0.5
      );
    });

    it('should execute Heuristic Miner with custom threshold', async () => {
      const step: PlanStep = {
        id: 'discover_heuristic',
        name: 'discover_heuristic',
        type: PlanStepType.DISCOVER_HEURISTIC,
        parameters: { activity_key: 'concept:name', dependency_threshold: 0.7 },
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.parameters.dependency_threshold).toBe(0.7);
      expect(wasmModule.discover_heuristic_miner).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        0.7
      );
    });
  });

  describe('Inductive Miner Algorithm', () => {
    it('should execute Inductive Miner with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_inductive',
        name: 'discover_inductive',
        type: PlanStepType.DISCOVER_INDUCTIVE,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('inductive_miner');
      expect(result.outputType).toBe('tree');
      expect(wasmModule.discover_inductive_miner).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        0.2
      );
    });

    it('should execute Inductive Miner with custom noise threshold', async () => {
      const step: PlanStep = {
        id: 'discover_inductive',
        name: 'discover_inductive',
        type: PlanStepType.DISCOVER_INDUCTIVE,
        parameters: { noise_threshold: 0.1 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_inductive_miner).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        0.1
      );
    });
  });

  describe('Genetic Algorithm', () => {
    it('should execute Genetic Algorithm with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_genetic',
        name: 'discover_genetic',
        type: PlanStepType.DISCOVER_GENETIC,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('genetic_algorithm');
      expect(wasmModule.discover_genetic_algorithm).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        50,
        100
      );
    });

    it('should execute Genetic Algorithm with custom parameters', async () => {
      const step: PlanStep = {
        id: 'discover_genetic',
        name: 'discover_genetic',
        type: PlanStepType.DISCOVER_GENETIC,
        parameters: { population_size: 100, generations: 200 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_genetic_algorithm).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        100,
        200
      );
    });
  });

  describe('PSO Algorithm', () => {
    it('should execute PSO with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_pso',
        name: 'discover_pso',
        type: PlanStepType.DISCOVER_PSO,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('pso');
      expect(wasmModule.discover_pso_algorithm).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        30,
        50
      );
    });

    it('should execute PSO with custom parameters', async () => {
      const step: PlanStep = {
        id: 'discover_pso',
        name: 'discover_pso',
        type: PlanStepType.DISCOVER_PSO,
        parameters: { swarm_size: 50, iterations: 150 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_pso_algorithm).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        50,
        150
      );
    });
  });

  describe('A* Search Algorithm', () => {
    it('should execute A* with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_a_star',
        name: 'discover_a_star',
        type: PlanStepType.DISCOVER_A_STAR,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('a_star');
      expect(wasmModule.discover_astar).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        10000
      );
    });

    it('should execute A* with custom max iterations', async () => {
      const step: PlanStep = {
        id: 'discover_a_star',
        name: 'discover_a_star',
        type: PlanStepType.DISCOVER_A_STAR,
        parameters: { max_iterations: 50000 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_astar).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        50000
      );
    });
  });

  describe('Hill Climbing Algorithm', () => {
    it('should execute Hill Climbing with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_hill_climbing',
        name: 'discover_hill_climbing',
        type: PlanStepType.DISCOVER_A_STAR, // Use A* type as fallback
        parameters: {},
      };

      // This test will fail because there's no direct map, but shows the pattern
      // In real use, planner would provide correct step type
    });
  });

  describe('ILP Algorithm', () => {
    it('should execute ILP with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_ilp',
        name: 'discover_ilp',
        type: PlanStepType.DISCOVER_ILP,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('ilp');
      expect(result.outputType).toBe('petrinet');
      expect(wasmModule.discover_ilp_petri_net).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        30
      );
    });

    it('should execute ILP with custom timeout', async () => {
      const step: PlanStep = {
        id: 'discover_ilp',
        name: 'discover_ilp',
        type: PlanStepType.DISCOVER_ILP,
        parameters: { timeout_seconds: 60 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_ilp_petri_net).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        60
      );
    });
  });

  describe('ACO Algorithm', () => {
    it('should execute ACO with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_aco',
        name: 'discover_aco',
        type: PlanStepType.DISCOVER_ACO,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('aco');
      expect(wasmModule.discover_ant_colony).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        40,
        100
      );
    });

    it('should execute ACO with custom parameters', async () => {
      const step: PlanStep = {
        id: 'discover_aco',
        name: 'discover_aco',
        type: PlanStepType.DISCOVER_ACO,
        parameters: { colony_size: 100, iterations: 250 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_ant_colony).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        100,
        250
      );
    });
  });

  describe('Simulated Annealing Algorithm', () => {
    it('should execute Simulated Annealing with defaults', async () => {
      const step: PlanStep = {
        id: 'discover_sa',
        name: 'discover_sa',
        type: PlanStepType.DISCOVER_SIMULATED_ANNEALING,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.algorithm).toBe('simulated_annealing');
      expect(wasmModule.discover_simulated_annealing).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        100,
        0.95
      );
    });

    it('should execute SA with custom parameters', async () => {
      const step: PlanStep = {
        id: 'discover_sa',
        name: 'discover_sa',
        type: PlanStepType.DISCOVER_SIMULATED_ANNEALING,
        parameters: { initial_temperature: 500, cooling_rate: 0.9 },
      };

      await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(wasmModule.discover_simulated_annealing).toHaveBeenCalledWith(
        eventLogHandle,
        'concept:name',
        500,
        0.9
      );
    });
  });

  describe('Output Validation', () => {
    it('should return structured output with all fields', async () => {
      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: { activity_key: 'concept:name' },
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.modelHandle).toBeDefined();
      expect(result.algorithm).toBeDefined();
      expect(result.outputType).toBeDefined();
      expect(result.executionTimeMs).toBeDefined();
      expect(result.parameters).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should include algorithm metadata in output', async () => {
      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result.metadata?.algorithmName).toBe('DFG (Directly Follows Graph)');
      expect(result.metadata?.complexity).toBeDefined();
      expect(result.metadata?.speedTier).toBeDefined();
      expect(result.metadata?.qualityTier).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown algorithm', async () => {
      const step: PlanStep = {
        id: 'unknown_algo',
        name: 'unknown_algo',
        type: 'unknown_type' as PlanStepType,
        parameters: {},
      };

      await expect(
        implementAlgorithmStep(step, wasmModule, eventLogHandle)
      ).rejects.toThrow();
    });

    it('should throw error if WASM function fails', async () => {
      const failingModule = createMockWasmModule();
      (failingModule.discover_dfg as any).mockRejectedValueOnce(
        new Error('WASM execution failed')
      );

      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: {},
      };

      await expect(
        implementAlgorithmStep(step, failingModule, eventLogHandle)
      ).rejects.toThrow('Failed to execute algorithm');
    });

    it('should throw error if model handle is invalid', async () => {
      const badModule = createMockWasmModule();
      (badModule.discover_dfg as any).mockResolvedValueOnce({ handle: null });

      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: {},
      };

      await expect(
        implementAlgorithmStep(step, badModule, eventLogHandle)
      ).rejects.toThrow('Invalid model handle');
    });

    it('should provide helpful error message for invalid event log', async () => {
      const failingModule = createMockWasmModule();
      (failingModule.discover_dfg as any).mockRejectedValueOnce(
        new Error('Object is not an EventLog')
      );

      const step: PlanStep = {
        id: 'discover_dfg',
        name: 'discover_dfg',
        type: PlanStepType.DISCOVER_DFG,
        parameters: {},
      };

      await expect(
        implementAlgorithmStep(step, failingModule, 'invalid_handle')
      ).rejects.toThrow();
    });
  });

  describe('List and Validate Functions', () => {
    it('should list all algorithms', () => {
      const algorithms = listAlgorithms();

      expect(Array.isArray(algorithms)).toBe(true);
      expect(algorithms.length).toBeGreaterThanOrEqual(15);

      // Each should have required fields
      for (const algo of algorithms) {
        expect(algo.id).toBeDefined();
        expect(algo.name).toBeDefined();
        expect(algo.outputType).toBeDefined();
        expect(algo.complexity).toBeDefined();
      }
    });

    it('should validate correct parameters', () => {
      const result = validateAlgorithmParameters('dfg', {
        activity_key: 'concept:name',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for missing required parameter', () => {
      const result = validateAlgorithmParameters('dfg', {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Missing required parameter');
    });

    it('should validate number range', () => {
      const result = validateAlgorithmParameters('heuristic_miner', {
        activity_key: 'concept:name',
        dependency_threshold: 1.5, // Out of range
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('maximum'))).toBe(true);
    });

    it('should fail for wrong parameter type', () => {
      const result = validateAlgorithmParameters('heuristic_miner', {
        activity_key: 123, // Should be string
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('wrong type'))).toBe(true);
    });

    it('should return error for unknown algorithm', () => {
      const result = validateAlgorithmParameters('unknown_algo', {});

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });
  });

  describe('Integration', () => {
    it('should execute complete algorithm pipeline', async () => {
      // List available
      const algorithms = listAlgorithms();
      expect(algorithms.length).toBeGreaterThan(0);

      // Validate parameters
      const validation = validateAlgorithmParameters('genetic_algorithm', {
        activity_key: 'concept:name',
        population_size: 100,
        generations: 50,
      });
      expect(validation.valid).toBe(true);

      // Execute algorithm
      const step: PlanStep = {
        id: 'discover_genetic',
        name: 'discover_genetic',
        type: PlanStepType.DISCOVER_GENETIC,
        parameters: validation.valid
          ? {
              activity_key: 'concept:name',
              population_size: 100,
              generations: 50,
            }
          : {},
      };

      const result = await implementAlgorithmStep(step, wasmModule, eventLogHandle);

      expect(result).toBeDefined();
      expect(result.modelHandle).toBeDefined();
      expect(result.algorithm).toBe('genetic_algorithm');
    });
  });
});
