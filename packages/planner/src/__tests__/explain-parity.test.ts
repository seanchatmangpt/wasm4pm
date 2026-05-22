/**
 * PRD §11 parity invariant: explain() == plan()
 *
 * Per the spec: "The same plan is used for both explanation and execution."
 * This means explain() internally calls plan() and must describe exactly the
 * steps that plan() would schedule — no more, no less.
 *
 * These tests verify that property at the structural level using the parity
 * harness from @wasm4pm/testing (ported inline because @wasm4pm/testing is
 * not a declared dependency of @wasm4pm/planner — it is the layer that
 * depends on planner, not the other way around).
 *
 * Oracle rank: 2 (domain contract — PRD §11 is a design-decided invariant).
 */

import { describe, it, expect } from 'vitest';
import { plan, explain, explainBrief } from '../index.js';
import type { Config } from '../planner.js';
import { PlanStepType } from '../steps.js';

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inline parity helper (avoids circular dependency on @wasm4pm/testing)
//
// The harness in @wasm4pm/testing does the same structural check. We replicate
// the logic here so the planner package stays dependency-light. The shared
// harness is tested separately in packages/testing/.
// ---------------------------------------------------------------------------

function extractStepTypesFromExplain(text: string): Set<string> {
  const allTypes = Object.values(PlanStepType) as string[];
  const found = new Set<string>();
  const lowerText = text.toLowerCase();
  for (const t of allTypes) {
    // Match the type string with underscores optionally rendered as spaces/hyphens
    const pattern = new RegExp(t.replace(/_/g, '[_ -]?'), 'i');
    if (pattern.test(lowerText)) {
      found.add(t);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// PRD §11: explain() describes the same steps as plan()
// ---------------------------------------------------------------------------

describe('explain() / plan() parity — PRD §11', () => {
  it('explain() returns a non-empty string', () => {
    const text = explain(makeConfig());
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('explain() output mentions the execution profile', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const text = explain(makeConfig({ execution: { profile } }));
      expect(text.toLowerCase()).toMatch(new RegExp(profile));
    }
  });

  it('explain() output mentions the source kind', () => {
    for (const format of ['xes', 'csv', 'ocel']) {
      const text = explain(makeConfig({ source: { format } }));
      expect(text.toLowerCase()).toContain(format);
    }
  });

  it('explain() mentions the plan hash', () => {
    const config = makeConfig();
    const p = plan(config);
    const text = explain(config);
    // The full hash should appear verbatim in the explain output
    expect(text).toContain(p.hash);
  });

  it('every step type in plan() is mentioned in explain() output', () => {
    const config = makeConfig();
    const p = plan(config);
    const text = explain(config);
    const mentioned = extractStepTypesFromExplain(text);

    const missingFromExplain: string[] = [];
    for (const step of p.steps) {
      if (!mentioned.has(step.type)) {
        missingFromExplain.push(step.type);
      }
    }

    expect(
      missingFromExplain,
      `Steps present in plan() but not described in explain(): [${missingFromExplain.join(', ')}]`
    ).toHaveLength(0);
  });

  it('parity holds for balanced profile (includes ML steps)', () => {
    const config = makeConfig({ execution: { profile: 'balanced' } });
    const p = plan(config);
    const text = explain(config);
    const mentioned = extractStepTypesFromExplain(text);

    const missingFromExplain = p.steps
      .map((s) => s.type)
      .filter((t) => !mentioned.has(t));

    expect(
      missingFromExplain,
      `Balanced-profile parity failure — missing from explain(): [${missingFromExplain.join(', ')}]`
    ).toHaveLength(0);
  });

  it('parity holds for quality profile (all analysis steps)', () => {
    const config = makeConfig({ execution: { profile: 'quality' } });
    const p = plan(config);
    const text = explain(config);
    const mentioned = extractStepTypesFromExplain(text);

    const missingFromExplain = p.steps
      .map((s) => s.type)
      .filter((t) => !mentioned.has(t));

    expect(
      missingFromExplain,
      `Quality-profile parity failure — missing from explain(): [${missingFromExplain.join(', ')}]`
    ).toHaveLength(0);
  });

  it('explain() and plan() agree on step count (number of step descriptions matches steps array)', () => {
    // The explain markdown renders one titled section per step (### N. Title).
    // Count heading occurrences as a proxy for step count.
    const config = makeConfig();
    const p = plan(config);
    const text = explain(config);
    const headingMatches = text.match(/^###\s+\d+\./gm) ?? [];
    expect(headingMatches.length).toBe(p.steps.length);
  });

  it('explain() output includes a Reproducibility section', () => {
    const text = explain(makeConfig());
    expect(text).toContain('Reproducibility');
  });
});

// ---------------------------------------------------------------------------
// explainBrief() sanity checks
// ---------------------------------------------------------------------------

describe('explainBrief()', () => {
  it('returns a non-empty string shorter than explain()', () => {
    const config = makeConfig();
    const full = explain(config);
    const brief = explainBrief(config);

    expect(typeof brief).toBe('string');
    expect(brief.length).toBeGreaterThan(0);
    expect(brief.length).toBeLessThan(full.length);
  });

  it('mentions the profile in the brief output', () => {
    for (const profile of ['fast', 'balanced', 'quality']) {
      const brief = explainBrief(makeConfig({ execution: { profile } }));
      expect(brief.toLowerCase()).toContain(profile);
    }
  });

  it('lists each step description at least once', () => {
    const config = makeConfig();
    const p = plan(config);
    const brief = explainBrief(config);

    for (const step of p.steps) {
      // Brief renders step.description inline
      expect(
        brief,
        `Step description "${step.description}" not found in explainBrief() output`
      ).toContain(step.description);
    }
  });

  it('includes an estimated total duration', () => {
    const brief = explainBrief(makeConfig());
    // Brief always appends "\nEstimated: Xms"
    expect(brief).toMatch(/Estimated:\s*\d+ms/);
  });
});

// ---------------------------------------------------------------------------
// Algorithm override parity
// ---------------------------------------------------------------------------

describe('explain() / plan() parity — algorithm override', () => {
  it('explain() reflects algorithm override step', () => {
    const config = makeConfig({ algorithm: { name: 'ilp' } });
    const p = plan(config);
    const text = explain(config);
    const mentioned = extractStepTypesFromExplain(text);

    // The ilp override maps to discover_ilp — must appear in explanation
    expect(mentioned.has(PlanStepType.DISCOVER_ILP)).toBe(true);

    // And the plan's discovery step must be discover_ilp
    const discoverySteps = p.steps.filter((s) => s.type.startsWith('discover_'));
    expect(discoverySteps).toHaveLength(1);
    expect(discoverySteps[0].type).toBe(PlanStepType.DISCOVER_ILP);
  });
});
