import { describe, it, expect } from 'vitest';
import { checkParity, checkParityBatch } from '../../src/harness/parity.js';
import type { PlannerLike } from '../../src/harness/parity.js';

function createMockPlanner(opts?: {
  extraRunSteps?: string[];
  extraExplainSteps?: string[];
  reorderSteps?: boolean;
}): PlannerLike {
  const baseSteps = ['load_source', 'validate_source', 'discover_dfg', 'write_sink'];

  return {
    explain(config: unknown): string {
      const steps = [...baseSteps, ...(opts?.extraExplainSteps ?? [])];
      return steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n');
    },
    plan(config: unknown) {
      let steps = [...baseSteps, ...(opts?.extraRunSteps ?? [])];
      if (opts?.reorderSteps) {
        steps = steps.reverse();
      }
      return {
        id: 'plan-1',
        hash: 'hash-1',
        steps: steps.map((type, i) => ({
          id: `step-${i}`,
          type,
          description: `Step ${i}`,
          required: true,
          parameters: {},
          dependsOn: [],
        })),
      };
    },
  };
}

describe('Parity Harness', () => {
  it('passes when explain matches run', async () => {
    const planner = createMockPlanner();
    const result = await checkParity(planner, {});
    expect(result.passed).toBe(true);
    expect(result.missingFromExplain).toHaveLength(0);
    expect(result.missingFromRun).toHaveLength(0);
    expect(result.orderMismatch).toBe(false);
  });

  it('fails when run has steps not in explain', async () => {
    const planner = createMockPlanner({ extraRunSteps: ['discover_heuristic'] });
    const result = await checkParity(planner, {});
    expect(result.passed).toBe(false);
    expect(result.missingFromExplain).toContain('discover_heuristic');
  });

  it('fails when explain has steps not in run', async () => {
    const planner = createMockPlanner({ extraExplainSteps: ['discover_genetic'] });
    const result = await checkParity(planner, {});
    expect(result.passed).toBe(false);
    expect(result.missingFromRun).toContain('discover_genetic');
  });

  it('detects order mismatch', async () => {
    const planner = createMockPlanner({ reorderSteps: true });
    const result = await checkParity(planner, {});
    expect(result.orderMismatch).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('provides details for failures', async () => {
    const planner = createMockPlanner({ extraRunSteps: ['discover_ilp'] });
    const result = await checkParity(planner, {});
    expect(result.details).toContain('discover_ilp');
  });

  it('provides success details', async () => {
    const planner = createMockPlanner();
    const result = await checkParity(planner, {});
    expect(result.details).toContain('Parity verified');
    expect(result.details).toContain('4 steps');
  });
});

describe('Parity Batch', () => {
  it('all pass for matching planner', async () => {
    const planner = createMockPlanner();
    const configs = [{}, {}, {}];
    const { results, allPassed, summary } = await checkParityBatch(planner, configs);
    expect(allPassed).toBe(true);
    expect(results).toHaveLength(3);
    expect(summary).toContain('3/3');
  });

  it('reports partial failures', async () => {
    const planner = createMockPlanner({ extraRunSteps: ['discover_aco'] });
    const configs = [{}];
    const { allPassed, summary } = await checkParityBatch(planner, configs);
    expect(allPassed).toBe(false);
    expect(summary).toContain('0/1');
  });
});
