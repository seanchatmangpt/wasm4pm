import { describe, it, expect, beforeEach } from "vitest";
import { CoordinationLog } from "../agent-coordination-log";

describe("AgentCoordinationLog", () => {
  let log: CoordinationLog;

  beforeEach(() => {
    log = new CoordinationLog();
  });

  describe("action_logging", () => {
    it("should log agent actions with full context", () => {
      log.log_action(100, "QLearning", "SARSA", "Scale", 0.5, -1);

      const actions = log.get_actions();
      expect(actions.length).toBe(1);

      const [cycle, action] = actions[0];
      expect(cycle).toBe(100);
      expect(action.active_agent).toBe("QLearning");
      expect(action.linucb_selected).toBe("SARSA");
      expect(action.action).toBe("Scale");
      expect(action.reward).toBe(0.5);
      expect(action.health_delta).toBe(-1);
    });

    it("should handle optional linucb_selected", () => {
      log.log_action(50, "SARSA", undefined, "Retry", 0.2, 0);

      const actions = log.get_actions();
      expect(actions[0][1].linucb_selected).toBeUndefined();
    });

    it("should maintain action history across multiple cycles", () => {
      log.log_action(1, "QLearning", "SARSA", "Continue", 0.1, 0);
      log.log_action(2, "SARSA", "DoubleQLearning", "Scale", 0.3, -1);
      log.log_action(3, "DoubleQLearning", "ExpectedSARSA", "Restart", 0.5, 1);

      const actions = log.get_actions();
      expect(actions.length).toBe(3);
      expect(actions[0][0]).toBe(1);
      expect(actions[1][0]).toBe(2);
      expect(actions[2][0]).toBe(3);
    });

    it("should update per-agent metrics on each action", () => {
      log.log_action(100, "QLearning", "SARSA", "Scale", 0.5, -1);
      log.log_action(101, "QLearning", "SARSA", "Continue", 0.3, 0);

      const metrics = log.get_agent_metrics();
      const ql_metrics = metrics.find((m) => m.agent_id === "QLearning");

      expect(ql_metrics).toBeDefined();
      expect(ql_metrics!.total_selections).toBe(2);
      expect(ql_metrics!.avg_reward).toBe(0.4); // (0.5 + 0.3) / 2
    });
  });

  describe("spc_correlation_tracking", () => {
    it("should log SPC alert correlation with recovery outcome", () => {
      log.log_spc_correlation(
        100,
        "rule_2_shift",
        "event_rate",
        "Scale",
        true,
        3
      );

      const correlations = log.get_spc_correlations();
      expect(correlations.length).toBe(1);

      const correlation = correlations[0];
      expect(correlation.cycle).toBe(100);
      expect(correlation.rule_fired).toBe("rule_2_shift");
      expect(correlation.metric).toBe("event_rate");
      expect(correlation.action_selected).toBe("Scale");
      expect(correlation.recovery_success).toBe(true);
      expect(correlation.alert_resolved_by_cycle).toBe(103);
      expect(correlation.recovery_latency_cycles).toBe(3);
    });

    it("should handle SPC correlations without recovery latency", () => {
      log.log_spc_correlation(
        50,
        "rule_1_outlier",
        "trace_duration",
        "Retry",
        false
      );

      const correlations = log.get_spc_correlations();
      const corr = correlations[0];
      expect(corr.alert_resolved_by_cycle).toBeUndefined();
      expect(corr.recovery_latency_cycles).toBeUndefined();
    });

    it("should track multiple SPC correlations deterministically", () => {
      log.log_spc_correlation(
        100,
        "rule_1_outlier",
        "event_rate",
        "Continue",
        false
      );
      log.log_spc_correlation(101, "rule_2_shift", "event_rate", "Scale", true, 2);
      log.log_spc_correlation(
        103,
        "rule_3_trend",
        "activity_frequency",
        "Restart",
        true,
        1
      );

      const correlations = log.get_spc_correlations();
      expect(correlations.length).toBe(3);
      expect(correlations[0].cycle).toBe(100);
      expect(correlations[1].cycle).toBe(101);
      expect(correlations[2].cycle).toBe(103);
    });
  });

  describe("ocel_export_structure", () => {
    it("should export valid OCEL structure with agents and alerts", () => {
      // Log some actions
      log.log_action(1, "QLearning", "SARSA", "Scale", 0.5, -1);
      log.log_action(2, "SARSA", "QLearning", "Continue", 0.2, 0);

      // Log SPC correlations
      log.log_spc_correlation(1, "rule_1_outlier", "event_rate", "Scale", true, 1);
      log.log_spc_correlation(3, "rule_2_shift", "event_rate", "Retry", true, 0);

      const ocel = log.export_ocel();

      // Verify OCEL structure
      expect(ocel.ocel).toBe("5.0");
      expect(ocel.version).toBe("1.0");
      expect(ocel.object_types).toContain("agent_run");
      expect(ocel.object_types).toContain("spc_alert");
      expect(ocel.object_types).toContain("recovery_event");
      expect(ocel.event_types).toContain("agent_action");
      expect(ocel.event_types).toContain("spc_rule_violation");
      expect(ocel.event_types).toContain("recovery_completed");
    });

    it("should create agent objects with correct metadata", () => {
      log.log_action(100, "DoubleQLearning", "ExpectedSARSA", "Retry", 0.7, -1);
      log.log_action(101, "DoubleQLearning", "REINFORCE", "Fallback", 0.3, 1);

      const ocel = log.export_ocel();

      expect(ocel.objects["agent:DoubleQLearning"]).toBeDefined();
      const agent_obj = ocel.objects["agent:DoubleQLearning"];
      expect(agent_obj.ocel_type).toBe("agent_run");
      expect(agent_obj.ovmap.agent_id).toBe("DoubleQLearning");
      expect(agent_obj.ovmap.total_selections).toBe(2);
      expect(agent_obj.ovmap.avg_reward).toBe(0.5); // (0.7 + 0.3) / 2
    });

    it("should create events with deterministic ordering", () => {
      // Log in non-deterministic order
      log.log_action(3, "Agent1", "Agent2", "Continue", 0.1, 0);
      log.log_action(1, "Agent1", "Agent2", "Scale", 0.5, -1);
      log.log_action(2, "Agent1", "Agent2", "Retry", 0.3, 0);

      const ocel = log.export_ocel();
      const events = ocel.events.filter((e) => e.event_type === "agent_action");

      // Events should be sorted by timestamp (which is determined by log order, but OCEL enforces ordering)
      expect(events.length).toBe(3);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp >= events[i - 1].timestamp).toBe(true);
      }
    });

    it("should create recovery events when applicable", () => {
      log.log_spc_correlation(10, "rule_1_outlier", "event_rate", "Scale", true, 2);
      log.log_spc_correlation(20, "rule_2_shift", "event_rate", "Retry", false);

      const ocel = log.export_ocel();

      // Should have 2 SPC alerts but only 1 recovery event (second one failed)
      const spc_events = ocel.events.filter((e) => e.event_type === "spc_rule_violation");
      const recovery_events = ocel.events.filter((e) => e.event_type === "recovery_completed");

      expect(spc_events.length).toBe(2);
      expect(recovery_events.length).toBe(1); // Only successful recovery creates event
    });
  });

  describe("deterministic_ordering", () => {
    it("should maintain cycle order in action log", () => {
      const cycles = [50, 10, 30, 20, 40];
      for (const cycle of cycles) {
        log.log_action(cycle, "Agent1", "Agent2", "Continue", 0.1, 0);
      }

      const actions = log.get_actions();
      const sorted_cycles = actions.map(([cycle]) => cycle);

      expect(sorted_cycles).toEqual([10, 20, 30, 40, 50]);
    });

    it("should export OCEL events in chronological order", () => {
      // Log events in random order
      log.log_action(50, "Agent1", "Agent2", "Scale", 0.5, -1);
      log.log_spc_correlation(30, "rule_1_outlier", "event_rate", "Scale", true, 1);
      log.log_action(10, "Agent1", "Agent2", "Continue", 0.2, 0);
      log.log_spc_correlation(40, "rule_2_shift", "event_rate", "Retry", true, 2);

      const ocel = log.export_ocel();

      // All events should be sorted by timestamp
      for (let i = 1; i < ocel.events.length; i++) {
        expect(ocel.events[i].timestamp >= ocel.events[i - 1].timestamp).toBe(true);
      }
    });
  });

  describe("edge_cases", () => {
    it("should handle empty log export", () => {
      const ocel = log.export_ocel();

      expect(ocel.ocel).toBe("5.0");
      expect(ocel.events.length).toBe(0);
      expect(ocel.objects).toEqual({});
    });

    it("should accumulate avg_reward correctly", () => {
      const rewards = [0.1, 0.2, 0.3, 0.4, 0.5];
      for (let i = 0; i < rewards.length; i++) {
        log.log_action(i, "TestAgent", undefined, "Continue", rewards[i], 0);
      }

      const metrics = log.get_agent_metrics();
      const test_agent = metrics[0];

      expect(test_agent.total_selections).toBe(5);
      const expected_avg = rewards.reduce((a, b) => a + b, 0) / rewards.length;
      expect(test_agent.avg_reward).toBeCloseTo(expected_avg, 5);
    });
  });
});
