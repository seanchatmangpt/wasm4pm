/**
 * watch-autopilot.test.ts
 *
 * Unit tests for selectAutopilotAlgorithm — the branch logic that chooses
 * a discovery algorithm from event-log statistics.
 *
 * Oracle rank: Rank-2 (domain contract) — the thresholds are design decisions
 * documented in watch.ts comments.  Deleting the function body would cause
 * every assertion here to fail immediately.
 *
 * No mocking: we import the real implementation.
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
    // 50,000 is NOT > 50,000, so the first guard does not fire
    const result = selectAutopilotAlgorithm({ total_cases: 50_000 });
    // Should reach the inductive branch (variants==0 < 20 and traces==50,000 < 5,000 is FALSE)
    // so continues to activity / medium-large branch; 50,000 > 10,000 → heuristic
    expect(result.algo).toBe('heuristic');
  });
});

// ---------------------------------------------------------------------------
// Branch 2: variants < 20 && traces < 5,000 → inductive
// (variants is hard-coded to 0 inside the function, so this branch always
//  fires for traces < 5,000 as long as we haven't already returned)
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — low-variant / small log → inductive', () => {
  it('returns inductive for a tiny log (100 traces)', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 100 });
    expect(result.algo).toBe('inductive');
    expect(result.rationale).toMatch(/inductive/);
  });

  it('returns inductive when total_cases is undefined (defaults to 0)', () => {
    const result = selectAutopilotAlgorithm({});
    expect(result.algo).toBe('inductive');
  });

  it('returns inductive for exactly 4,999 traces', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 4_999 });
    expect(result.algo).toBe('inductive');
  });

  it('does NOT return inductive for exactly 5,000 traces (boundary — falls through)', () => {
    // 5,000 is NOT < 5,000, so this branch does not fire.
    // activities defaults to 0, which is not > 100; traces==5,000 is not > 10,000
    // → falls through to the default dfg branch
    const result = selectAutopilotAlgorithm({ total_cases: 5_000 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/default/);
  });
});

// ---------------------------------------------------------------------------
// Branch 3: activities > 100 → heuristic (high activity count)
// ---------------------------------------------------------------------------
describe('selectAutopilotAlgorithm — high activity count → heuristic', () => {
  it('returns heuristic for 101 unique activities (low trace count)', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 100, unique_activities: 101 });
    // 100 traces < 5,000, so the inductive branch fires FIRST.
    // This tests the priority order: inductive beats heuristic when both conditions hold.
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
  it('returns dfg when traces is exactly 5,000 and activities <= 100', () => {
    const result = selectAutopilotAlgorithm({ total_cases: 5_000, unique_activities: 50 });
    expect(result.algo).toBe('dfg');
    expect(result.rationale).toMatch(/default/);
  });

  it('returns inductive (not dfg) for an empty stats object — zero cases < 5,000', () => {
    // total_cases defaults to 0 which is < 5,000 → branch 2 (inductive) fires before default
    const result = selectAutopilotAlgorithm({});
    expect(result.algo).toBe('inductive');
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
