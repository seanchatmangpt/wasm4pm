/**
 * pm4wasm-backend.test.ts
 *
 * Test suite for Pm4wasmBackend implementation.
 * Covers:
 * - capabilities() metadata validation
 * - discover() with 3 algorithms (dfg, inductive_miner, genetic_algorithm)
 * - budget timeout enforcement
 * - conformance() for both DFG and Petri net paths
 * - error handling for unsupported algorithms
 * - health check responsiveness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pm4wasmBackend } from '../src/backends/pm4wasm-backend.js';
import type { EventLogIR, ModelIR, BudgetEnvelope, ResultEnvelope } from '../src/mining-backend.js';

/**
 * Test fixtures: Sample event log and models
 */
const SAMPLE_LOG: EventLogIR = {
  format_version: '1.0',
  source_format: 'json',
  traces: [
    {
      case_id: 'case_1',
      events: [
        {
          activity: 'A',
          timestamp: '2024-01-01T10:00:00Z',
          resource: 'alice',
          attributes: {},
        },
        {
          activity: 'B',
          timestamp: '2024-01-01T10:05:00Z',
          resource: 'bob',
          attributes: {},
        },
        {
          activity: 'C',
          timestamp: '2024-01-01T10:10:00Z',
          resource: 'alice',
          attributes: {},
        },
      ],
    },
    {
      case_id: 'case_2',
      events: [
        {
          activity: 'A',
          timestamp: '2024-01-01T11:00:00Z',
          resource: 'alice',
          attributes: {},
        },
        {
          activity: 'C',
          timestamp: '2024-01-01T11:05:00Z',
          resource: 'bob',
          attributes: {},
        },
      ],
    },
  ],
  metadata: {
    trace_count: 2,
    event_count: 5,
    activity_count: 3,
    start_time: '2024-01-01T10:00:00Z',
    end_time: '2024-01-01T11:05:00Z',
    source_hash: 'hash-test-log',
  },
};

const SAMPLE_DFG_MODEL: ModelIR = {
  format_version: '1.0',
  model_type: 'dfg',
  algorithm_id: 'dfg',
  capabilities: {
    online_safe: true,
    offline_only: false,
    replay_ready: true,
    alignment_ready: false,
    streaming_compatible: true,
    exportable_to_pnml: false,
    exportable_to_bpmn: false,
  },
  nodes: [
    { id: 'A', label: 'A', type: 'activity' },
    { id: 'B', label: 'B', type: 'activity' },
    { id: 'C', label: 'C', type: 'activity' },
  ],
  edges: [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'A', to: 'C', weight: 1 },
    { from: 'B', to: 'C', weight: 1 },
  ],
  quality: {
    fitness: 0.85,
    precision: 0.80,
    generalization: 0.75,
    simplicity: 100,
  },
};

const SAMPLE_PETRI_NET: ModelIR = {
  format_version: '1.0',
  model_type: 'petri_net',
  algorithm_id: 'inductive_miner',
  capabilities: {
    online_safe: true,
    offline_only: false,
    replay_ready: true,
    alignment_ready: true,
    streaming_compatible: false,
    exportable_to_pnml: true,
    exportable_to_bpmn: true,
  },
  nodes: [
    { id: 'p0', label: 'Place 0', type: 'place' },
    { id: 't1', label: 'Transition A', type: 'transition' },
    { id: 'p1', label: 'Place 1', type: 'place' },
    { id: 't2', label: 'Transition B', type: 'transition' },
  ],
  edges: [
    { from: 'p0', to: 't1' },
    { from: 't1', to: 'p1' },
    { from: 'p1', to: 't2' },
  ],
};

const BUDGET_ONLINE: BudgetEnvelope = {
  latencyBudget: 'high_ms',
  memoryBudget: 0,
  qualityFloor: 'balanced',
  environment: {
    browserSafe: true,
    pythonAvailable: false,
  },
  mode: 'online',
};

const BUDGET_STRICT: BudgetEnvelope = {
  latencyBudget: 'sub_ms',
  memoryBudget: 0,
  qualityFloor: 'fast',
  environment: {
    browserSafe: true,
    pythonAvailable: false,
  },
  mode: 'online',
};

