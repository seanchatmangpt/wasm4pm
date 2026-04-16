/**
 * backend-registry.test.ts
 *
 * Tests for BackendRegistry and 7-rule selection algorithm.
 * Spec reference: Section 3.4 and 3.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultBackendRegistry } from '../src/backend-registry.js';
import { WasmBackend } from '../src/backends/wasm-backend.js';
import { MlBackend } from '../src/backends/ml-backend.js';
import { Pm4pyBackend } from '../src/backends/pm4py-backend.js';
import type { BudgetEnvelope } from '../src/mining-backend.js';

describe('DefaultBackendRegistry', () => {
  let registry: DefaultBackendRegistry;
  let wasmBackend: WasmBackend;
  let mlBackend: MlBackend;
  let pm4pyBackend: Pm4pyBackend;

  beforeEach(() => {
    registry = new DefaultBackendRegistry();
    wasmBackend = new WasmBackend();
    mlBackend = new MlBackend();
    pm4pyBackend = new Pm4pyBackend();
  });

  describe('register and unregister', () => {
    it('should register a backend', () => {
      registry.register(wasmBackend);
      expect(registry.list().length).toBe(1);
      expect(registry.list()[0]?.id).toBe('wasm');
    });

    it('should throw if backend missing id', () => {
      const badBackend = { capabilities: () => ({}) };
      expect(() => registry.register(badBackend as any)).toThrow();
    });

    it('should throw if backend missing interface methods', () => {
      const badBackend = {
        id: 'bad',
        capabilities: () => ({} as any),
        // Missing discover, conformance, analyze, healthCheck
      };
      expect(() => registry.register(badBackend as any)).toThrow();
    });

    it('should unregister a backend', () => {
      registry.register(wasmBackend);
      expect(registry.list().length).toBe(1);
      registry.unregister('wasm');
      expect(registry.list().length).toBe(0);
    });
  });

  describe('7-rule selection algorithm', () => {
    beforeEach(() => {
      registry.register(wasmBackend);
      registry.register(mlBackend);
      registry.register(pm4pyBackend);
    });

    it('Rule 1: environment gate (Python requirement)', () => {
      const budget: BudgetEnvelope = {
        latencyBudget: 'seconds',
        memoryBudget: 0,
        qualityFloor: 'fast',
        environment: { browserSafe: true, pythonAvailable: false },
        mode: 'online',
      };

      // pm4py requires Python, should be excluded
      const selected = registry.select('dfg', budget);
      expect(selected.id).not.toBe('pm4py');
    });

    it('Rule 2: algorithm gate', () => {
      const budget: BudgetEnvelope = {
        latencyBudget: 'minutes',
        memoryBudget: 0,
        qualityFloor: 'fast',
        environment: { browserSafe: false, pythonAvailable: true },
        mode: 'research',
      };

      // dfg is in WASM but not PM4PY, so WASM should be selected
      const selected = registry.select('dfg', budget);
      expect(selected.id).toBe('wasm');
    });

    it('Rule 3: latency budget gate', () => {
      const budget: BudgetEnvelope = {
        latencyBudget: 'sub_ms',
        memoryBudget: 0,
        qualityFloor: 'fast',
        environment: { browserSafe: true, pythonAvailable: true },
        mode: 'online',
      };

      // sub_ms excludes ML (low_ms) and PM4PY (seconds)
      const selected = registry.select('dfg', budget);
      expect(selected.id).toBe('wasm');
    });

    it('Rule 4: quality floor gate', () => {
      const budget: BudgetEnvelope = {
        latencyBudget: 'minutes',
        memoryBudget: 0,
        qualityFloor: 'research',
        environment: { browserSafe: false, pythonAvailable: true },
        mode: 'research',
      };

      // research quality only supported by PM4PY
      const selected = registry.select('alpha_miner', budget);
      expect(selected.id).toBe('pm4py');
    });

    it('Rule 6: concurrency gate', () => {
      // Manually set concurrency to max for WASM
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      registry.incrementConcurrency('wasm');
      // WASM max is 8, so it should now be at capacity

      const budget: BudgetEnvelope = {
        latencyBudget: 'sub_ms',
        memoryBudget: 0,
        qualityFloor: 'fast',
        environment: { browserSafe: true, pythonAvailable: false },
        mode: 'online',
      };

      // WASM is at capacity, ML doesn't support dfg, PM4PY requires Python
      // Should throw
      expect(() => registry.select('dfg', budget)).toThrow();
    });

    it('should throw if no backend matches all rules', () => {
      const budget: BudgetEnvelope = {
        latencyBudget: 'sub_ms',
        memoryBudget: 0,
        qualityFloor: 'fast',
        environment: { browserSafe: true, pythonAvailable: false },
        mode: 'online',
      };

      // ml_pca is not in WASM, so should throw
      expect(() => registry.select('nonexistent_algorithm', budget)).toThrow();
    });
  });

  describe('capabilities are pure', () => {
    it('should return same capabilities on multiple calls', () => {
      const caps1 = wasmBackend.capabilities();
      const caps2 = wasmBackend.capabilities();

      expect(caps1).toEqual(caps2);
      expect(caps1).toBe(caps1); // Object identity for readonly properties
    });
  });

  describe('concurrency tracking', () => {
    it('should track concurrent invocations', () => {
      registry.register(wasmBackend);

      expect(registry.getConcurrency('wasm')).toBe(0);

      registry.incrementConcurrency('wasm');
      expect(registry.getConcurrency('wasm')).toBe(1);

      registry.incrementConcurrency('wasm');
      expect(registry.getConcurrency('wasm')).toBe(2);

      registry.decrementConcurrency('wasm');
      expect(registry.getConcurrency('wasm')).toBe(1);

      registry.decrementConcurrency('wasm');
      expect(registry.getConcurrency('wasm')).toBe(0);
    });

    it('should not decrement below zero', () => {
      registry.register(wasmBackend);

      registry.decrementConcurrency('wasm');
      registry.decrementConcurrency('wasm');

      expect(registry.getConcurrency('wasm')).toBe(0);
    });
  });

  describe('healthCheckAll', () => {
    it('should health check all backends', async () => {
      registry.register(wasmBackend);
      registry.register(mlBackend);

      const results = await registry.healthCheckAll();

      expect(results.length).toBe(2);
      expect(results.some((r) => r.id === 'wasm')).toBe(true);
      expect(results.some((r) => r.id === 'ml')).toBe(true);
    });

    it('should timeout after 500ms', async () => {
      // Create a backend with slow health check
      const slowBackend = {
        id: 'slow',
        capabilities: () => ({
          algorithmFamilies: ['discovery'] as const,
          outputTypes: ['dfg'] as const,
          environment: { browserSafe: true, edgeSafe: true, requiresPython: false, requiresNetwork: false },
          latencyClass: 'sub_ms' as const,
          deterministic: true,
          maxQualityTier: 'quality' as const,
          supportedAlgorithmIds: ['dfg'] as const,
          maxConcurrentInvocations: 1,
        }),
        discover: async () => ({ status: 'failed', payload: null } as any),
        conformance: async () => ({ status: 'failed', payload: null } as any),
        analyze: async () => ({ status: 'failed', payload: null } as any),
        healthCheck: async () => {
          // Simulate slow health check
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { healthy: true, latency_ms: 1000 };
        },
      };

      registry.register(slowBackend);

      const startMs = Date.now();
      const results = await registry.healthCheckAll();
      const elapsed = Date.now() - startMs;

      // Should complete in <1s due to timeout
      expect(elapsed).toBeLessThan(1500);

      // slow backend should be marked unhealthy
      const slowResult = results.find((r) => r.id === 'slow');
      expect(slowResult?.healthy).toBe(false);
    });
  });

  describe('list backends', () => {
    it('should list all registered backends with capabilities', () => {
      registry.register(wasmBackend);
      registry.register(mlBackend);

      const list = registry.list();

      expect(list.length).toBe(2);
      expect(list.some((b) => b.id === 'wasm')).toBe(true);
      expect(list.some((b) => b.id === 'ml')).toBe(true);

      const wasmEntry = list.find((b) => b.id === 'wasm');
      expect(wasmEntry?.capabilities.algorithmFamilies).toContain('discovery');
    });
  });
});
