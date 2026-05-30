import { describe, it, expect } from 'vitest';
import { CoordinationLog } from '@wasm4pm/observability';
import type { AgentMetrics } from '@wasm4pm/observability';

/**
 * PROOF: RL TD-error / convergence span contract.
 *
 * INVARIANT — the autonomic loop records per-agent metrics carrying a numeric
 * reward (TD-error driven) and a `convergence_status` that is one of the two
 * documented states {'learning','converged'}. The Rust orchestrator emits the
 * `rl.convergence_diagnostics` OTEL span with td_error + convergence_status; the
 * TS-reachable surface for that contract is the CoordinationLog typed schema in
 * @wasm4pm/observability (agent-coordination-log.ts).
 *
 * Grounded in real exports:
 *  - @wasm4pm/observability → CoordinationLog class (agent-coordination-log.ts:65)
 *    .log_action() / .get_agent_metrics()
 *  - AgentMetrics.convergence_status documented as "learning" | "converged"
 *    (agent-coordination-log.ts:24); avg_reward is the numeric reward signal.
 *
 * NOTE: the live `td_error` numeric is emitted only from the Rust WASM span
 * (rl.convergence_diagnostics). From TS we exercise the CONTRACT/SHAPE via the
 * CoordinationLog metrics surface and assert the documented invariants.
 *
 * Anti-FM-5: assert Number.isFinite(reward) and convergence_status membership —
 * NOT a value derived from the orchestrator's reward formula.
 */
describe('rl.proof — TD-error / convergence span shape', () => {
  it('agent metrics carry a finite reward and a documented convergence_status', () => {
    const log = new CoordinationLog();
    // Record one cycle action; running-avg reward stands in for the TD-driven signal.
    log.log_action(0, 'QLearning', 'QLearning', 'Continue', 0.42, -1);

    const metrics: AgentMetrics[] = log.get_agent_metrics();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);

    const m = metrics[0];
    // TD-error-driven reward must be a finite number (no NaN/Inf).
    expect(Number.isFinite(m.avg_reward)).toBe(true);

    // convergence_status must be one of the two documented states.
    expect(['learning', 'converged']).toContain(m.convergence_status);
  });
});
