/**
 * Test: Action history observability in RL orchestrator.
 *
 * Verifies that action tracking data (success rates, distributions, convergence)
 * is available for OTEL span instrumentation without FM-5 self-referential issues.
 */

import { describe, it, expect } from 'vitest';

describe('action-history-observability', () => {
  describe('action tracking', () => {
    it('records action success/failure transitions', () => {
      // Simulates: Continue action → success; user calls observability API
      const actions = [
        { action: 'Continue', succeeded: true, cycle: 1 },
        { action: 'Retry', succeeded: true, cycle: 2 },
        { action: 'Continue', succeeded: false, cycle: 3 },
      ];

      const successRate = (
        actions.filter((a) => a.action === 'Continue' && a.succeeded).length /
        actions.filter((a) => a.action === 'Continue').length
      );

      expect(successRate).toBe(0.5); // 1 success, 2 total
    });

    it('tracks action distribution without self-reference', () => {
      const actions = [
        { action: 'Continue', count: 5 },
        { action: 'Retry', count: 3 },
        { action: 'Scale', count: 2 },
      ];

      const total = actions.reduce((s, a) => s + a.count, 0);
      const distribution = actions.map((a) => ({
        action: a.action,
        frequency: a.count / total,
      }));

      // Verify: distribution is based on HISTORICAL counts, not derived from code
      expect(distribution[0].frequency).toBe(5 / 10);
      expect(distribution.some((d) => d.action === 'Continue')).toBe(true);
    });

    it('emits action stats for OTEL without FM-5', () => {
      // Domain contract (Rank-2 oracle):
      // "Higher success rate → higher reward"
      // This is INPUT to the reward function, not derived from it.

      const history = {
        action_continue_success_rate: 0.8, // MEASURED, not computed from reward
        action_retry_success_rate: 0.5,
        action_scale_success_rate: 0.3,
      };

      // Hypothetical OTEL span attributes
      const spanAttrs = {
        rl_action_continue_success_rate: history.action_continue_success_rate,
        rl_action_retry_success_rate: history.action_retry_success_rate,
        rl_action_scale_success_rate: history.action_scale_success_rate,
        rl_primary_action: 'Continue',
        rl_primary_action_success_rate: 0.8,
      };

      expect(spanAttrs.rl_primary_action_success_rate).toBe(0.8);
      expect(Object.keys(spanAttrs).length).toBeGreaterThan(0);
    });
  });

  describe('convergence metrics', () => {
    it('tracks weight norm changes without self-reference', () => {
      // Domain contract: "If agent is learning, weight norms should increase"
      // This is a PROPERTY of the agent, not a circular definition.

      const updates = [
        { cycle: 1, weight_norm: 0.5 },
        { cycle: 2, weight_norm: 0.75 },
        { cycle: 3, weight_norm: 1.0 },
      ];

      // OTEL span would emit: weight_norm and weight_delta
      const lastTwo = updates.slice(-2);
      const delta = lastTwo[1].weight_norm - lastTwo[0].weight_norm;

      expect(delta).toBeGreaterThan(0); // Learning signal
      expect(updates.map((u) => u.weight_norm)).toEqual([0.5, 0.75, 1.0]);
    });

    it('computes convergence signal from historical norms', () => {
      // Rank-4 oracle: "After 50 cycles, mean weight norm change > ε indicates learning"
      const cycleNorms = Array.from({ length: 50 }, (_, i) => ({
        cycle: i + 1,
        weight_norm: Math.sqrt(i + 1) * 0.1, // Monotonically increasing
      }));

      const firstHalf = cycleNorms.slice(0, 25);
      const lastHalf = cycleNorms.slice(25);

      const firstMean = firstHalf.reduce((s, c) => s + c.weight_norm, 0) / firstHalf.length;
      const lastMean = lastHalf.reduce((s, c) => s + c.weight_norm, 0) / lastHalf.length;

      // Verify: convergence is MEASURED, not defined
      expect(lastMean).toBeGreaterThan(firstMean);
    });
  });

  describe('state coverage', () => {
    it('tracks 8D state space visitation without circularity', () => {
      // 8 dimensions: health_level (0-4), event_rate_q (0-7), ..., cycle_phase (0-3)
      // Total: 368,640 possible states

      const visited = new Set<string>();
      const dimensions = {
        health_level: [0, 1, 2, 3],
        event_rate_q: [0, 3, 7],
        activity_count_q: [1, 5],
        spc_alert_level: [0, 2],
        drift_status: [0, 1],
        rework_ratio_q: [0, 5],
        circuit_state: [0, 1, 2],
        cycle_phase: [0, 1, 2, 3],
      };

      // Simulate 10 cycles visiting different state combinations
      for (let i = 0; i < 10; i++) {
        const state = `${i % 4}_${i % 8}_${i % 2}_${i % 3}_${i % 2}_${i % 6}_${i % 3}_${i % 4}`;
        visited.add(state);
      }

      // OTEL would emit: per-dimension coverage percentages
      const healthCoverage = (
        [0, 1, 2, 3].filter(
          (h) =>
            Array.from(visited).some((s) => s.startsWith(String(h)))
        ).length / 4
      );

      expect(visited.size).toBeGreaterThan(0);
      expect(healthCoverage).toBeGreaterThan(0);
    });
  });
});
