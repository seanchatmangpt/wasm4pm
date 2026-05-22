/**
 * Parity tests: plan() and explain() must be structurally consistent.
 *
 * Per PRD §11: explain() == run()
 * For every config, the step types visible in explain()'s output must match
 * exactly the step types in plan()'s output — same set, same order.
 *
 * Tests cover all 4 documented profiles: fast, balanced, quality, stream.
 */

import { describe, it, expect } from 'vitest';
import { plan, explain, type Config } from '../src/index';
import { PLAN_STEP_TYPE_VALUES } from '@wasm4pm/contracts';

/**
 * Extracts step type identifiers from explain() text output.
 * Mirrors the logic in @wasm4pm/testing's checkParity harness.
 */
function extractStepsFromExplain(text: string): string[] {
  const knownSteps = [...PLAN_STEP_TYPE_VALUES];
  const lowerText = text.toLowerCase();

  const hits: Array<{ step: string; pos: number }> = [];
  for (const step of knownSteps) {
    // Escape underscores and allow flexible separators for matching
    const normalized = step.replace(/_/g, '[_ -]?');
    const pattern = new RegExp(normalized, 'i');
    const match = pattern.exec(lowerText);
    if (match) {
      hits.push({ step, pos: match.index });
    }
  }

  // Return steps in text order (preserves explain() rendering order)
  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.step);
}

/**
 * Check if common elements between two arrays appear in the same relative order.
 */
function arraysMatchOrder(a: string[], b: string[]): boolean {
  const common = a.filter((item) => b.includes(item));
  const bFiltered = b.filter((item) => a.includes(item));
  if (common.length !== bFiltered.length) return false;
  for (let i = 0; i < common.length; i++) {
    if (common[i] !== bFiltered[i]) return false;
  }
  return true;
}

/**
 * Core parity check: step types in explain() must match step types in plan().
 */
function checkParity(config: Config): {
  passed: boolean;
  missingFromExplain: string[];
  missingFromRun: string[];
  orderMismatch: boolean;
  details: string;
} {
  const explainText = explain(config);
  const executionPlan = plan(config);

  const explainSteps = extractStepsFromExplain(explainText);
  const runSteps = executionPlan.steps.map((s) => s.type as string);

  const explainSet = new Set(explainSteps);
  const runSet = new Set(runSteps);

  const missingFromExplain = runSteps.filter((s) => !explainSet.has(s));
  const missingFromRun = explainSteps.filter((s) => !runSet.has(s));
  const orderMismatch = !arraysMatchOrder(explainSteps, runSteps);

  const passed = missingFromExplain.length === 0 && missingFromRun.length === 0 && !orderMismatch;

  let details = '';
  if (!passed) {
    const parts: string[] = [];
    if (missingFromExplain.length > 0) {
      parts.push(`In plan() but not in explain(): [${missingFromExplain.join(', ')}]`);
    }
    if (missingFromRun.length > 0) {
      parts.push(`In explain() but not in plan(): [${missingFromRun.join(', ')}]`);
    }
    if (orderMismatch) {
      parts.push(
        `Order differs: explain=[${explainSteps.join(', ')}] vs plan=[${runSteps.join(', ')}]`
      );
    }
    details = parts.join('; ');
  } else {
    details = `Parity verified: ${runSteps.length} steps match`;
  }

  return { passed, missingFromExplain, missingFromRun, orderMismatch, details };
}

const baseConfig: Config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'fast' },
};

