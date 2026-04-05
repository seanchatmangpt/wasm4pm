import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Kernel } from '../src/api';
import { KernelError } from '../src/errors';
import { KERNEL_VERSION } from '../src/versioning';
import type { KernelWasmModule } from '../src/api';

/**
 * Create a mock WASM module for testing
 */
function createMockWasm(overrides: Partial<KernelWasmModule> = {}): KernelWasmModule {
  let handleCounter = 0;
  const makeHandle = () => ({ handle: `obj_${++handleCounter}` });

  return {
    init: vi.fn(async () => {}),
    get_version: vi.fn(() => '26.4.5'),
    delete_object: vi.fn(),
    clear_all_objects: vi.fn(),

    discover_dfg: vi.fn(async () => makeHandle()),
    discover_ocel_dfg: vi.fn(async () => makeHandle()),
    discover_ocel_dfg_per_type: vi.fn(async () => makeHandle()),
    discover_alpha_plus_plus: vi.fn(async () => makeHandle()),
    discover_heuristic_miner: vi.fn(async () => makeHandle()),
    discover_inductive_miner: vi.fn(async () => makeHandle()),
    discover_genetic_algorithm: vi.fn(async () => makeHandle()),
    discover_pso_algorithm: vi.fn(async () => makeHandle()),
    discover_astar: vi.fn(async () => makeHandle()),
    discover_hill_climbing: vi.fn(async () => makeHandle()),
    discover_ilp_petri_net: vi.fn(async () => makeHandle()),
    discover_ant_colony: vi.fn(async () => makeHandle()),
    discover_simulated_annealing: vi.fn(async () => makeHandle()),
    discover_declare: vi.fn(async () => makeHandle()),
    discover_optimized_dfg: vi.fn(async () => makeHandle()),
    ...overrides,
  };
}

