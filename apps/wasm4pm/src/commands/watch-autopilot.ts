/**
 * watch-autopilot.ts
 *
 * Algorithm selection logic for the watch command autopilot mode.
 * Extracted so it can be unit-tested independently.
 */

import type { Algorithm } from './run.js';

export type LogStats = {
  total_cases?: number;
  total_events?: number;
  avg_events_per_case?: number;
  unique_activities?: number;
  variant_count?: number;
};

/**
 * Select the best discovery algorithm given event-log statistics.
 *
 * Decision tree (priority order, first match wins):
 *  1. traces > 50,000                     → dfg       (size guard: conformance-checking too expensive)
 *  2. variants < 20 && traces < 5,000     → inductive (low-variant log: clean tree)
 *  3. activities > 100                    → heuristic (high activity count: noise-tolerant)
 *  4. traces > 10,000                     → heuristic (medium-large log: speed/quality balance)
 *  5. default                             → dfg       (fast, always produces a result)
 *
 * When variant_count is absent (caller did not compute it), we default to 999
 * so branch 2 does NOT fire.  This is the conservative safe default: prefer
 * the fast dfg over the inductive miner when variant information is unknown.
 */
export function selectAutopilotAlgorithm(stats: LogStats): { algo: Algorithm; rationale: string } {
  const traces = stats.total_cases ?? 0;
  // Unknown variant count → assume many (999) so the inductive branch does NOT fire.
  // Callers that have computed variant_count should pass it explicitly.
  const variants = stats.variant_count ?? 999;
  const activities = stats.unique_activities ?? 0;

  if (traces > 50_000)
    return { algo: 'dfg', rationale: `log too large for conformance-checking (${traces.toLocaleString()} traces)` };
  if (variants < 20 && traces < 5_000)
    return { algo: 'inductive', rationale: `low-variant log (${variants} variants, ${traces.toLocaleString()} traces) — inductive produces clean process tree` };
  if (activities > 100)
    return { algo: 'heuristic', rationale: `high activity count (${activities}) — heuristic handles noise well` };
  if (traces > 10_000)
    return { algo: 'heuristic', rationale: `medium-large log (${traces.toLocaleString()} traces) — heuristic balances speed and quality` };

  return { algo: 'dfg', rationale: 'default — fast, always produces a result' };
}
