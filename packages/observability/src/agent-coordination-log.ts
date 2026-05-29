/**
 * Agent Coordination Log — Track RL agent actions, SPC alerts, and recovery events
 *
 * Provides observability into:
 * - Per-cycle agent selection and actions
 * - Agent-specific performance metrics
 * - SPC alert correlation with recovery outcomes
 * - OCEL export for process mining conformance validation
 */

export interface CycleAction {
  active_agent: string;
  linucb_selected?: string;
  action: string;
  reward: number;
  health_delta: number;
  timestamp_ns: number;
}

export interface AgentMetrics {
  agent_id: string;
  total_selections: number;
  avg_reward: number;
  convergence_status: string; // "learning" | "converged"
  last_updated_ns: number;
}

export interface SpcCorrelation {
  cycle: number;
  rule_fired: string; // "rule_1_outlier" | "rule_2_shift" | "rule_3_trend" | "rule_4_two_of_three"
  metric: string;
  action_selected: string;
  alert_resolved_by_cycle?: number;
  recovery_latency_cycles?: number;
  recovery_success: boolean;
  timestamp_ns: number;
}

export interface OcelEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  object_id: string;
  object_type: string;
  [key: string]: unknown;
}

export interface OcelLog {
  ocel: string;
  version: string;
  object_types: string[];
  event_types: string[];
  events: OcelEvent[];
  objects: {
    [object_id: string]: {
      ocel_type: string;
      ovmap: Record<string, unknown>;
    };
  };
}

/**
 * Coordination log for tracking RL agent actions and SPC correlations
 */
export class CoordinationLog {
  private per_cycle_actions: Map<number, CycleAction> = new Map();
  private per_agent_metrics: Map<string, AgentMetrics> = new Map();
  private spc_alert_correlation: SpcCorrelation[] = [];
  private next_event_id: number = 1;

  /**
   * Log an action taken by an RL agent in a specific cycle
   */
  public log_action(
    cycle: number,
    agent: string,
    linucb_selected: string | undefined,
    action: string,
    reward: number,
    health_delta: number
  ): void {
    const timestamp_ns = Date.now() * 1_000_000;

    const cycle_action: CycleAction = {
      active_agent: agent,
      linucb_selected,
      action,
      reward,
      health_delta,
      timestamp_ns,
    };

    this.per_cycle_actions.set(cycle, cycle_action);

    // Update per-agent metrics
    const agent_key = agent;
    let metrics = this.per_agent_metrics.get(agent_key);

    if (!metrics) {
      metrics = {
        agent_id: agent_key,
        total_selections: 0,
        avg_reward: 0,
        convergence_status: "learning",
        last_updated_ns: timestamp_ns,
      };
    }

    // Update running average reward
    const prev_total = metrics.total_selections;
    const prev_avg = metrics.avg_reward;
    metrics.total_selections += 1;
    metrics.avg_reward =
      (prev_total * prev_avg + reward) / metrics.total_selections;
    metrics.last_updated_ns = timestamp_ns;

    this.per_agent_metrics.set(agent_key, metrics);
  }

  /**
   * Log SPC alert detection and correlation with RL action
   */
  public log_spc_correlation(
    cycle: number,
    rule_fired: string,
    metric: string,
    action_selected: string,
    recovery_success: boolean,
    recovery_latency_cycles?: number
  ): void {
    const timestamp_ns = Date.now() * 1_000_000;

    const correlation: SpcCorrelation = {
      cycle,
      rule_fired,
      metric,
      action_selected,
      recovery_success,
      timestamp_ns,
    };

    if (recovery_latency_cycles !== undefined) {
      correlation.alert_resolved_by_cycle = cycle + recovery_latency_cycles;
      correlation.recovery_latency_cycles = recovery_latency_cycles;
    }

    this.spc_alert_correlation.push(correlation);
  }

  /**
   * Get all logged actions in deterministic order (by cycle)
   */
  public get_actions(): Array<[number, CycleAction]> {
    return Array.from(this.per_cycle_actions.entries()).sort((a, b) =>
      a[0] - b[0]
    );
  }

  /**
   * Get per-agent metrics
   */
  public get_agent_metrics(): AgentMetrics[] {
    return Array.from(this.per_agent_metrics.values());
  }

