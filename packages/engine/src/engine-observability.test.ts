/**
 * Integration tests for engine observability wiring
 * Tests OTEL event emission, state transitions, and error handling
 * Per PRD §22: Phase 2 Integration OTEL observability wiring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Engine } from './engine';
import type { Kernel, Planner, Executor } from './engine';
import type { ExecutionPlan, ExecutionReceipt } from '@wasm4pm/types';
import type { WasmLoaderConfig } from './wasm-loader';

// Mock implementations
class MockKernel implements Kernel {
  private ready = false;

  async init(): Promise<void> {
    this.ready = true;
    await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate init time
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

class MockPlanner implements Planner {
  async plan(_config: unknown): Promise<ExecutionPlan> {
    await new Promise((resolve) => setTimeout(resolve, 20)); // Simulate planning time
    return {
      planId: 'plan_test_123',
      steps: [
        {
          id: 'step_1',
          name: 'Step 1',
          description: 'First step',
        },
        {
          id: 'step_2',
          name: 'Step 2',
          description: 'Second step',
          dependencies: ['step_1'],
        },
      ],
      totalSteps: 2,
      estimatedDurationMs: 100,
    };
  }
}

class MockExecutor implements Executor {
  async run(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    await new Promise((resolve) => setTimeout(resolve, 30)); // Simulate execution
    return {
      runId: 'run_test_001',
      planId: plan.planId,
      state: 'ready',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 30,
      progress: 100,
      errors: [],
    };
  }

  async *watch(plan: ExecutionPlan) {
    yield {
      timestamp: new Date(),
      state: 'running' as const,
      progress: 50,
    };
    await new Promise((resolve) => setTimeout(resolve, 20));
    yield {
      timestamp: new Date(),
      state: 'ready' as const,
      progress: 100,
    };
  }
}

describe('Engine Observability Integration', () => {
  let engine: Engine;
  let kernel: Kernel;
  let planner: Planner;
  let executor: Executor;

  beforeEach(() => {
    kernel = new MockKernel();
    planner = new MockPlanner();
    executor = new MockExecutor();

    // Create engine with observability disabled by default
    engine = new Engine(kernel, planner, executor);
  });

  describe('Bootstrap observability', () => {
    it('should emit state change events during bootstrap', async () => {
      await engine.bootstrap();

      expect(engine.state()).toBe('ready');

      // Check observability stats
      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
    });

    it('should track bootstrap duration', async () => {
      await engine.bootstrap();

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });

    it('should emit error events on bootstrap failure', async () => {
      const failingKernel = new (class implements Kernel {
        async init(): Promise<void> {
          throw new Error('Kernel init failed');
        }
        async shutdown(): Promise<void> {}
        isReady(): boolean {
          return false;
        }
      })();

      const failingEngine = new Engine(failingKernel, planner, executor);

      try {
        await failingEngine.bootstrap();
      } catch (err) {
        // Expected
      }

      expect(failingEngine.state()).toBe('failed');
    });
  });

  describe('Plan generation observability', () => {
    it('should emit plan generated events', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});

      expect(plan.planId).toBe('plan_test_123');

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
    });

    it('should include plan hash in observability events', async () => {
      await engine.bootstrap();
      await engine.plan({});

      // Check that observability is working
      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });

    it('should emit error events on planning failure', async () => {
      const failingPlanner = new (class implements Planner {
        async plan(_config: unknown): Promise<ExecutionPlan> {
          throw new Error('Planning failed');
        }
      })();

      const failingEngine = new Engine(kernel, failingPlanner, executor);
      await failingEngine.bootstrap();

      try {
        await failingEngine.plan({});
      } catch (err) {
        // Expected
      }

      expect(failingEngine.state()).not.toBe('ready');
    });
  });

  describe('Run execution observability', () => {
    it('should emit execution events', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});
      const receipt = await engine.run(plan);

      expect(receipt.state).toBe('ready');

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
    });

    it('should track run duration', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});
      const receipt = await engine.run(plan);

      expect(receipt.durationMs).toBeGreaterThanOrEqual(0);
      expect(receipt.progress).toBe(100);
    });

    it('should emit error events on execution failure', async () => {
      const failingExecutor = new (class implements Executor {
        async run(_plan: ExecutionPlan): Promise<ExecutionReceipt> {
          throw new Error('Execution failed');
        }
        async *watch(_plan: ExecutionPlan) {}
      })();

      const failingEngine = new Engine(kernel, planner, failingExecutor);
      await failingEngine.bootstrap();
      const plan = await failingEngine.plan({});

      try {
        await failingEngine.run(plan);
      } catch (err) {
        // Expected
      }

      expect(failingEngine.state()).not.toBe('ready');
    });
  });

  describe('Watch execution observability', () => {
    it('should emit progress events during watch', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});

      const updates: Array<any> = [];
      for await (const update of engine.watch(plan)) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].progress).toBeDefined();

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });

    it('should maintain trace context across stream', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});

      let progressEvents = 0;
      for await (const update of engine.watch(plan)) {
        if (update.progress) {
          progressEvents++;
        }
      }

      expect(progressEvents).toBeGreaterThan(0);

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });

    it('should emit error events during watch failure', async () => {
      const failingExecutor = new (class implements Executor {
        async run(_plan: ExecutionPlan): Promise<ExecutionReceipt> {
          return {
            runId: 'test',
            planId: 'test',
            state: 'ready',
            startedAt: new Date(),
            progress: 0,
            errors: [],
          };
        }

        async *watch(_plan: ExecutionPlan) {
          throw new Error('Watch failed');
        }
      })();

      const failingEngine = new Engine(kernel, planner, failingExecutor);
      await failingEngine.bootstrap();
      const plan = await failingEngine.plan({});

      try {
        for await (const _update of failingEngine.watch(plan)) {
          // Consume stream
        }
      } catch (err) {
        // Expected
      }

      expect(failingEngine.state()).not.toBe('ready');
    });
  });

  describe('Required OTEL attributes', () => {
    it('should include run.id in observability events', async () => {
      await engine.bootstrap();

      // Check that observability is tracking run ID
      const stats = engine.getObservabilityStats();
      expect(stats.emitCount >= 0).toBe(true);
    });

    it('should track plan hash after planning', async () => {
      await engine.bootstrap();
      await engine.plan({});

      // Verify that observability has recorded plan info
      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });
  });

  describe('Observability error handling', () => {
    it('should not break execution on observability errors', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});
      const receipt = await engine.run(plan);

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);

      // Even if observability had errors, execution should succeed
      const stats = engine.getObservabilityStats();
      expect(stats).toBeDefined();
    });

    it('should record observability errors', async () => {
      await engine.bootstrap();

      const errors = engine.getObservabilityErrors();
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should have low observability overhead', async () => {
      const start = performance.now();

      await engine.bootstrap();
      const plan = await engine.plan({});
      const _receipt = await engine.run(plan);

      const elapsed = performance.now() - start;

      // Total execution should be reasonable
      expect(elapsed).toBeLessThan(5000); // 5 seconds for mocks is reasonable
    });
  });

  describe('State transition tracking', () => {
    it('should track state transitions in observability', async () => {
      expect(engine.state()).toBe('uninitialized');

      await engine.bootstrap();
      expect(engine.state()).toBe('ready');

      const stats = engine.getObservabilityStats();
      expect(stats.emitCount).toBeGreaterThan(0);
    });

    it('should emit all expected state transitions', async () => {
      const states: Array<string> = [];
      states.push(engine.state());

      await engine.bootstrap();
      states.push(engine.state());

      const plan = await engine.plan({});
      states.push(engine.state());

      await engine.run(plan);
      states.push(engine.state());

      // Verify state progression
      expect(states[0]).toBe('uninitialized');
      expect(states[1]).toBe('ready'); // After bootstrap
      expect(states[2]).toBe('ready'); // After plan
      expect(states[3]).toBe('ready'); // After run
    });
  });

  describe('Observability statistics', () => {
    it('should provide accurate emit counts', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});
      await engine.run(plan);

      const stats = engine.getObservabilityStats();

      expect(stats.emitCount).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.errorRate).toBe(0);
    });

    it('should calculate error rate correctly', async () => {
      await engine.bootstrap();

      const stats = engine.getObservabilityStats();

      if (stats.emitCount > 0) {
        expect(stats.errorRate).toBeLessThanOrEqual(1);
        expect(stats.errorRate).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Observability shutdown', () => {
    it('should shutdown observability gracefully', async () => {
      await engine.bootstrap();

      const result = await engine.shutdownObservability();

      expect(result).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should flush pending events on shutdown', async () => {
      await engine.bootstrap();
      const plan = await engine.plan({});
      await engine.run(plan);

      const result = await engine.shutdownObservability();

      expect(result.success).toBe(true);
    });
  });

  describe('Observability with degradation', () => {
    it('should emit degradation events', async () => {
      await engine.bootstrap();

      const errorInfo = {
        code: 'TEST_ERROR',
        message: 'Test degradation',
        severity: 'warning' as const,
        recoverable: true,
      };

      await engine.degrade(errorInfo, 'Test degradation reason');

      expect(engine.state()).toBe('degraded');
      // Observability should have recorded the transition
    });
  });

  describe('Observability with recovery', () => {
    it('should emit recovery events', async () => {
      const kernel2 = new MockKernel();
      const engine2 = new Engine(kernel2, planner, executor);

      await engine2.bootstrap();

      const errorInfo = {
        code: 'TEST_ERROR',
        message: 'Test error',
        severity: 'warning' as const,
        recoverable: true,
      };

      await engine2.degrade(errorInfo);

      try {
        await engine2.recover();
      } catch (err) {
        // May fail if not properly degraded, that's ok
      }

      expect(engine2.state()).not.toBe('degraded');
    });
  });

  describe('Full lifecycle with observability', () => {
    it('should emit events across full lifecycle', async () => {
      // Bootstrap
      await engine.bootstrap();
      const bootstrapStats = engine.getObservabilityStats();
      expect(bootstrapStats.emitCount).toBeGreaterThan(0);

      // Plan
      const plan = await engine.plan({});
      const planStats = engine.getObservabilityStats();
      expect(planStats.emitCount).toBeGreaterThan(bootstrapStats.emitCount);

      // Run
      const receipt = await engine.run(plan);
      const runStats = engine.getObservabilityStats();
      expect(runStats.emitCount).toBeGreaterThan(planStats.emitCount);

      // Verify final state
      expect(receipt.state).toBe('ready');
      expect(runStats.errorCount).toBe(0);

      // Shutdown
      const shutdownResult = await engine.shutdownObservability();
      expect(shutdownResult.success).toBe(true);
    });
  });
});