describe('plan/explain parity — PRD §11', () => {
  describe('fast profile', () => {
    it('explain() and plan() agree on step types and order', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'fast' } };
      const result = checkParity(config);
      expect(result.passed, result.details).toBe(true);
    });

    it('explain() mentions discover_dfg for fast profile', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'fast' } };
      const executionPlan = plan(config);
      const stepTypes = executionPlan.steps.map((s) => s.type as string);
      expect(stepTypes).toContain('discover_dfg');
      expect(explain(config)).toMatch(/discover_dfg/i);
    });
  });

  describe('balanced profile', () => {
    it('explain() and plan() agree on step types and order', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'balanced' } };
      const result = checkParity(config);
      expect(result.passed, result.details).toBe(true);
    });

    it('explain() mentions heuristic_miner for balanced profile', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'balanced' } };
      const executionPlan = plan(config);
      const stepTypes = executionPlan.steps.map((s) => s.type as string);
      expect(stepTypes).toContain('discover_heuristic');
      expect(explain(config)).toMatch(/discover_heuristic/i);
    });
  });

  describe('quality profile', () => {
    it('explain() and plan() agree on step types and order', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'quality' } };
      const result = checkParity(config);
      expect(result.passed, result.details).toBe(true);
    });

    it('explain() mentions genetic_algorithm for quality profile', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'quality' } };
      const executionPlan = plan(config);
      const stepTypes = executionPlan.steps.map((s) => s.type as string);
      expect(stepTypes).toContain('discover_genetic');
      expect(explain(config)).toMatch(/discover_genetic/i);
    });

    it('explain() mentions ilp for quality profile', () => {
      const config: Config = { ...baseConfig, execution: { profile: 'quality' } };
      const executionPlan = plan(config);
      const stepTypes = executionPlan.steps.map((s) => s.type as string);
      expect(stepTypes).toContain('discover_ilp');
      expect(explain(config)).toMatch(/discover_ilp/i);
    });
  });

  describe('stream profile', () => {
    it('explain() and plan() agree on step types and order', () => {
      const config: Config = { ...baseConfig, source: { format: 'json' }, execution: { profile: 'stream' } };
      const result = checkParity(config);
      expect(result.passed, result.details).toBe(true);
    });

    it('stream profile selects discover_simd_streaming_dfg (SIMD-accelerated)', () => {
      const config: Config = {
        ...baseConfig,
        source: { format: 'json' },
        execution: { profile: 'stream' },
      };
      const executionPlan = plan(config);
      const stepTypes = executionPlan.steps.map((s) => s.type as string);
      // stream profile must use the SIMD-accelerated streaming variant, not plain dfg
      expect(stepTypes).toContain('discover_simd_streaming_dfg');
      expect(stepTypes).not.toContain('discover_dfg');
    });

    it('stream profile explain() mentions simd_streaming_dfg', () => {
      const config: Config = {
        ...baseConfig,
        source: { format: 'json' },
        execution: { profile: 'stream' },
      };
      expect(explain(config)).toMatch(/discover_simd_streaming_dfg/i);
    });

    it('stream profile has exactly one discovery step (minimal, streaming-safe)', () => {
      const config: Config = {
        ...baseConfig,
        source: { format: 'json' },
        execution: { profile: 'stream' },
      };
      const executionPlan = plan(config);
      const discoverySteps = executionPlan.steps.filter((s) =>
        (s.type as string).startsWith('discover_')
      );
      expect(discoverySteps).toHaveLength(1);
    });
  });

  describe('parity across all 4 profiles (batch)', () => {
    const profiles = ['fast', 'balanced', 'quality', 'stream'] as const;

    for (const profile of profiles) {
      it(`${profile}: plan() step types ⊆ explain() text and order matches`, () => {
        const config: Config = {
          ...baseConfig,
          source: { format: profile === 'stream' ? 'json' : 'xes' },
          execution: { profile },
        };
        const result = checkParity(config);
        expect(result.passed, `[${profile}] ${result.details}`).toBe(true);
      });
    }
  });

  describe('parity with algorithm override', () => {
    it('overriding to ilp: explain() and plan() still agree', () => {
      const config: Config = {
        ...baseConfig,
        execution: { profile: 'fast' },
        algorithm: { name: 'ilp' },
      };
      const result = checkParity(config);
      expect(result.passed, result.details).toBe(true);
    });
  });
});

/**
 * Step ID/type invariant tests.
 *
 * Every PlanStep produced by plan() must satisfy step.id === step.type.
 * This ensures that DAG edges (which reference step IDs) and code that
 * pattern-matches on step types refer to the same stable string.
 *
 * Previously createAlgorithmStep() derived IDs from display names like
 * "Alpha++" → "discover_alpha++" which diverged from the enum value
 * "discover_alpha_plus_plus" and introduced non-identifier characters.
 */
describe('step.id === step.type invariant', () => {
  const allProfiles = ['fast', 'balanced', 'quality', 'stream'] as const;

  for (const profile of allProfiles) {
    it(`${profile}: every step has id === type`, () => {
      const config: Config = {
        ...baseConfig,
        source: { format: profile === 'stream' ? 'json' : 'xes' },
        execution: { profile },
      };
      const executionPlan = plan(config);
      for (const step of executionPlan.steps) {
        expect(step.id, `Step type "${step.type}" has id "${step.id}"`).toBe(step.type as string);
      }
    });
  }

  it('algorithm override: id === type for overridden discovery step', () => {
    const config: Config = {
      ...baseConfig,
      execution: { profile: 'balanced' },
      algorithm: { name: 'ilp' },
    };
    const executionPlan = plan(config);
    for (const step of executionPlan.steps) {
      expect(step.id, `Step type "${step.type}" has id "${step.id}"`).toBe(step.type as string);
    }
  });

  it('ML tasks: id === type for all ML analysis steps', () => {
    const config: Config = {
      ...baseConfig,
      execution: { profile: 'fast' },
      ml: { enabled: true, tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] },
    };
    const executionPlan = plan(config);
    for (const step of executionPlan.steps) {
      expect(step.id, `Step type "${step.type}" has id "${step.id}"`).toBe(step.type as string);
    }
  });

  it('step IDs contain only valid identifier characters (no ++, spaces, etc.)', () => {
    const config: Config = {
      ...baseConfig,
      execution: { profile: 'quality' },
    };
    const executionPlan = plan(config);
    const identifierPattern = /^[a-z0-9_]+$/;
    for (const step of executionPlan.steps) {
      expect(
        identifierPattern.test(step.id),
        `Step id "${step.id}" contains invalid characters`
      ).toBe(true);
    }
  });
});
