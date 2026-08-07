import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';
import type { AgentMode } from '@wasm4pm/agents';
import { exitWithFlush } from '../../otel/exit.js';

/** The 5 RL agent definitions (mirrors AgentType enum in Rust). */
const RL_AGENT_META = [
  { name: 'QLearning', type: 'Off-policy TD', idx: 0 },
  { name: 'SARSA', type: 'On-policy TD', idx: 1 },
  { name: 'DoubleQLearning', type: 'Off-policy TD', idx: 2 },
  { name: 'ExpectedSARSA', type: 'On-policy TD', idx: 3 },
  { name: 'REINFORCE', type: 'Policy gradient', idx: 4 },
];

interface RlTelemetry {
  cycle_count: number;
  last_health_state: number;
  cumulative_reward: number;
  last_reward: number;
  last_spc_alert_count: number;
  active_agent_name: string;
  consecutive_successes: number;
  last_norm: number;
}

interface RlAgentEntry {
  name: string;
  type: string;
  idx: number;
  status: 'selected' | 'standby';
  cycles_as_active: number;
  avg_reward: number;
}

/**
 * Try to load RL telemetry from WASM. Returns null only when the module/export is
 * genuinely absent (legitimate degraded-mode display). A thrown Err from a present
 * export propagates — it must fail the command, not render fabricated zeroed
 * telemetry as if the orchestrator were healthy.
 */
async function tryLoadRlTelemetry(): Promise<RlTelemetry | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm = await (import('wasm4pm') as Promise<any>).catch(() => null);
  if (!wasm) return null;
  const fn = wasm['rl_orchestrator_telemetry'];
  if (typeof fn !== 'function') return null;
  const raw = (fn as () => string)();
  return JSON.parse(raw) as RlTelemetry;
}

/**
 * Try to load active agent index from WASM. Returns null only when the module/export
 * is genuinely absent; a thrown Err from a present export propagates (see
 * tryLoadRlTelemetry doc above).
 */
async function tryGetActiveAgentIdx(): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm = await (import('wasm4pm') as Promise<any>).catch(() => null);
  if (!wasm) return null;
  const fn = wasm['rl_orchestrator_active_agent'];
  if (typeof fn !== 'function') return null;
  return (fn as () => number)();
}

