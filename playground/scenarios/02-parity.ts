/**
 * Scenario: Explain/run parity — PRD §11 invariant
 *
 * Dev action simulated: "I just added a step to getDefaultPipeline('fast') and
 * want to verify explain() still describes what plan() will actually do."
 *
 * A dev breaks this by:
 *   - Adding a step to getDefaultPipeline() without updating explain()
 *   - Removing a step from plan() but leaving a mention in explain()
 *   - Reordering steps inside getDefaultPipeline()
 *
 * When this fails, output tells you exactly which step(s) drifted and in which
 * direction so you know whether to fix plan() or explain().
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { checkParity, checkParityBatch } from '@wasm4pm/testing';
import type { PlannerLike } from '@wasm4pm/testing';

// Lazy-load planner — skip gracefully if dist isn't built
let realPlanner: PlannerLike | null = null;

beforeAll(async () => {
  try {
    const mod = await import('@wasm4pm/planner');
    realPlanner = {
      plan: (config: unknown) => mod.plan(config as Parameters<typeof mod.plan>[0]),
      explain: (config: unknown) => mod.explain(config as Parameters<typeof mod.explain>[0]),
    };
    console.info('[parity] @wasm4pm/planner loaded');
  } catch (e) {
    console.warn('[parity] @wasm4pm/planner not available — all tests will skip');
    console.warn('[parity] Run: cd packages/planner && npm run build');
  }
});

function skipIfNotWired(): boolean {
  if (!realPlanner) {
    console.warn('[parity] planner not wired — skipping');
    return true;
  }
  return false;
}

// Steps that must appear in both plan() and explain() for every profile
const INVARIANT_STEPS = ['bootstrap', 'init_wasm', 'load_source', 'validate_source', 'cleanup'];

// ── Per-profile parity checks ────────────────────────────────────────────────

for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
  describe(`parity: ${profile} profile`, () => {
    it(`explain() matches plan() steps for profile=${profile}`, async () => {
      if (skipIfNotWired()) return;
      const config = { version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile } };
      const result = await checkParity(realPlanner!, config);

      if (!result.passed) {
        console.error(`[parity:${profile}] FAILED — ${result.details}`);
        if (result.missingFromExplain.length > 0) {
          console.error(`  Steps in plan() but missing from explain():`, result.missingFromExplain);
          console.error(`  → Fix: add these to the explain() markdown output`);
        }
        if (result.missingFromRun.length > 0) {
          console.error(`  Steps in explain() but not in plan():`, result.missingFromRun);
          console.error(`  → Fix: add to getDefaultPipeline('${profile}') or remove from explain()`);
        }
        if (result.orderMismatch) {
          console.error(`  Step order differs:`, '\n  explain:', result.explainSteps, '\n  plan:', result.runSteps);
          console.error(`  → Fix: ensure explain() iterates plan.steps in the same order`);
        }
      }

      expect(result.passed, result.details).toBe(true);
    });

    it(`invariant steps present in both explain and plan for profile=${profile}`, async () => {
      if (skipIfNotWired()) return;
      const config = { version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile } };
      const result = await checkParity(realPlanner!, config);
      for (const step of INVARIANT_STEPS) {
        expect(result.runSteps, `plan() missing required step: ${step}`).toContain(step);
        expect(result.explainSteps, `explain() missing required step: ${step}`).toContain(step);
      }
    });
  });
}

// ── Batch check ──────────────────────────────────────────────────────────────

describe('parity: batch check across all profiles', () => {
  it('all four profiles pass parity simultaneously', async () => {
    if (skipIfNotWired()) return;
    const configs = ['fast', 'balanced', 'quality', 'stream'].map(profile => ({
      version: '1.0',
      source: { kind: 'file', format: 'xes' },
      execution: { profile },
    }));
    const { results, allPassed, summary } = await checkParityBatch(realPlanner!, configs);
    const failures = results.filter(r => !r.passed);
    if (!allPassed) {
      failures.forEach((r, i) => {
        console.error(`[parity:batch] profile=${configs[i]?.execution.profile} FAILED — ${r.details}`);
      });
    }
    expect(allPassed, summary).toBe(true);
  });
});

// ── Harness self-check (shows what a broken planner looks like) ──────────────

describe('parity: harness self-check', () => {
  it('detects when plan() gains a step that explain() omits', async () => {
    const brokenPlanner: PlannerLike = {
      plan: (_config: unknown) => ({
        id: 'plan-sim',
        hash: 'hash-sim',
        steps: [
          { id: 'bootstrap', type: 'bootstrap', description: 'Bootstrap', required: true, parameters: {}, dependsOn: [] },
          { id: 'init_wasm', type: 'init_wasm', description: 'Init WASM', required: true, parameters: {}, dependsOn: [] },
          { id: 'load_source', type: 'load_source', description: 'Load', required: true, parameters: {}, dependsOn: [] },
          { id: 'validate_source', type: 'validate_source', description: 'Validate', required: true, parameters: {}, dependsOn: [] },
          { id: 'discover_dfg', type: 'discover_dfg', description: 'DFG', required: true, parameters: {}, dependsOn: [] },
          // Developer added this to plan() but forgot explain()
          { id: 'analyze_clustering', type: 'analyze_clustering', description: 'Cluster', required: false, parameters: {}, dependsOn: [] },
          { id: 'cleanup', type: 'cleanup', description: 'Cleanup', required: false, parameters: {}, dependsOn: [] },
        ],
      }),
      explain: (_config: unknown) =>
        'bootstrap\ninit_wasm\nload_source\nvalidate_source\ndiscover_dfg\ncleanup',
    };

    const result = await checkParity(brokenPlanner, {});
    expect(result.passed).toBe(false);
    expect(result.missingFromExplain).toContain('analyze_clustering');
    console.info('[parity:self-check] correctly detected drift — missingFromExplain:', result.missingFromExplain);
    console.info('[parity:self-check] This is what you see when plan() adds a step without updating explain()');
  });
});