describe('Kernel', () => {
  let kernel: Kernel;
  let mockWasm: KernelWasmModule;

  beforeEach(() => {
    mockWasm = createMockWasm();
    kernel = new Kernel(mockWasm);
  });

  describe('version()', () => {
    it('should return the kernel version', () => {
      expect(kernel.version()).toBe(KERNEL_VERSION);
    });

    it('should return a valid semver string', () => {
      expect(kernel.version()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('checkCompatibility()', () => {
    it('should be compatible with same version', () => {
      const result = kernel.checkCompatibility(KERNEL_VERSION);
      expect(result.compatible).toBe(true);
    });

    it('should be compatible with lower minor version', () => {
      const result = kernel.checkCompatibility('26.0.0');
      expect(result.compatible).toBe(true);
    });

    it('should be incompatible with different major version', () => {
      const result = kernel.checkCompatibility('25.0.0');
      expect(result.compatible).toBe(false);
    });
  });

  describe('algorithms()', () => {
    it('should list all registered algorithms', () => {
      const algos = kernel.algorithms();
      expect(algos.length).toBeGreaterThanOrEqual(14);
    });

    it('should include DFG', () => {
      expect(kernel.algorithms().some((a) => a.id === 'dfg')).toBe(true);
    });

    it('should include Alpha++', () => {
      expect(kernel.algorithms().some((a) => a.id === 'alpha_plus_plus')).toBe(true);
    });

    it('should include genetic algorithm', () => {
      expect(kernel.algorithms().some((a) => a.id === 'genetic_algorithm')).toBe(true);
    });
  });

  describe('algorithmsForProfile()', () => {
    it('should return fast algorithms', () => {
      const fast = kernel.algorithmsForProfile('fast');
      expect(fast.length).toBeGreaterThan(0);
      expect(fast.some((a) => a.id === 'dfg')).toBe(true);
    });

    it('should return quality algorithms', () => {
      const quality = kernel.algorithmsForProfile('quality');
      expect(quality.some((a) => a.id === 'genetic_algorithm')).toBe(true);
    });
  });

  describe('algorithm()', () => {
    it('should look up a specific algorithm', () => {
      const meta = kernel.algorithm('dfg');
      expect(meta).toBeDefined();
      expect(meta?.name).toContain('DFG');
    });

    it('should return undefined for unknown algorithm', () => {
      expect(kernel.algorithm('nonexistent')).toBeUndefined();
    });
  });

  describe('init()', () => {
    it('should call WASM init', async () => {
      await kernel.init();
      expect(mockWasm.init).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      await kernel.init();
      await kernel.init();
      expect(mockWasm.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('run()', () => {
    beforeEach(async () => {
      await kernel.init();
    });

    it('should run DFG discovery', async () => {
      const result = await kernel.run('dfg', 'log_1');
      expect(result.handle).toMatch(/^obj_/);
      expect(result.algorithm).toBe('dfg');
      expect(result.outputType).toBe('dfg');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should run Alpha++ discovery', async () => {
      const result = await kernel.run('alpha_plus_plus', 'log_1');
      expect(result.algorithm).toBe('alpha_plus_plus');
      expect(result.outputType).toBe('petrinet');
    });

    it('should pass parameters to heuristic miner', async () => {
      await kernel.run('heuristic_miner', 'log_1', { dependency_threshold: 0.7 });
      expect(mockWasm.discover_heuristic_miner).toHaveBeenCalledWith(
        'log_1',
        'concept:name',
        0.7
      );
    });

    it('should pass parameters to genetic algorithm', async () => {
      await kernel.run('genetic_algorithm', 'log_1', {
        population_size: 100,
        generations: 200,
      });
      expect(mockWasm.discover_genetic_algorithm).toHaveBeenCalledWith(
        'log_1',
        'concept:name',
        100,
        200
      );
    });

    it('should use default parameters when not specified', async () => {
      await kernel.run('heuristic_miner', 'log_1');
      expect(mockWasm.discover_heuristic_miner).toHaveBeenCalledWith(
        'log_1',
        'concept:name',
        0.5
      );
    });

    it('should throw for unknown algorithm', async () => {
      await expect(kernel.run('nonexistent', 'log_1')).rejects.toThrow(KernelError);
      await expect(kernel.run('nonexistent', 'log_1')).rejects.toThrow('Algorithm not found');
    });

    it('should throw when not initialized', async () => {
      const uninitKernel = new Kernel(createMockWasm());
      await expect(uninitKernel.run('dfg', 'log_1')).rejects.toThrow('not initialized');
    });

    it('should produce deterministic hash for same params', async () => {
      // Need a deterministic mock that returns same handle
      const deterministicWasm = createMockWasm({
        discover_dfg: vi.fn(async () => ({ handle: 'obj_fixed' })),
      });
      const k = new Kernel(deterministicWasm);
      await k.init();

      const r1 = await k.run('dfg', 'log_1', { activity_key: 'concept:name' });
      k.reset(); // Clear cache so it re-runs
      const r2 = await k.run('dfg', 'log_1', { activity_key: 'concept:name' });
      expect(r1.hash).toBe(r2.hash);
    });

    it('should cache identical runs', async () => {
      const wasm = createMockWasm({
        discover_dfg: vi.fn(async () => ({ handle: 'obj_cached' })),
      });
      const k = new Kernel(wasm);
      await k.init();

      await k.run('dfg', 'log_1');
      await k.run('dfg', 'log_1');
      expect(wasm.discover_dfg).toHaveBeenCalledTimes(1);
      expect(k.stats().cacheHits).toBe(1);
    });

    it('should wrap WASM errors in KernelError', async () => {
      const failingWasm = createMockWasm({
        discover_dfg: vi.fn(async () => {
          throw new Error('Handle not found: log_1');
        }),
      });
      const k = new Kernel(failingWasm);
      await k.init();

      await expect(k.run('dfg', 'log_1')).rejects.toThrow(KernelError);
    });

    it('should run all algorithm types', async () => {
      const algorithms = [
        'dfg', 'process_skeleton', 'alpha_plus_plus', 'heuristic_miner',
        'inductive_miner', 'genetic_algorithm', 'pso', 'a_star',
        'hill_climbing', 'ilp', 'aco', 'simulated_annealing',
        'declare', 'optimized_dfg',
      ];

      for (const algo of algorithms) {
        const result = await kernel.run(algo, 'log_1');
        expect(result.handle).toBeDefined();
        expect(result.algorithm).toBe(algo);
      }
    });
  });

  describe('stream()', () => {
    beforeEach(async () => {
      await kernel.init();
    });

    it('should yield progress events', async () => {
      const events: Array<{ progress: number; done: boolean }> = [];

      for await (const event of kernel.stream('dfg', 'log_1')) {
        events.push({ progress: event.progress, done: event.done });
      }

      expect(events.length).toBe(3);
      expect(events[0].progress).toBe(0);
      expect(events[0].done).toBe(false);
      expect(events[events.length - 1].progress).toBe(1);
      expect(events[events.length - 1].done).toBe(true);
    });

    it('should include handle in final event', async () => {
      let finalHandle: string | undefined;

      for await (const event of kernel.stream('dfg', 'log_1')) {
        if (event.done) {
          finalHandle = event.handle;
        }
      }

      expect(finalHandle).toMatch(/^obj_/);
    });
  });

  describe('freeHandle()', () => {
    beforeEach(async () => {
      await kernel.init();
    });

    it('should call delete_object on WASM module', async () => {
      const result = await kernel.run('dfg', 'log_1');
      kernel.freeHandle(result.handle);
      expect(mockWasm.delete_object).toHaveBeenCalledWith(result.handle);
    });

    it('should remove handle from tracking', async () => {
      const result = await kernel.run('dfg', 'log_1');
      expect(kernel.stats().activeHandles).toBe(1);
      kernel.freeHandle(result.handle);
      expect(kernel.stats().activeHandles).toBe(0);
    });

    it('should be safe to call twice on same handle', async () => {
      const result = await kernel.run('dfg', 'log_1');
      kernel.freeHandle(result.handle);
      kernel.freeHandle(result.handle); // no error
      expect(mockWasm.delete_object).toHaveBeenCalledTimes(1);
    });

    it('should be safe to call on unknown handle', () => {
      kernel.freeHandle('nonexistent');
      expect(mockWasm.delete_object).not.toHaveBeenCalled();
    });
  });

  describe('stats()', () => {
    it('should report uninitialized state', () => {
      const stats = kernel.stats();
      expect(stats.initialized).toBe(false);
      expect(stats.activeHandles).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.cacheHits).toBe(0);
    });

    it('should report initialized state', async () => {
      await kernel.init();
      expect(kernel.stats().initialized).toBe(true);
    });

    it('should track runs', async () => {
      await kernel.init();
      await kernel.run('dfg', 'log_1');
      await kernel.run('alpha_plus_plus', 'log_1');
      expect(kernel.stats().totalRuns).toBe(2);
    });

    it('should track active handles', async () => {
      await kernel.init();
      const r1 = await kernel.run('dfg', 'log_1');
      const r2 = await kernel.run('alpha_plus_plus', 'log_1');
      expect(kernel.stats().activeHandles).toBe(2);

      kernel.freeHandle(r1.handle);
      expect(kernel.stats().activeHandles).toBe(1);
    });

    it('should report uptime', async () => {
      await kernel.init();
      expect(kernel.stats().uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset()', () => {
    it('should clear caches and counters', async () => {
      await kernel.init();
      await kernel.run('dfg', 'log_1');

      kernel.reset();
      const stats = kernel.stats();
      expect(stats.activeHandles).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.cacheHits).toBe(0);
    });
  });
});