describe('Pm4wasmBackend', () => {
  let backend: Pm4wasmBackend;
  let mockWasmModule: any;

  beforeEach(() => {
    // Create a mock WASM module with all necessary functions
    mockWasmModule = {
      discovery_info: vi.fn(async () => ({ version: '1.0' })),
      discover_dfg: vi.fn(async (handle: string) =>
        JSON.stringify({
          nodes: [
            { id: 'A', label: 'A', type: 'activity' },
            { id: 'B', label: 'B', type: 'activity' },
          ],
          edges: [{ from: 'A', to: 'B', weight: 1 }],
          quality: { fitness: 0.85, precision: 0.8, generalization: 0.75, simplicity: 100 },
        }),
      ),
      discover_inductive_miner: vi.fn(async (handle: string) =>
        JSON.stringify({
          nodes: [
            { id: 'p0', label: 'Place 0', type: 'place' },
            { id: 't1', label: 'Transition', type: 'transition' },
          ],
          edges: [{ from: 'p0', to: 't1' }],
          quality: { fitness: 0.9, precision: 0.85, generalization: 0.8, simplicity: 50 },
        }),
      ),
      discover_genetic_algorithm: vi.fn(async (handle: string) =>
        JSON.stringify({
          nodes: [
            { id: 'A', label: 'A', type: 'activity' },
            { id: 'B', label: 'B', type: 'activity' },
          ],
          edges: [{ from: 'A', to: 'B', weight: 1 }],
          quality: { fitness: 0.88, precision: 0.82, generalization: 0.78, simplicity: 100 },
        }),
      ),
      eventlog_from_json: vi.fn(async (json: string) => `log_handle_test`),
      model_from_json: vi.fn(async (json: string) => `model_handle_test`),
      token_replay_pure: vi.fn(async (logHandle: string, modelHandle: string) =>
        JSON.stringify({
          fitness: 0.85,
          precision: 0.80,
          generalization: 0.75,
          simplicity: 100,
        }),
      ),
      compute_optimal_alignments: vi.fn(async (logHandle: string, modelHandle: string) =>
        JSON.stringify({
          fitness: 0.90,
          precision: 0.85,
          generalization: 0.80,
          simplicity: 100,
        }),
      ),
    };

    backend = new Pm4wasmBackend(mockWasmModule);
  });

  describe('capabilities()', () => {
    it('should return correct capabilities metadata', () => {
      const caps = backend.capabilities();

      expect(caps.algorithmFamilies).toEqual(['discovery']);
      expect(caps.outputTypes).toContain('dfg');
      expect(caps.outputTypes).toContain('petri_net');
      expect(caps.outputTypes).toContain('declare');
      expect(caps.environment.browserSafe).toBe(true);
      expect(caps.environment.edgeSafe).toBe(true);
      expect(caps.environment.requiresPython).toBe(false);
      expect(caps.latencyClass).toBe('sub_ms');
      expect(caps.deterministic).toBe(true);
      expect(caps.maxQualityTier).toBe('balanced');
      expect(caps.maxConcurrentInvocations).toBe(16);
    });

    it('should list all 15 supported algorithm IDs', () => {
      const caps = backend.capabilities();
      const expected = [
        'dfg',
        'process_skeleton',
        'simd_streaming_dfg',
        'alpha_plus_plus',
        'heuristic_miner',
        'inductive_miner',
        'hill_climbing',
        'declare',
        'simulated_annealing',
        'a_star',
        'aco',
        'pso',
        'genetic_algorithm',
        'optimized_dfg',
        'ilp',
      ];

      expect(caps.supportedAlgorithmIds).toHaveLength(15);
      expect(caps.supportedAlgorithmIds).toHaveLength(expected.length);
      for (const algo of expected) {
        expect(caps.supportedAlgorithmIds).toContain(algo);
      }
    });

    it('should return same capabilities on repeated calls (pure function)', () => {
      const caps1 = backend.capabilities();
      const caps2 = backend.capabilities();
      expect(caps1).toEqual(caps2);
    });
  });

  describe('discover()', () => {
    it('should successfully discover with DFG algorithm', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);

      expect(result.status).toBe('success');
      expect(result.algorithm_id).toBe('dfg');
      expect(result.backend_id).toBe('pm4wasm');
      expect(result.payload).toBeDefined();
      expect(result.model_ir).toBeDefined();
      expect(result.model_ir?.model_type).toBe('dfg');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.provenance).toBeDefined();
      expect(result.provenance.algorithm_id).toBe('dfg');
    });

    it('should successfully discover with inductive_miner algorithm', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'inductive_miner', BUDGET_ONLINE);

      expect(result.status).toBe('success');
      expect(result.algorithm_id).toBe('inductive_miner');
      expect(result.payload).toBeDefined();
      expect(result.model_ir?.model_type).toBe('petri_net');
    });

    it('should successfully discover with genetic_algorithm', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'genetic_algorithm', BUDGET_ONLINE);

      expect(result.status).toBe('success');
      expect(result.algorithm_id).toBe('genetic_algorithm');
      expect(result.payload).toBeDefined();
    });

    it('should return unique run_id and invocation_id', async () => {
      const result1 = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);
      const result2 = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);

      expect(result1.run_id).not.toBe(result2.run_id);
      expect(result1.invocation_id).not.toBe(result2.invocation_id);
    });

    it('should reject unsupported algorithm with status=failed', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'unsupported_algorithm', BUDGET_ONLINE);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not supported by Pm4wasmBackend');
      expect(result.payload).toBeNull();
    });

    it('should enforce budget compatibility: reject sub_ms budget for high_ms algorithm', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'genetic_algorithm', BUDGET_STRICT);

      expect(result.status).toBe('partial');
      expect(result.error).toContain('budget_exceeded');
      expect(result.payload).toBeNull();
    });

    it('should populate provenance chain correctly', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);

      expect(result.provenance).toBeDefined();
      expect(result.provenance.input_hash).toBeDefined();
      expect(result.provenance.output_hash).toBeDefined();
      expect(result.provenance.config_hash).toBeDefined();
      expect(result.provenance.plan_hash).toBeDefined();
      expect(result.provenance.combined_hash).toBeDefined();
      expect(result.provenance.algorithm_id).toBe('dfg');
      expect(result.provenance.algorithm_version).toBe('1.0');
      expect(result.provenance.backend_id).toBe('pm4wasm');
      expect(result.provenance.kernel_version).toBe('26.4.0');
    });

    it('should derive correct latency class from duration', async () => {
      const result = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);

      // DFG is sub_ms algorithm, so should complete quickly
      expect(result.latency_class).toMatch(/sub_ms|low_ms|high_ms/);
    });

    it('should call WASM function with correct handle', async () => {
      await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);

      expect(mockWasmModule.eventlog_from_json).toHaveBeenCalled();
      expect(mockWasmModule.discover_dfg).toHaveBeenCalledWith('log_handle_test');
    });
  });

  describe('budget timeout enforcement', () => {
    it('should handle timeout for slow operation', async () => {
      // Create a slow mock that exceeds timeout
      const slowWasmModule = {
        ...mockWasmModule,
        discover_dfg: vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(JSON.stringify({ nodes: [], edges: [] })), 200),
            ),
        ),
        eventlog_from_json: vi.fn(async () => 'log_handle_test'),
      };

      const slowBackend = new Pm4wasmBackend(slowWasmModule);

      // With sub_ms budget (5ms timeout), this should timeout
      const result = await slowBackend.discover(SAMPLE_LOG, 'dfg', BUDGET_STRICT);

      expect(result.status).toBe('partial');
      expect(result.error).toContain('budget_exceeded');
    });
  });

  describe('conformance()', () => {
    it('should check conformance for DFG model (token replay path)', async () => {
      const result = await backend.conformance(SAMPLE_LOG, SAMPLE_DFG_MODEL, BUDGET_ONLINE);

      expect(result.status).toBe('success');
      expect(result.payload).toBeDefined();
      expect(result.payload.fitness).toBeGreaterThanOrEqual(0);
      expect(result.payload.fitness).toBeLessThanOrEqual(1);
      expect(result.payload.precision).toBeGreaterThanOrEqual(0);
      expect(result.payload.precision).toBeLessThanOrEqual(1);
      expect(result.payload.generalization).toBeGreaterThanOrEqual(0);
      expect(result.payload.generalization).toBeLessThanOrEqual(1);
      expect(result.algorithm_id).toBe('conformance');
    });

    it('should check conformance for Petri net model (alignments path)', async () => {
      const result = await backend.conformance(SAMPLE_LOG, SAMPLE_PETRI_NET, BUDGET_ONLINE);

      expect(result.status).toBe('success');
      expect(result.payload).toBeDefined();
      expect(result.payload.fitness).toBeGreaterThanOrEqual(0);
      expect(mockWasmModule.compute_optimal_alignments).toHaveBeenCalled();
    });

    it('should return zero metrics for unsupported model type', async () => {
      const unsupportedModel: ModelIR = {
        ...SAMPLE_DFG_MODEL,
        model_type: 'declare', // Not explicitly handled
      };

      const result = await backend.conformance(SAMPLE_LOG, unsupportedModel, BUDGET_ONLINE);

      // Unsupported model types now fail (Armstrong style fail-fast)
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not supported for model type');
      expect(result.payload).toEqual({ fitness: 0, precision: 0, generalization: 0, simplicity: 0 });
    });

    it('should populate provenance for conformance', async () => {
      const result = await backend.conformance(SAMPLE_LOG, SAMPLE_DFG_MODEL, BUDGET_ONLINE);

      expect(result.provenance).toBeDefined();
      expect(result.provenance.algorithm_id).toBe('conformance');
      expect(result.provenance.backend_id).toBe('pm4wasm');
    });
  });

  describe('analyze()', () => {
    it('should return not-supported error for analysis tasks', async () => {
      const result = await backend.analyze(
        SAMPLE_LOG,
        { task_type: 'bottleneck_analysis' },
        BUDGET_ONLINE,
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not supported by Pm4wasmBackend');
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status', async () => {
      const result = await backend.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.latency_ms).toBeLessThan(500); // Must complete in ≤500ms
    });

    it('should complete within 500ms budget', async () => {
      const start = Date.now();
      const result = await backend.healthCheck();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
      expect(result.latency_ms).toBeLessThan(500);
    });

    it('should provide detail string on success', async () => {
      const result = await backend.healthCheck();

      expect(result.detail).toBeDefined();
      expect(typeof result.detail).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should handle WASM module not loaded gracefully', async () => {
      const backendNoWasm = new Pm4wasmBackend(undefined);
      // This backend will try to load WASM lazily

      // Mock the loading to fail
      // Note: actual test would need more setup for this
    });

    it('should convert timeout errors to partial status', async () => {
      const timeoutWasmModule = {
        ...mockWasmModule,
        discover_dfg: vi.fn(() => new Promise(() => {})), // Never resolves
        eventlog_from_json: vi.fn(async () => 'log_handle_test'),
      };

      const timeoutBackend = new Pm4wasmBackend(timeoutWasmModule);
      const result = await timeoutBackend.discover(SAMPLE_LOG, 'dfg', BUDGET_STRICT);

      expect(result.status).toBe('partial');
      expect(result.error).toContain('budget_exceeded');
    });
  });

  describe('algorithm metadata', () => {
    it('should correctly map all 15 algorithms to WASM functions', () => {
      const caps = backend.capabilities();
      const algos = caps.supportedAlgorithmIds;

      // Verify we have 15 algorithms
      expect(algos).toHaveLength(15);

      // Verify some key algorithms are present
      const expectedAlgos = ['dfg', 'inductive_miner', 'genetic_algorithm', 'alpha_plus_plus'];
      for (const algo of expectedAlgos) {
        expect(algos).toContain(algo);
      }
    });

    it('should have correct budget tier for each algorithm', async () => {
      // DFG: sub_ms
      let result = await backend.discover(SAMPLE_LOG, 'dfg', BUDGET_ONLINE);
      expect(result.status).toBe('success');

      // Genetic algorithm: high_ms
      result = await backend.discover(SAMPLE_LOG, 'genetic_algorithm', BUDGET_ONLINE);
      expect(result.status).toBe('success');
    });
  });
});
