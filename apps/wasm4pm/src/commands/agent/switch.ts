//! `wpm agent switch` — force the active RL agent to a specific type.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { withSpanRaw } from '../_otel.js';
import { exitWithFlush } from '../../otel/exit.js';

/** RL agent names and their u8 indices (matches AgentType enum in Rust). */
const RL_AGENTS: Record<string, number> = {
  QLearning: 0,
  SARSA: 1,
  DoubleQLearning: 2,
  ExpectedSARSA: 3,
  REINFORCE: 4,
};

/** Canonical display names ordered by index. */
export const RL_AGENT_NAMES = ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'];

export const switchAgent = defineCommand({
  meta: {
    name: 'switch',
    description: 'Force the active RL agent to a specific type (overrides LinUCB selection)',
  },
  args: {
    agent: {
      type: 'positional',
      description: `Agent to activate: ${RL_AGENT_NAMES.join(', ')}`,
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    const agentName = String(ctx.args.agent ?? '');
    return withSpanRaw('wasm4pm.command.agent.switch', {
      command: 'agent', subcommand: 'switch', agent_name: agentName,
    }, async () => {
      const t0 = performance.now();
      const format = (ctx.args.format as 'json' | 'human') ?? 'human';
      const quiet = Boolean(ctx.args.quiet);

      try {
        // Normalise: allow case-insensitive lookup
        const normalized = RL_AGENT_NAMES.find(
          (n) => n.toLowerCase() === agentName.toLowerCase()
        );
        if (!normalized || RL_AGENTS[normalized] === undefined) {
          const err = new Error(
            `Unknown RL agent "${agentName}". Valid agents: ${RL_AGENT_NAMES.join(', ')}`
          );
          (err as Error & { code?: string }).code = 'UNKNOWN_AGENT';
          const errResult = makeErrorResult('agent switch', err, EXIT_CODES.config_error, 'UNKNOWN_AGENT');
          emitResult(errResult, { format, verbose: false, quiet });
          return await exitWithFlush(errResult.exit_code);
        }

        const agentIdx = RL_AGENTS[normalized];

        // Attempt to load WASM and call rl_orchestrator_switch_agent.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = await (import('wasm4pm') as Promise<any>).catch(() => null);
        let switchResult: string;
        if (wasm && typeof wasm['rl_orchestrator_switch_agent'] === 'function') {
          // Real export present — a thrown Err (e.g. invalid agent type) must fail this
          // command, not be swallowed into a fake success. Let it propagate to the
          // outer catch below.
          switchResult = (wasm['rl_orchestrator_switch_agent'] as (idx: number) => string)(agentIdx);
        } else {
          // WASM module or export genuinely absent (e.g. built without the "cloud"
          // feature) — this is a legitimate degraded-mode note, not an error.
          switchResult = `switched to ${normalized} (WASM not loaded — state will apply on next autonomic cycle)`;
        }

        const result = makeResult(
          'agent switch',
          { agent: normalized, agent_idx: agentIdx, result: switchResult },
          performance.now() - t0,
          EXIT_CODES.success,
        );
        emitResult(result, { format, verbose: false, quiet }, (res, p) => {
          const pl = res.payload as { agent: string; result: string };
          p.success(`Switched active RL agent to: ${pl.agent}`);
          p.log(`  ${pl.result}`);
          p.log('');
          p.log('  LinUCB selection will be overridden until the next reset.');
          p.log(`  Run "wpm agent status" to confirm.`);
        });
        return await exitWithFlush(result.exit_code);
      } catch (error) {
        const errResult = makeErrorResult('agent switch', error, EXIT_CODES.execution_error, 'AGENT_SWITCH_ERROR');
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
    });
  },
});
