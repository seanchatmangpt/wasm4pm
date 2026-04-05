/**
 * execution.test.ts
 * Comprehensive tests for plan execution, topological sort, and step dispatch
 * Tests cover: linear dependencies, parallel branches, failures, large plans
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  executePlan,
  topologicalSortPlan,
  validatePlan,
  createStepDispatcher,
} from '../src/execution';
import type {
  ExecutionContext,
  StepDispatcher,
  StepHandler,
  StepResult,
} from '../src/execution';
import type { ExecutionPlan, PlanStep, StatusUpdate } from '@wasm4pm/types';

/**
 * Helper to create a test plan
 */
function createTestPlan(
  steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'> & {
    name?: string;
    optional?: boolean;
  }[]
): ExecutionPlan {
  return {
    planId: `test_plan_${Math.random()}`,
    steps: steps.map((s) => ({
      id: s.id,
      name: s.name || s.id,
      description: s.description,
      inputs: {},
      outputs: [],
      dependencies: s.dependencies || [],
      optional: s.optional || false,
      timeout: 5000,
    })),
    totalSteps: steps.length,
  };
}

/**
 * Helper to create a mock step handler
 */
function createMockHandler(
  options: {
    shouldFail?: boolean;
    delayMs?: number;
    output?: Record<string, unknown>;
  } = {}
): StepHandler {
  return async (step: PlanStep, context: ExecutionContext): Promise<StepResult> => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (options.shouldFail) {
      return {
        stepId: step.id,
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: `Handler failed for step ${step.id}`,
          severity: 'error',
          recoverable: false,
        },
      };
    }

    return {
      stepId: step.id,
      success: true,
      output: options.output || { stepId: step.id },
    };
  };
}

