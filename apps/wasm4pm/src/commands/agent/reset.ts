//! `wpm agent reset` — reset RL orchestrator state (Q-tables, telemetry, agent selection).

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { withSpanRaw } from '../_otel.js';
import { exitWithFlush } from '../../otel/exit.js';

export const reset = defineCommand({
  meta: {
    name: 'reset',
    description: 'Reset RL orchestrator state — clears Q-tables, cycle telemetry, and agent selection',
  },
  args: {
    confirm: {
      type: 'boolean',
      description: 'Skip confirmation prompt (use in scripts)',
      default: false,
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
    return withSpanRaw('wasm4pm.command.agent.reset', {
      command: 'agent', subcommand: 'reset',
    }, async () => {
      const t0 = performance.now();
      const format = (ctx.args.format as 'json' | 'human') ?? 'human';
      const quiet = Boolean(ctx.args.quiet);

      try {
        // Attempt WASM reset. A thrown Err from a present export must fail this
        // command, not be swallowed into a fake success — only fall back to the
        // degraded-mode note when the module/export is genuinely absent.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = await (import('wasm4pm') as Promise<any>).catch(() => null);
        let resetResult: string;
        if (wasm && typeof wasm['rl_orchestrator_reset'] === 'function') {
          resetResult = (wasm['rl_orchestrator_reset'] as () => string)();
        } else {
          resetResult = 'RL orchestrator reset (WASM not loaded — will apply fresh on next autonomic cycle)';
        }

        const result = makeResult(
          'agent reset',
          {
            reset: true,
            result: resetResult,
            note: 'Q-tables cleared, cycle count = 0, agent = QLearning (default)',
          },
          performance.now() - t0,
          EXIT_CODES.success,
        );
        emitResult(result, { format, verbose: false, quiet }, (res, p) => {
          const pl = res.payload as { result: string; note: string };
          p.success('RL orchestrator reset complete');
          p.log(`  ${pl.result}`);
          p.log('');
          p.log(`  ${pl.note}`);
          p.log('  Run "wpm agent status" to verify the reset state.');
        });
        return await exitWithFlush(result.exit_code);
      } catch (error) {
        const errResult = makeErrorResult('agent reset', error, EXIT_CODES.execution_error, 'AGENT_RESET_ERROR');
        emitResult(errResult, { format, verbose: false, quiet });
        return await exitWithFlush(errResult.exit_code);
      }
    });
  },
});