/** Pad a string to a minimum width. */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export const list = defineCommand({
  meta: {
    name: 'list',
    description: 'List all registered agents — Van der Aalst process-mining agents and RL autonomic agents',
  },
  args: {
    filter: {
      type: 'string',
      description: 'Filter by mode (continuous|on_demand) — applies to VdA agents only',
    },
    rl: {
      type: 'boolean',
      description: 'Show only RL agents (QLearning, SARSA, DoubleQLearning, ExpectedSARSA, REINFORCE)',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Show thresholds, tags, and RL weight norms',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.agent.list', {
      command: 'agent', subcommand: 'list',
      filter: String(ctx.args.filter ?? ''),
      rl: String(ctx.args.rl ?? false),
    }, async () => {
      const t0 = performance.now();
      const format = (ctx.args.format as 'json' | 'human') ?? 'human';
      const verbose = Boolean(ctx.args.verbose);
      const quiet = Boolean(ctx.args.quiet);
      const rlOnly = Boolean(ctx.args.rl);

      try {
        // Load VdA agents from registry
        const registry = new AgentRegistry();
        const filter = ctx.args.filter as AgentMode | undefined;
        const vdaAgents = rlOnly ? [] : registry.listAgents(filter);
        const summary = registry.getSummary();

        // Load RL telemetry from WASM (best-effort)
        const [rlTelemetry, activeAgentIdx] = await Promise.all([
          tryLoadRlTelemetry(),
          tryGetActiveAgentIdx(),
        ]);

        const activeIdx = activeAgentIdx ?? (rlTelemetry?.active_agent_name
          ? RL_AGENT_META.findIndex((a) => a.name === rlTelemetry.active_agent_name)
          : 0);

        // Build RL agent rows — derive stats from telemetry where available
        const rlAgents: RlAgentEntry[] = RL_AGENT_META.map((meta) => {
          const isActive = meta.idx === activeIdx;
          // When telemetry is available: active agent gets actual cumulative_reward
          // Standby agents show 0 (we only have aggregate telemetry, not per-agent breakdown)
          const avgReward = isActive && rlTelemetry
            ? (rlTelemetry.cumulative_reward / Math.max(1, rlTelemetry.cycle_count))
            : 0;
          return {
            name: meta.name,
            type: meta.type,
            idx: meta.idx,
            status: isActive ? 'selected' : 'standby',
            cycles_as_active: isActive ? (rlTelemetry?.cycle_count ?? 0) : 0,
            avg_reward: avgReward,
          };
        });

        const payload = {
          vda_agents: vdaAgents,
          rl_agents: rlAgents,
          agents: vdaAgents,
          summary,
          rl_telemetry: rlTelemetry,
        };
        const result = makeResult('agent list', payload, performance.now() - t0, EXIT_CODES.success);

        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          const p = res.payload as typeof payload;

          if (!rlOnly) {
            // Section 1: Van der Aalst Process Mining Agents
            projection.log('');
            projection.log('Van der Aalst Process Mining Agents');
            projection.log('=====================================');
            projection.log(
              `  ${p.summary.active} active, ${p.summary.disabled} disabled, ${p.summary.error} error`
            );
            projection.log('');

            const hdr = `  ${'Name'.padEnd(32)} ${'Mode'.padEnd(12)} ${'Status'.padEnd(10)} Runs  Violations`;
            projection.log(hdr);
            projection.log('  ' + '-'.repeat(hdr.length - 2));

            for (const agent of p.vda_agents) {
              const statusIcon = agent.status === 'active' ? '✔' :
                agent.status === 'disabled' ? '–' :
                agent.status === 'error' ? '✘' : '?';
              const modeLabel = agent.config.mode === 'continuous' ? 'continuous' : 'on-demand';
              projection.log(
                `  ${statusIcon} ${pad(agent.config.name, 30)} ${pad(modeLabel, 12)} ${pad(agent.status, 10)} ` +
                `${String(agent.total_runs).padStart(4)}  ${String(agent.total_violations).padStart(10)}`
              );
              if (verbose) {
                projection.log(`     ${agent.config.description}`);
                if (agent.config.target_gates.length > 0)
                  projection.log(`     Gates: ${agent.config.target_gates.join(', ')}`);
                if (agent.config.tags.length > 0)
                  projection.log(`     Tags:  ${agent.config.tags.join(', ')}`);
              }
            }
          }

          // Section 2: RL Autonomic Agents
          projection.log('');
          projection.log('RL Autonomic Agents');
          projection.log('====================');
          if (p.rl_telemetry) {
            const t = p.rl_telemetry;
            const healthLabels = ['Normal', 'Warning', 'Degraded', 'Critical', 'Failed'];
            projection.log(
              `  Cycles: ${t.cycle_count}  Health: ${healthLabels[t.last_health_state] ?? 'Unknown'}  ` +
              `Reward: ${t.cumulative_reward >= 0 ? '+' : ''}${t.cumulative_reward.toFixed(2)}  ` +
              `Consecutive OK: ${t.consecutive_successes}`
            );
          } else {
            projection.log('  (WASM not loaded — showing static agent definitions)');
          }
          projection.log('');

          const rlHdr = `  ${'Name'.padEnd(18)} ${'Type'.padEnd(18)} ${'Status'.padEnd(10)} ${'Cycles'.padEnd(8)} ${'Avg Reward'.padEnd(12)}`;
          projection.log(rlHdr);
          projection.log('  ' + '-'.repeat(rlHdr.length - 2));

          for (const rl of p.rl_agents) {
            const isActive = rl.status === 'selected';
            const marker = isActive ? '► ' : '  ';
            const activeLabel = isActive ? 'selected' : 'standby';
            const rewardStr = rl.avg_reward > 0 ? `+${rl.avg_reward.toFixed(3)}` :
              rl.avg_reward < 0 ? rl.avg_reward.toFixed(3) : '  0.000';
            const cycleStr = rl.cycles_as_active > 0 ? String(rl.cycles_as_active) : '—';
            projection.log(
              `${marker}${pad(rl.name, 18)} ${pad(rl.type, 18)} ${pad(activeLabel, 10)} ${pad(cycleStr, 8)} ${rewardStr}` +
              (isActive ? '  ← ACTIVE' : '')
            );
          }

          if (p.rl_telemetry) {
            projection.log('');
            projection.log(`  LinUCB selection: ${p.rl_telemetry.active_agent_name} ` +
              `(weight norm: ${p.rl_telemetry.last_norm.toFixed(4)})`);
          }
          projection.log('');
        });

        return await exitWithFlush(result.exit_code);
      } catch (error) {
        const result = makeErrorResult('agent list', error, EXIT_CODES.execution_error, 'AGENT_LIST_ERROR');
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    });
  },
});