describe('Plan Execution', () => {
  describe('validatePlan() - Plan validation', () => {
    it('should accept valid plan with single step', () => {
      const plan = createTestPlan([{ id: 'step_1', description: 'First step' }]);
      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid plan with linear dependencies', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
      ]);
      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid plan with parallel branches', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2a', description: 'Branch A', dependencies: ['step_1'] },
        { id: 'step_2b', description: 'Branch B', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Join', dependencies: ['step_2a', 'step_2b'] },
      ]);
      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);
    });

    it('should reject plan with missing dependency', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['nonexistent'] },
      ]);
      const errors = validatePlan(plan);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('nonexistent');
    });

    it('should reject plan with circular dependency', () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [
          { id: 'step_1', name: 'One', dependencies: ['step_2'] },
          { id: 'step_2', name: 'Two', dependencies: ['step_1'] },
        ],
        totalSteps: 2,
      };
      const errors = validatePlan(plan);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('circular'))).toBe(true);
    });

    it('should reject plan with self-loop', () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [{ id: 'step_1', name: 'One', dependencies: ['step_1'] }],
        totalSteps: 1,
      };
      const errors = validatePlan(plan);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject plan with missing step ID', () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [{ id: '', name: 'Step', dependencies: [] }],
        totalSteps: 1,
      };
      const errors = validatePlan(plan);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('topologicalSortPlan() - Dependency ordering', () => {
    it('should sort single step', () => {
      const plan = createTestPlan([{ id: 'step_1', description: 'First' }]);
      const order = topologicalSortPlan(plan);
      expect(order).toEqual(['step_1']);
    });

    it('should sort linear dependencies', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
      ]);
      const order = topologicalSortPlan(plan);
      expect(order).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('should sort parallel branches correctly', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2a', description: 'Branch A', dependencies: ['step_1'] },
        { id: 'step_2b', description: 'Branch B', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Join', dependencies: ['step_2a', 'step_2b'] },
      ]);
      const order = topologicalSortPlan(plan);

      // step_1 must be first
      expect(order[0]).toBe('step_1');
      // step_3 must be last
      expect(order[3]).toBe('step_3');
      // step_2a and step_2b can be in any order (2, 3)
      expect(order.slice(1, 3)).toEqual(expect.arrayContaining(['step_2a', 'step_2b']));
    });

    it('should sort complex DAG', () => {
      const plan = createTestPlan([
        { id: 'a', description: 'A' },
        { id: 'b', description: 'B', dependencies: ['a'] },
        { id: 'c', description: 'C', dependencies: ['a'] },
        { id: 'd', description: 'D', dependencies: ['b', 'c'] },
        { id: 'e', description: 'E', dependencies: ['b'] },
        { id: 'f', description: 'F', dependencies: ['d', 'e'] },
      ]);
      const order = topologicalSortPlan(plan);

      // Verify ordering constraints
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('e'));
      expect(order.indexOf('d')).toBeLessThan(order.indexOf('f'));
      expect(order.indexOf('e')).toBeLessThan(order.indexOf('f'));
    });

    it('should throw on circular dependency', () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [
          { id: 'step_1', name: 'One', dependencies: ['step_2'] },
          { id: 'step_2', name: 'Two', dependencies: ['step_1'] },
        ],
        totalSteps: 2,
      };
      expect(() => topologicalSortPlan(plan)).toThrow();
    });

    it('should throw on invalid plan', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['nonexistent'] },
      ]);
      expect(() => topologicalSortPlan(plan)).toThrow();
    });

    it('should handle plan with no dependencies', () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second' },
        { id: 'step_3', description: 'Third' },
      ]);
      const order = topologicalSortPlan(plan);
      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(new Set(['step_1', 'step_2', 'step_3']));
    });
  });

  describe('createStepDispatcher() - Handler dispatch', () => {
    it('should dispatch to registered handler', async () => {
      const handler = vi.fn(createMockHandler());
      const dispatcher = createStepDispatcher(new Map([['test_step', handler]]));

      const step: PlanStep = {
        id: 'step_1',
        name: 'test_step',
        dependencies: [],
      };
      const context: ExecutionContext = {
        planId: 'plan_1',
        runId: 'run_1',
        stepIndex: 0,
        totalSteps: 1,
        previousResults: new Map(),
      };

      const result = await dispatcher.dispatch(step, context);

      expect(handler).toHaveBeenCalledWith(step, context);
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeDefined();
    });

    it('should use default handler for unknown step type', async () => {
      const dispatcher = createStepDispatcher(new Map());

      const step: PlanStep = {
        id: 'step_1',
        name: 'unknown_step',
        dependencies: [],
      };
      const context: ExecutionContext = {
        planId: 'plan_1',
        runId: 'run_1',
        stepIndex: 0,
        totalSteps: 1,
        previousResults: new Map(),
      };

      const result = await dispatcher.dispatch(step, context);

      expect(result.success).toBe(true);
      expect(result.stepId).toBe('step_1');
    });

    it('should measure handler execution time', async () => {
      const handler = createMockHandler({ delayMs: 100 });
      const dispatcher = createStepDispatcher(new Map([['slow_step', handler]]));

      const step: PlanStep = {
        id: 'step_1',
        name: 'slow_step',
        dependencies: [],
      };
      const context: ExecutionContext = {
        planId: 'plan_1',
        runId: 'run_1',
        stepIndex: 0,
        totalSteps: 1,
        previousResults: new Map(),
      };

      const result = await dispatcher.dispatch(step, context);

      expect(result.durationMs).toBeDefined();
      expect(result.durationMs! >= 100).toBe(true);
    });

    it('should catch handler errors', async () => {
      const errorHandler: StepHandler = async () => {
        throw new Error('Handler crashed');
      };
      const dispatcher = createStepDispatcher(new Map([['error_step', errorHandler]]));

      const step: PlanStep = {
        id: 'step_1',
        name: 'error_step',
        dependencies: [],
      };
      const context: ExecutionContext = {
        planId: 'plan_1',
        runId: 'run_1',
        stepIndex: 0,
        totalSteps: 1,
        previousResults: new Map(),
      };

      const result = await dispatcher.dispatch(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('crashed');
    });
  });

  describe('executePlan() - Full plan execution', () => {
    let dispatcher: StepDispatcher;

    beforeEach(() => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('default', createMockHandler());
      dispatcher = createStepDispatcher(handlers);
    });

    it('should execute simple linear plan', async () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['step_1'] },
      ]);

      const receipt = await executePlan(plan, dispatcher, 'run_1');

      expect(receipt.runId).toBe('run_1');
      expect(receipt.planId).toBe(plan.planId);
      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
      expect(receipt.errors).toHaveLength(0);
      expect(receipt.durationMs).toBeDefined();
    });

    it('should execute plan with parallel branches', async () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2a', description: 'Branch A', dependencies: ['step_1'] },
        { id: 'step_2b', description: 'Branch B', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Join', dependencies: ['step_2a', 'step_2b'] },
      ]);

      const receipt = await executePlan(plan, dispatcher, 'run_2');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
      expect(receipt.errors).toHaveLength(0);
    });

    it('should track progress during execution', async () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
      ]);

      const progressUpdates: Partial<StatusUpdate>[] = [];
      const onProgress = (update: Partial<StatusUpdate>) => {
        progressUpdates.push(update);
      };

      const receipt = await executePlan(plan, dispatcher, 'run_3', onProgress);

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Should track progress increasing
      const progresses = progressUpdates
        .filter((u) => u.progress !== undefined)
        .map((u) => u.progress!);
      expect(progresses.length).toBeGreaterThan(0);
      expect(progresses[progresses.length - 1]).toBe(100);
    });

    it('should handle step failure for required step', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('failing_step', createMockHandler({ shouldFail: true }));
      handlers.set('default', createMockHandler());
      const failingDispatcher = createStepDispatcher(handlers);

      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', name: 'failing_step', description: 'Fails', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
      ]);

      const receipt = await executePlan(plan, failingDispatcher, 'run_4');

      expect(receipt.state).toBe('failed');
      expect(receipt.errors.length).toBeGreaterThan(0);
      expect(receipt.progress).toBeLessThan(100);
    });

    it('should continue on optional step failure', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('failing_step', createMockHandler({ shouldFail: true }));
      handlers.set('default', createMockHandler());
      const failingDispatcher = createStepDispatcher(handlers);

      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [
          { id: 'step_1', name: 'default', dependencies: [] },
          {
            id: 'step_2',
            name: 'failing_step',
            dependencies: ['step_1'],
            optional: true,
          },
          { id: 'step_3', name: 'default', dependencies: ['step_2'] },
        ],
        totalSteps: 3,
      };

      const receipt = await executePlan(plan, failingDispatcher, 'run_5');

      // Optional failures result in errors with warning severity
      expect(receipt.errors.length).toBeGreaterThanOrEqual(1);
      expect(receipt.progress).toBe(100);
      // State can be 'ready' or 'degraded' depending on whether we only have warnings
      expect(['ready', 'degraded']).toContain(receipt.state);
    });

    it('should handle invalid plan', async () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [
          { id: 'step_1', name: 'default', dependencies: ['nonexistent'] },
        ],
        totalSteps: 1,
      };

      const receipt = await executePlan(plan, dispatcher, 'run_6');

      expect(receipt.state).toBe('failed');
      expect(receipt.errors.length).toBeGreaterThan(0);
    });

    it('should set execution timestamps', async () => {
      const plan = createTestPlan([{ id: 'step_1', description: 'First' }]);

      const before = Date.now();
      const receipt = await executePlan(plan, dispatcher, 'run_7');
      const after = Date.now();

      expect(receipt.startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(receipt.finishedAt!.getTime()).toBeLessThanOrEqual(after);
      expect(receipt.durationMs!).toBeGreaterThanOrEqual(0);
    });

    it('should report correct progress on early failure', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('failing_step', createMockHandler({ shouldFail: true }));
      handlers.set('default', createMockHandler());
      const failingDispatcher = createStepDispatcher(handlers);

      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', name: 'failing_step', description: 'Fails', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
        { id: 'step_4', description: 'Fourth', dependencies: ['step_3'] },
      ]);

      const receipt = await executePlan(plan, failingDispatcher, 'run_8');

      // Progress should be less than 100% but greater than 0%
      expect(receipt.progress).toBeGreaterThan(0);
      expect(receipt.progress).toBeLessThan(100);
    });
  });

  describe('Large plans (100+ steps)', () => {
    it('should handle large linear plan (100 steps)', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];

      for (let i = 0; i < 100; i++) {
        steps.push({
          id: `step_${i}`,
          name: `step_${i}`,
          dependencies: i > 0 ? [`step_${i - 1}`] : [],
        });
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['step_0', createMockHandler()]]));

      const receipt = await executePlan(plan, dispatcher, 'run_large_1');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
      expect(receipt.errors).toHaveLength(0);
    });

    it('should handle large branching plan', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [
        { id: 'root', name: 'default', dependencies: [] },
      ];

      // Create 5 levels of parallel branches (smaller to keep execution fast)
      for (let level = 1; level <= 5; level++) {
        const prevPrefix = level === 1 ? 'root' : `level_${level - 1}_0`;
        for (let i = 0; i < 3; i++) {
          steps.push({
            id: `level_${level}_${i}`,
            name: 'default',
            dependencies: [prevPrefix],
          });
        }
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));

      const receipt = await executePlan(plan, dispatcher, 'run_large_2');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should validate and sort 200 step plan correctly', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];

      // Create a binary tree structure
      for (let i = 0; i < 200; i++) {
        const deps: string[] = [];
        if (i > 0) {
          const parent = Math.floor((i - 1) / 2);
          deps.push(`step_${parent}`);
        }
        steps.push({
          id: `step_${i}`,
          name: `step_${i}`,
          dependencies: deps,
        });
      }

      const plan = createTestPlan(steps);

      // Should validate successfully
      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);

      // Should sort successfully
      const order = topologicalSortPlan(plan);
      expect(order).toHaveLength(200);

      // First step should be step_0
      expect(order[0]).toBe('step_0');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty plan gracefully', async () => {
      const plan: ExecutionPlan = {
        planId: 'empty',
        steps: [],
        totalSteps: 0,
      };
      const dispatcher = createStepDispatcher(new Map());

      const receipt = await executePlan(plan, dispatcher, 'run_empty');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should provide execution context to handlers', async () => {
      const contextCapture: ExecutionContext[] = [];
      const contextHandler: StepHandler = async (step, context) => {
        contextCapture.push(context);
        return { stepId: step.id, success: true };
      };

      // Use unique names for these handlers to avoid interference
      const dispatcher = createStepDispatcher(
        new Map([
          ['test_context_step1', contextHandler],
          ['test_context_step2', contextHandler],
        ])
      );

      const plan = createTestPlan([
        { id: 'step_1', name: 'test_context_step1', description: 'First' },
        { id: 'step_2', name: 'test_context_step2', description: 'Second', dependencies: ['step_1'] },
      ]);

      await executePlan(plan, dispatcher, 'run_context');

      expect(contextCapture).toHaveLength(2);
      expect(contextCapture[0].stepIndex).toBe(0);
      expect(contextCapture[0].totalSteps).toBe(2);
      expect(contextCapture[1].stepIndex).toBe(1);
      expect(contextCapture[0].previousResults.size).toBe(0);
      expect(contextCapture[1].previousResults.size).toBe(1);
    });

    it('should preserve step execution results', async () => {
      const outputHandler: StepHandler = async (step) => {
        return {
          stepId: step.id,
          success: true,
          output: { result: `output_${step.id}` },
        };
      };

      const contextCapture: ExecutionContext[] = [];
      const verifyHandler: StepHandler = async (step, context) => {
        contextCapture.push(context);
        return { stepId: step.id, success: true };
      };

      const dispatcher = createStepDispatcher(
        new Map([
          ['output_step_preserve', outputHandler],
          ['verify_step_preserve', verifyHandler],
        ])
      );

      const plan = createTestPlan([
        { id: 'step_1', name: 'output_step_preserve', description: 'Produces output' },
        { id: 'step_2', name: 'verify_step_preserve', description: 'Verifies', dependencies: ['step_1'] },
      ]);

      await executePlan(plan, dispatcher, 'run_results_preserve');

      expect(contextCapture.length).toBeGreaterThan(0);
      const verifyContext = contextCapture[0];
      expect(verifyContext.previousResults.size).toBe(1);
      const prevResult = verifyContext.previousResults.get('step_1');
      expect(prevResult?.output).toEqual({ result: 'output_step_1' });
    });

    it('should handle dispatcher errors gracefully', async () => {
      const errorDispatcher: StepDispatcher = {
        dispatch: async () => {
          throw new Error('Dispatcher error');
        },
      };

      const plan = createTestPlan([{ id: 'step_1', description: 'First' }]);

      const receipt = await executePlan(plan, errorDispatcher, 'run_dispatcher_error');

      expect(receipt.state).toBe('failed');
      expect(receipt.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Complex dependencies and DAGs', () => {
    it('should execute diamond DAG pattern', async () => {
      const plan = createTestPlan([
        { id: 'root', name: 'default', dependencies: [] },
        { id: 'left', name: 'default', dependencies: ['root'] },
        { id: 'right', name: 'default', dependencies: ['root'] },
        { id: 'join', name: 'default', dependencies: ['left', 'right'] },
      ]);

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_diamond');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
      expect(receipt.errors).toHaveLength(0);
    });

    it('should execute wide DAG (many parallel steps)', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [
        { id: 'root', name: 'default', dependencies: [] },
      ];

      // Create 20 parallel steps all depending on root
      for (let i = 0; i < 20; i++) {
        steps.push({
          id: `parallel_${i}`,
          name: 'default',
          dependencies: ['root'],
        });
      }

      // Add a join step that depends on all parallel steps
      const parallelIds = Array.from({ length: 20 }, (_, i) => `parallel_${i}`);
      steps.push({
        id: 'final_join',
        name: 'default',
        dependencies: parallelIds,
      });

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_wide');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should execute deep DAG (many sequential steps)', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];

      // Create 50 sequential steps
      for (let i = 0; i < 50; i++) {
        steps.push({
          id: `seq_${i}`,
          name: 'default',
          dependencies: i > 0 ? [`seq_${i - 1}`] : [],
        });
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_deep');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should handle multiple dependency paths to same node', async () => {
      const plan = createTestPlan([
        { id: 'a', name: 'default', dependencies: [] },
        { id: 'b', name: 'default', dependencies: ['a'] },
        { id: 'c', name: 'default', dependencies: ['a'] },
        { id: 'd', name: 'default', dependencies: ['b', 'c'] }, // Multiple paths to 'd'
        { id: 'e', name: 'default', dependencies: ['d'] },
      ]);

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_multi_path');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should respect all dependencies in complex DAG', async () => {
      const executionOrder: string[] = [];
      const trackingHandler: StepHandler = async (step) => {
        executionOrder.push(step.id);
        return { stepId: step.id, success: true };
      };

      const plan = createTestPlan([
        { id: 'a', name: 'track', dependencies: [] },
        { id: 'b', name: 'track', dependencies: ['a'] },
        { id: 'c', name: 'track', dependencies: ['a'] },
        { id: 'd', name: 'track', dependencies: ['b', 'c'] },
      ]);

      const dispatcher = createStepDispatcher(new Map([['track', trackingHandler]]));
      await executePlan(plan, dispatcher, 'run_order');

      // Verify execution order respects dependencies
      expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('b'));
      expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('c'));
      expect(executionOrder.indexOf('b')).toBeLessThan(executionOrder.indexOf('d'));
      expect(executionOrder.indexOf('c')).toBeLessThan(executionOrder.indexOf('d'));
    });
  });

  describe('Step output and state management', () => {
    it('should allow steps to access outputs of previous steps', async () => {
      const handler1: StepHandler = async (step) => {
        return {
          stepId: step.id,
          success: true,
          output: { data: 'step1_output', value: 42 },
        };
      };

      const handler2: StepHandler = async (step, context) => {
        const step1Result = context.previousResults.get('step_1');
        expect(step1Result?.output).toEqual({ data: 'step1_output', value: 42 });
        return {
          stepId: step.id,
          success: true,
          output: { derived: step1Result?.output },
        };
      };

      const plan = createTestPlan([
        { id: 'step_1', name: 'handler1', description: 'Produces output' },
        { id: 'step_2', name: 'handler2', description: 'Consumes output', dependencies: ['step_1'] },
      ]);

      const dispatcher = createStepDispatcher(
        new Map([
          ['handler1', handler1],
          ['handler2', handler2],
        ])
      );

      const receipt = await executePlan(plan, dispatcher, 'run_state');
      expect(receipt.state).toBe('ready');
    });

    it('should track step metadata through execution', async () => {
      const metadataHandler: StepHandler = async (step) => {
        return {
          stepId: step.id,
          success: true,
          metadata: {
            executedAt: new Date().toISOString(),
            stepName: step.name,
          },
          durationMs: 10,
        };
      };

      const plan = createTestPlan([{ id: 'step_1', name: 'meta_track', description: 'Tracks metadata' }]);

      const dispatcher = createStepDispatcher(new Map([['meta_track', metadataHandler]]));
      const receipt = await executePlan(plan, dispatcher, 'run_meta_track');

      // Receipt should be valid and execution should complete
      expect(receipt.state).toBe('ready');
      expect(receipt.errors).toHaveLength(0);
    });

    it('should handle empty step outputs', async () => {
      const emptyHandler: StepHandler = async (step) => {
        return { stepId: step.id, success: true }; // No output
      };

      const consumeHandler: StepHandler = async (step, context) => {
        const prevResult = context.previousResults.get('step_1');
        expect(prevResult?.output).toBeUndefined();
        return { stepId: step.id, success: true };
      };

      const plan = createTestPlan([
        { id: 'step_1', name: 'empty', description: 'No output' },
        { id: 'step_2', name: 'consume', description: 'Consumes nothing', dependencies: ['step_1'] },
      ]);

      const dispatcher = createStepDispatcher(
        new Map([
          ['empty', emptyHandler],
          ['consume', consumeHandler],
        ])
      );

      const receipt = await executePlan(plan, dispatcher, 'run_empty_output');
      expect(receipt.state).toBe('ready');
    });
  });

  describe('Progress tracking and reporting', () => {
    it('should report monotonically increasing progress', async () => {
      const plan = createTestPlan([
        { id: 'step_1', name: 'default', dependencies: [] },
        { id: 'step_2', name: 'default', dependencies: ['step_1'] },
        { id: 'step_3', name: 'default', dependencies: ['step_2'] },
        { id: 'step_4', name: 'default', dependencies: ['step_3'] },
        { id: 'step_5', name: 'default', dependencies: ['step_4'] },
      ]);

      const progressValues: number[] = [];
      const onProgress = (update: Partial<StatusUpdate>) => {
        if (update.progress !== undefined) {
          progressValues.push(update.progress);
        }
      };

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      await executePlan(plan, dispatcher, 'run_progress', onProgress);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }

      // Final progress should be 100
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('should report correct progress for 10 steps', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];
      for (let i = 0; i < 10; i++) {
        steps.push({
          id: `step_${i}`,
          name: 'default',
          dependencies: i > 0 ? [`step_${i - 1}`] : [],
        });
      }

      const plan = createTestPlan(steps);

      const progressValues: number[] = [];
      const onProgress = (update: Partial<StatusUpdate>) => {
        if (update.progress !== undefined) {
          progressValues.push(update.progress);
        }
      };

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      await executePlan(plan, dispatcher, 'run_progress_10', onProgress);

      // Should have 10 progress updates
      expect(progressValues).toHaveLength(10);
      // Should end at 100%
      expect(progressValues[9]).toBe(100);
      // Earlier ones should be 10%, 20%, etc.
      expect(progressValues[0]).toBe(10);
      expect(progressValues[1]).toBe(20);
    });

    it('should emit progress message for each step', async () => {
      const plan = createTestPlan([
        { id: 'step_1', name: 'default', dependencies: [] },
        { id: 'step_2', name: 'default', dependencies: ['step_1'] },
        { id: 'step_3', name: 'default', dependencies: ['step_2'] },
      ]);

      const messages: string[] = [];
      const onProgress = (update: Partial<StatusUpdate>) => {
        if (update.message) {
          messages.push(update.message);
        }
      };

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      await executePlan(plan, dispatcher, 'run_messages', onProgress);

      // Should have progress messages
      expect(messages.length).toBeGreaterThan(0);
      // Messages should mention step numbers
      expect(messages.some((m) => m.includes('1/3'))).toBe(true);
      expect(messages.some((m) => m.includes('2/3'))).toBe(true);
      expect(messages.some((m) => m.includes('3/3'))).toBe(true);
    });
  });

  describe('Step handler variations', () => {
    it('should handle async step handlers correctly', async () => {
      const asyncHandler: StepHandler = async (step) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              stepId: step.id,
              success: true,
              durationMs: 20,
            });
          }, 20);
        });
      };

      const plan = createTestPlan([{ id: 'step_1', name: 'async', description: 'Async step' }]);

      const dispatcher = createStepDispatcher(new Map([['async', asyncHandler]]));
      const receipt = await executePlan(plan, dispatcher, 'run_async');

      expect(receipt.state).toBe('ready');
      expect(receipt.errors).toHaveLength(0);
    });

    it('should handle handler that throws error', async () => {
      const throwingHandler: StepHandler = async () => {
        throw new Error('Handler threw error');
      };

      const plan = createTestPlan([{ id: 'step_1', name: 'throw', description: 'Throws' }]);

      const dispatcher = createStepDispatcher(new Map([['throw', throwingHandler]]));
      const receipt = await executePlan(plan, dispatcher, 'run_throw');

      expect(receipt.state).toBe('failed');
      expect(receipt.errors.length).toBeGreaterThan(0);
    });

    it('should handle handler returning different output types', async () => {
      const variants: StepHandler[] = [
        async (step) => ({ stepId: step.id, success: true, output: { string: 'value' } }),
        async (step) => ({ stepId: step.id, success: true, output: { number: 42 } }),
        async (step) => ({ stepId: step.id, success: true, output: { array: [1, 2, 3] } }),
        async (step) => ({ stepId: step.id, success: true, output: { object: { nested: true } } }),
      ];

      for (let i = 0; i < variants.length; i++) {
        const plan = createTestPlan([{ id: `step_${i}`, name: `variant_${i}`, description: `Variant ${i}` }]);
        const dispatcher = createStepDispatcher(new Map([[`variant_${i}`, variants[i]]]));
        const receipt = await executePlan(plan, dispatcher, `run_variant_${i}`);
        expect(receipt.state).toBe('ready');
      }
    });

    it('should measure handler execution time accurately', async () => {
      const timedHandler: StepHandler = async (step) => {
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { stepId: step.id, success: true };
      };

      const plan = createTestPlan([{ id: 'step_1', name: 'timed', description: 'Timed' }]);

      const dispatcher = createStepDispatcher(new Map([['timed', timedHandler]]));

      const contextCapture: ExecutionContext[] = [];
      const capturingDispatcher: StepDispatcher = {
        async dispatch(step, context) {
          contextCapture.push(context);
          return dispatcher.dispatch(step, context);
        },
      };

      const receipt = await executePlan(plan, capturingDispatcher, 'run_timed');

      expect(receipt.durationMs! >= 50).toBe(true);
    });
  });

  describe('Error recovery and handling', () => {
    it('should not execute dependent steps when dependency fails', async () => {
      const executedSteps: string[] = [];

      const trackingHandler: StepHandler = async (step) => {
        if (step.id === 'step_2') {
          return {
            stepId: step.id,
            success: false,
            error: {
              code: 'STEP_FAILED',
              message: 'Step 2 failed',
              severity: 'error',
              recoverable: false,
            },
          };
        }
        executedSteps.push(step.id);
        return { stepId: step.id, success: true };
      };

      const plan = createTestPlan([
        { id: 'step_1', name: 'track', dependencies: [] },
        { id: 'step_2', name: 'track', dependencies: ['step_1'] },
        { id: 'step_3', name: 'track', dependencies: ['step_2'] },
      ]);

      const dispatcher = createStepDispatcher(new Map([['track', trackingHandler]]));
      const receipt = await executePlan(plan, dispatcher, 'run_no_exec_deps');

      // step_1 should execute, step_2 should fail, step_3 should not execute
      expect(executedSteps).toContain('step_1');
      expect(executedSteps).not.toContain('step_3');
      expect(receipt.state).toBe('failed');
    });

    it('should collect multiple errors from failed steps', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('fail_step', createMockHandler({ shouldFail: true }));
      handlers.set('default', createMockHandler());

      const plan = createTestPlan([
        { id: 'step_1', name: 'default', dependencies: [] },
        { id: 'step_2', name: 'fail_step', dependencies: ['step_1'], optional: true },
        { id: 'step_3', name: 'fail_step', dependencies: ['step_1'], optional: true },
        { id: 'step_4', name: 'default', dependencies: ['step_2', 'step_3'] },
      ]);

      const dispatcher = createStepDispatcher(handlers);
      const receipt = await executePlan(plan, dispatcher, 'run_multi_errors');

      // Should have collected multiple errors
      expect(receipt.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide error context in receipt', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('error_step', createMockHandler({ shouldFail: true }));
      handlers.set('default', createMockHandler());

      const plan = createTestPlan([
        { id: 'step_1', name: 'default', dependencies: [] },
        { id: 'step_2', name: 'error_step', dependencies: ['step_1'] },
      ]);

      const dispatcher = createStepDispatcher(handlers);
      const receipt = await executePlan(plan, dispatcher, 'run_error_context');

      expect(receipt.errors.length).toBeGreaterThan(0);
      const error = receipt.errors[0];
      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.severity).toBeDefined();
    });
  });

  describe('Performance characteristics', () => {
    it('should complete 100-step linear plan quickly', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];
      for (let i = 0; i < 100; i++) {
        steps.push({
          id: `perf_${i}`,
          name: 'default',
          dependencies: i > 0 ? [`perf_${i - 1}`] : [],
        });
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));

      const start = Date.now();
      const receipt = await executePlan(plan, dispatcher, 'run_perf');
      const duration = Date.now() - start;

      expect(receipt.state).toBe('ready');
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle 50-step wide plan', async () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [
        { id: 'root', name: 'default', dependencies: [] },
      ];

      for (let i = 0; i < 50; i++) {
        steps.push({
          id: `wide_${i}`,
          name: 'default',
          dependencies: ['root'],
        });
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_perf_wide');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });

    it('should complete 50-step pyramid DAG', async () => {
      // Create a pyramid-shaped DAG where each node depends on 1-2 previous nodes
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];

      steps.push({ id: 'root', name: 'default', dependencies: [] });

      for (let i = 1; i < 50; i++) {
        const deps: string[] = [];
        if (i === 1) {
          deps.push('root');
        } else if (i === 2) {
          deps.push('root');
        } else {
          // Depend on previous two nodes
          deps.push(`node_${i - 1}`);
          deps.push(`node_${i - 2}`);
        }
        steps.push({
          id: `node_${i}`,
          name: 'default',
          dependencies: deps,
        });
      }

      const plan = createTestPlan(steps);
      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));
      const receipt = await executePlan(plan, dispatcher, 'run_perf_pyramid');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
    });
  });

  describe('Plan validation detailed tests', () => {
    it('should reject plan with transitive cycle', () => {
      const plan: ExecutionPlan = {
        planId: 'test',
        steps: [
          { id: 'a', name: 'a', dependencies: ['c'] },
          { id: 'b', name: 'b', dependencies: ['a'] },
          { id: 'c', name: 'c', dependencies: ['b'] },
        ],
        totalSteps: 3,
      };

      const errors = validatePlan(plan);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate plan with no dependencies successfully', () => {
      const plan = createTestPlan([
        { id: 'a', name: 'a', dependencies: [] },
        { id: 'b', name: 'b', dependencies: [] },
        { id: 'c', name: 'c', dependencies: [] },
      ]);

      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);
    });

    it('should sort all nodes in topological order', () => {
      const plan = createTestPlan([
        { id: 'z', name: 'z', dependencies: ['x', 'y'] },
        { id: 'x', name: 'x', dependencies: ['a'] },
        { id: 'y', name: 'y', dependencies: ['b'] },
        { id: 'a', name: 'a', dependencies: [] },
        { id: 'b', name: 'b', dependencies: ['a'] },
      ]);

      const order = topologicalSortPlan(plan);

      expect(order).toHaveLength(5);
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('x'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('y'));
      expect(order.indexOf('x')).toBeLessThan(order.indexOf('z'));
      expect(order.indexOf('y')).toBeLessThan(order.indexOf('z'));
    });

    it('should handle plan validation with many nodes', () => {
      const steps: Omit<PlanStep, 'inputs' | 'outputs' | 'optional' | 'timeout'>[] = [];

      for (let i = 0; i < 100; i++) {
        steps.push({
          id: `v_${i}`,
          name: `v_${i}`,
          dependencies: i > 0 ? [`v_${i - 1}`] : [],
        });
      }

      const plan = createTestPlan(steps);

      const errors = validatePlan(plan);
      expect(errors).toHaveLength(0);

      const order = topologicalSortPlan(plan);
      expect(order).toHaveLength(100);
    });
  });

  describe('Execution metrics and monitoring', () => {
    it('should report accurate step counts', async () => {
      const plan = createTestPlan([
        { id: 'step_1', description: 'First' },
        { id: 'step_2', description: 'Second', dependencies: ['step_1'] },
        { id: 'step_3', description: 'Third', dependencies: ['step_2'] },
      ]);

      const progressUpdates: number[] = [];
      const onProgress = (update: Partial<StatusUpdate>) => {
        if (update.progress !== undefined) {
          progressUpdates.push(update.progress);
        }
      };

      const dispatcher = createStepDispatcher(new Map([['default', createMockHandler()]]));

      await executePlan(plan, dispatcher, 'run_metrics', onProgress);

      // Should have reported 3 updates (one per step)
      expect(progressUpdates).toHaveLength(3);
      // Progress should be 33%, 66%, 100%
      expect(progressUpdates[0]).toBe(33);
      expect(progressUpdates[1]).toBe(67);
      expect(progressUpdates[2]).toBe(100);
    });

    it('should calculate execution duration', async () => {
      const plan = createTestPlan([
        { id: 'step_1', name: 'delay', description: 'Slow step' },
      ]);

      const delayHandler = createMockHandler({ delayMs: 50 });
      const dispatcher = createStepDispatcher(new Map([['delay', delayHandler]]));

      const receipt = await executePlan(plan, dispatcher, 'run_duration');

      expect(receipt.durationMs).toBeDefined();
      expect(receipt.durationMs! >= 50).toBe(true);
    });

    it('should work with multiplehandlers for different step types', async () => {
      const handlers = new Map<string, StepHandler>();
      handlers.set('loader', createMockHandler());
      handlers.set('processor', createMockHandler());
      handlers.set('analyzer', createMockHandler());
      handlers.set('exporter', createMockHandler());

      const plan = createTestPlan([
        { id: 'load', name: 'loader', description: 'Load data' },
        { id: 'process', name: 'processor', description: 'Process', dependencies: ['load'] },
        { id: 'analyze', name: 'analyzer', description: 'Analyze', dependencies: ['process'] },
        { id: 'export', name: 'exporter', description: 'Export', dependencies: ['analyze'] },
      ]);

      const dispatcher = createStepDispatcher(handlers);
      const receipt = await executePlan(plan, dispatcher, 'run_multi_handlers');

      expect(receipt.state).toBe('ready');
      expect(receipt.progress).toBe(100);
      expect(receipt.errors).toHaveLength(0);
    });

    it('should provide metadata in execution context', async () => {
      const plan = createTestPlan([{ id: 'step_1', name: 'metadata_test', description: 'First' }]);
      plan.planId = 'plan_with_metadata';

      const contextCapture: ExecutionContext[] = [];
      const captureHandler: StepHandler = async (step, context) => {
        contextCapture.push(context);
        return { stepId: step.id, success: true };
      };

      const dispatcher = createStepDispatcher(new Map([['metadata_test', captureHandler]]));

      await executePlan(plan, dispatcher, 'run_meta');

      expect(contextCapture.length).toBeGreaterThan(0);
      expect(contextCapture[0].planId).toBe('plan_with_metadata');
      expect(contextCapture[0].runId).toBe('run_meta');
      expect(contextCapture[0].stepIndex).toBe(0);
      expect(contextCapture[0].totalSteps).toBe(1);
    });
  });
});