  /**
   * Get SPC correlations
   */
  public get_spc_correlations(): SpcCorrelation[] {
    return [...this.spc_alert_correlation];
  }

  /**
   * Export coordination log as OCEL (Object-Centric Event Log) JSON
   * For use with pm4py and wasm4pm conformance checking
   */
  public export_ocel(): OcelLog {
    const events: OcelEvent[] = [];
    const objects: OcelLog['objects'] = {};

    // Create agent objects
    for (const [agent_id, metrics] of this.per_agent_metrics) {
      objects[`agent:${agent_id}`] = {
        ocel_type: "agent_run",
        ovmap: {
          agent_id,
          total_selections: metrics.total_selections,
          avg_reward: metrics.avg_reward,
          convergence_status: metrics.convergence_status,
          last_updated_ns: metrics.last_updated_ns,
        },
      };
    }

    // Create agent_action events (ordered by cycle)
    const actions = this.get_actions();
    for (const [cycle, action] of actions) {
      const event_id = `event_${this.next_event_id++}`;
      const timestamp_iso = new Date(Math.floor(action.timestamp_ns / 1_000_000))
        .toISOString();

      events.push({
        event_id,
        event_type: "agent_action",
        timestamp: timestamp_iso,
        object_id: `agent:${action.active_agent}`,
        object_type: "agent_run",
        cycle,
        action: action.action,
        reward: action.reward,
        health_delta: action.health_delta,
        linucb_selected: action.linucb_selected || "manual",
      });
    }

    // Create SPC alert and recovery events
    for (const correlation of this.spc_alert_correlation) {
      const alert_event_id = `event_${this.next_event_id++}`;
      const alert_obj_id = `spc_alert:${correlation.cycle}:${correlation.metric}`;

      // Create SPC alert object
      objects[alert_obj_id] = {
        ocel_type: "spc_alert",
        ovmap: {
          cycle: correlation.cycle,
          rule_fired: correlation.rule_fired,
          metric: correlation.metric,
          timestamp_ns: correlation.timestamp_ns,
        },
      };

      const alert_timestamp_iso = new Date(
        Math.floor(correlation.timestamp_ns / 1_000_000)
      )
        .toISOString();

      // SPC alert detection event
      events.push({
        event_id: alert_event_id,
        event_type: "spc_rule_violation",
        timestamp: alert_timestamp_iso,
        object_id: alert_obj_id,
        object_type: "spc_alert",
        rule_fired: correlation.rule_fired,
        metric: correlation.metric,
      });

      // Recovery event (if recovery occurred)
      if (
        correlation.recovery_success &&
        correlation.alert_resolved_by_cycle !== undefined
      ) {
        const recovery_event_id = `event_${this.next_event_id++}`;
        const recovery_obj_id = `recovery_event:${correlation.cycle}`;

        objects[recovery_obj_id] = {
          ocel_type: "recovery_event",
          ovmap: {
            triggered_by_cycle: correlation.cycle,
            action_taken: correlation.action_selected,
            recovery_latency_cycles: correlation.recovery_latency_cycles || 0,
            timestamp_ns: correlation.timestamp_ns,
          },
        };

        const recovery_timestamp_iso = new Date(
          Math.floor(
            (correlation.timestamp_ns +
              (correlation.recovery_latency_cycles || 0) * 100_000_000) /
              1_000_000
          )
        )
          .toISOString();

        events.push({
          event_id: recovery_event_id,
          event_type: "recovery_completed",
          timestamp: recovery_timestamp_iso,
          object_id: recovery_obj_id,
          object_type: "recovery_event",
          success: true,
          latency_cycles: correlation.recovery_latency_cycles || 0,
        });
      }
    }

    // Sort events by timestamp for deterministic ordering
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      ocel: "5.0",
      version: "1.0",
      object_types: ["agent_run", "spc_alert", "recovery_event"],
      event_types: ["agent_action", "spc_rule_violation", "recovery_completed"],
      events,
      objects,
    };
  }

  /**
   * Clear all logged data
   */
  public clear(): void {
    this.per_cycle_actions.clear();
    this.per_agent_metrics.clear();
    this.spc_alert_correlation = [];
    this.next_event_id = 1;
  }
}
