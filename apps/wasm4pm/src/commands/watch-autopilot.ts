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
};

/**
 * Select the best discovery algorithm given event-log statistics.
 *
 * Decision tree (priority order, first match wins):
 *  1. traces > 50,000          → dfg     (size guard: conformance-checking too expensive)
 *  2. variants < 20 && traces < 5,000 → inductive (low-variant log: clean tree)
 *  3. activities > 100         → heuristic (high activity count: noise-tolerant)
 *  4. traces > 10,000          → heuristic (medium-large log: speed/quality balance)
 *  5. default                  → dfg     (fast, always produces a result)
 *
 * NOTE: variants is hard-coded to 0 because analyze_event_statistics does not
 * return variant count.  Branch 2 therefore fires whenever traces < 5,000.
 */
export function selectAutopilotAlgorithm(stats: LogStats): { algo: Algorithm; rationale: string } {
  const traces = stats.total_cases ?? 0;
  const variants = 0; // analyze_event_statistics does not return variant count
  const activities = stats.unique_activities ?? 0;

  if (traces > 50_000)
    return { algo: 'dfg', rationale: `log too large for conformance-checking (${traces.toLocaleString()} traces)` };
  if (variants < 20 && traces < 5_000)
    return { algo: 'inductive', rationale: `low-variant log (${variants} variants) — inductive produces clean process tree` };
  if (activities > 100)
    return { algo: 'heuristic', rationale: `high activity count (${activities}) — heuristic handles noise well` };
  if (traces > 10_000)
    return { algo: 'heuristic', rationale: `medium-large log (${traces.toLocaleString()} traces) — heuristic balances speed and quality` };

  return { algo: 'dfg', rationale: 'default — fast, always produces a result' };
}
