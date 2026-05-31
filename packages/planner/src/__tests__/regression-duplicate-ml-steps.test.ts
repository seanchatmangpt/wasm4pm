/**
 * Regression test: duplicate ML steps when algorithm override is an ML algorithm
 * on a profile that auto-includes ML.
 *
 * Bug: plan() with algorithm='ml_cluster' and profile='balanced' produced two
 * ml_cluster steps — one from the algorithm override path (section 3) and one
 * from the ML auto-inclusion path (section 3b).  The stepIds dedup guard in
 * section 3b was missing, so the step was appended twice.
 *
 * Fix: section 3b skips any ML step whose ID is already in stepIds.
 *
 * This test FAILS on the old code and PASSES on the fixed code.
 */

import { describe, it, expect } from 'vitest';
import { plan } from '../planner.js';
import type { Config } from '../planner.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'balanced' },
    ...overrides,
  };
}

describe('regression: duplicate ML steps (balanced profile + ML algorithm override)', () => {
  it('ml_cluster with profile=balanced must appear exactly once in plan steps', () => {
    const result = plan(
      makeConfig({
        algorithm: { name: 'ml_cluster' },
        execution: { profile: 'balanced' },
      })
    );

    const mlClusterSteps = result.steps.filter((s) => s.type === 'ml_cluster');
    expect(mlClusterSteps).toHaveLength(1);
  });

  it('ml_anomaly with profile=balanced must appear exactly once in plan steps', () => {
    const result = plan(
      makeConfig({
        algorithm: { name: 'ml_anomaly' },
        execution: { profile: 'balanced' },
      })
    );

    const mlAnomalySteps = result.steps.filter((s) => s.type === 'ml_anomaly');
    expect(mlAnomalySteps).toHaveLength(1);
  });

  it('ml_cluster with profile=quality must appear exactly once in plan steps', () => {
    const result = plan(
      makeConfig({
        algorithm: { name: 'ml_cluster' },
        execution: { profile: 'quality' },
      })
    );

    const mlClusterSteps = result.steps.filter((s) => s.type === 'ml_cluster');
    expect(mlClusterSteps).toHaveLength(1);
  });

  it('no step type is duplicated for balanced profile without algorithm override', () => {
    const result = plan(makeConfig({ execution: { profile: 'balanced' } }));

    const typeCounts = new Map<string, number>();
    for (const step of result.steps) {
      typeCounts.set(step.type, (typeCounts.get(step.type) ?? 0) + 1);
    }

    for (const [type, count] of typeCounts) {
      expect(count, `step type "${type}" appears ${count} times; expected 1`).toBe(1);
    }
  });

  it('no step ID is duplicated for balanced profile + ml_cluster override', () => {
    const result = plan(
      makeConfig({
        algorithm: { name: 'ml_cluster' },
        execution: { profile: 'balanced' },
      })
    );

    const ids = result.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
