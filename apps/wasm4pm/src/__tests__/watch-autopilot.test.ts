/**
 * watch-autopilot.test.ts
 *
 * Unit tests for selectAutopilotAlgorithm — the branch logic that chooses
 * a discovery algorithm from event-log statistics.
 *
 * Oracle rank: Rank-2 (domain contract) — the thresholds are design decisions
 * documented in watch-autopilot.ts comments.  Deleting the function body would
 * cause every assertion here to fail immediately.
 *
 * No mocking: we import the real implementation.
 *
 * Key behavioral contract (post-fix):
 *   - variant_count is REQUIRED to trigger the inductive branch.
 *   - Missing variant_count → conservative default 999 → inductive does NOT fire.
 *   - Only when variant_count < 20 AND traces < 5,000 does inductive fire.
 */

import { describe, it, expect } from 'vitest';
import { selectAutopilotAlgorithm, type LogStats } from '../commands/watch-autopilot.js';

// ---------------------------------------------------------------------------
// Branch 1: traces > 50,000 → dfg (size guard)
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — large log guard (traces > 50,000)', () => {
  it('returns dfg for exactly 50,001 traces', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 50_001 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/log too large/);
  });

  it('returns dfg for a very large log (1,000,000 traces)', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 1_000_000 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toContain('1,000,000');
  });

  it('does NOT return dfg for exactly 50,000 traces (boundary — falls through)', () => {
    // 50,000 is NOT > 50,000, so the first guard does not fire.
    // variant_count not supplied → 999 (conservative) → inductive branch does not fire.
    // traces=50,000 > 10,000 → medium-large heuristic branch fires.
    const result = selectAutopilotAlgorithm({ total_cases: 50_000 });
    expect(result.algo).toBe('heuristic');
  });
});

// ---------------------------------------------------------------------------
// Branch 2: variants < 20 && traces < 5,000 → inductive
// Now REQUIRES explicit variant_count — missing count defaults to 999 (conservative).
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — low-variant / small log → inductive', () => {
  it('returns inductive when variant_count is explicitly < 20 and traces < 5,000', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 1_000, variant_count: 5 });
    expect(result.algo).toBe('inductive');
    expect(result.rationale).toMatch(/inductive/);
    expect(result.rationale).toContain('5 variants');
    expect(result.rationale).toContain('1,000 traces');
  });

  it('returns inductive for 0 variants and 100 traces (explicit zero)', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 100, variant_count: 0 });
    expect(result.algo).toBe('inductive');
  });

  it('returns inductive for exactly 19 variants and 4,999 traces (boundary)', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 4_999, variant_count: 19 });
    expect(result.algo).toBe('inductive');
  });

  it('does NOT return inductive when variant_count is exactly 20 (boundary — falls through)', () => {
    // variant_count=20 is NOT < 20, so the inductive branch does not fire.
    const result = selectAutopilotAlgorithm({ total_cases: 1_000, variant_count: 20 });
    // activities defaults to 0 (not > 100), traces=1,000 not > 10,000 → default dfg
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/default/);
  });

  it('does NOT return inductive for exactly 5,000 traces even with low variant count (boundary)', () => {
    // 5,000 is NOT < 5,000, so the inductive branch does not fire.
    const result = selectAutopilotAlgorithm({ total_cases: 5_000, variant_count: 5 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/default/);
  });
});

// ---------------------------------------------------------------------------
// Conservative default: missing variant_count → inductive does NOT fire
// This is the primary regression-prevention contract for the fix.
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — missing variant_count is conservative (defaults to 999)', () => {
  it('does NOT use inductive when variant_count is absent (unknown = conservative)', () => {
    // variant_count not provided → conservative default 999 → inductive branch does NOT fire
    const result = selectAutopilotAlgorithm({ total_cases: 1_000 });
    expect(result.algo).not.toBe('inductive');
    // 1,000 traces: not > 50,000; variants=999 not < 20; activities=0 not > 100;
    // 1,000 not > 10,000 → falls to default dfg
    expect(result.algo).toBe('dfg');
  });

  it('does NOT use inductive for an empty stats object (zero traces, unknown variants)', () => {
    // Before the fix, empty stats triggered inductive because variants=0 < 20.
    // After the fix, missing variant_count → 999 → inductive does NOT fire.
    // traces=0: not > 50,000; variants=999 not < 20 → skip inductive
    // activities=0 not > 100; traces=0 not > 10,000 → default dfg
    const result = selectAutopilotAlgorithm({});
    expect(result.algo).toBe('dfg');
  });

  it('does NOT use inductive for a tiny log (100 traces) when variant_count is absent', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 100 });
    expect(result.algo).not.toBe('inductive');
    expect(result.algo).toBe('dfg');
  });

  it('does NOT use inductive for 4,999 traces when variant_count is absent', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 4_999 });
    expect(result.algo).not.toBe('inductive');
    expect(result.algo).toBe('dfg');
  });
});

// ---------------------------------------------------------------------------
// Branch 3: activities > 100 → heuristic (high activity count)
// Priority: inductive (branch 2) fires BEFORE heuristic-activity (branch 3)
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — high activity count → heuristic', () => {
  it('returns heuristic for 101 activities when variant_count is absent and traces < 5,000', () => {
    // variant_count absent → 999 → inductive does NOT fire
    // activities=101 > 100 → heuristic fires
    const result = selectAutopilotAlgorithm({ total_cases: 100, unique_activities: 101 });
    expect(result.algo).toBe('heuristic');
    expect(result.rationale).toMatch(/activity count/);
  });

  it('returns inductive (not heuristic) when variant_count < 20 and activities > 100 and traces < 5,000', () => {
    // Inductive branch (2) has higher priority than heuristic-activity branch (3).
    const result = selectAutopilotAlgorithm({
      total_cases: 100,
      unique_activities: 101,
      variant_count: 5,
    });
    expect(result.algo).toBe('inductive');
  });

  it('returns heuristic for 101 activities with traces >= 5,000 but <= 10,000', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 7_000, unique_activities: 101 });
    expect(result.algo).toBe('heuristic');
    expect(result.rationale).toMatch(/activity count/);
  });

  it('returns heuristic for 200 activities with 8,000 traces', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 8_000, unique_activities: 200 });
    expect(result.algo).toBe('heuristic');
    expect(result.rationale).toContain('200');
  });
});

// ---------------------------------------------------------------------------
// Branch 4: traces > 10,000 → heuristic (medium-large log)
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — medium-large log (10,000 < traces ≤ 50,000)', () => {
  it('returns heuristic for 10,001 traces with few activities', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 10_001, unique_activities: 5 });
    expect(result.algo).toBe('heuristic');
    expect(result.rationale).toMatch(/medium-large log/);
  });

  it('returns heuristic for 30,000 traces', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 30_000 });
    expect(result.algo).toBe('heuristic');
  });
});

// ---------------------------------------------------------------------------
// Branch 5: default → dfg
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — default fallback → dfg', () => {
  it('returns dfg when traces is exactly 5,000 and activities <= 100 and variant_count absent', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 5_000, unique_activities: 50 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/default/);
  });

  it('returns dfg for traces=9,000 and activities=50 (between branches)', () => {
    // 9,000 >= 5,000 → inductive does not fire
    // activities=50 <= 100 → heuristic-activity does not fire
    // 9,000 <= 10,000 → medium-large heuristic does not fire
    // → default dfg
    const result = selectAutopilotAlgorithm({ total_cases: 9_000, unique_activities: 50 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toBe('default — fast, always produces a result');
  });
});

// ---------------------------------------------------------------------------
// Return shape contract
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — return shape', () => {
  it('always returns an object with algo and rationale string', () => {
    const cases: LogStats[] = [
      {},
      { total_cases: 100 },
      { total_cases: 60_000 },
      { total_cases: 8_000, unique_activities: 150 },
      { total_cases: 25_000 },
      { total_cases: 9_000 },
      { total_cases: 1_000, variant_count: 5 },
      { total_cases: 1_000, variant_count: 25 },
    ];
    for (const stats of cases) {
      const result = selectAutopilotAlgorithm(stats);
      expect(typeof result.algo).toBe('string');
      expect(result.algo.length).toBeGreaterThan(0);
      expect(typeof result.rationale).toBe('string');
      expect(result.rationale.length).toBeGreaterThan(0);
    }
  });
});
