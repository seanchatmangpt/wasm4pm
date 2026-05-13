import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';
import type { AgentMode } from '@wasm4pm/agents';
import { exitWithFlush } from '../../otel/exit.js';

export const list = defineCommand({
  meta: {
    name: 'list',
    description: 'List all registered Van der Aalst agents',
  },
  args: {
    filter: {
      type: 'string',
      description: 'Filter by mode (continuous|on_demand)',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Show thresholds and tags',
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
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      const registry = new AgentRegistry();
      const filter = ctx.args.filter as AgentMode | undefined;
      const agents = registry.listAgents(filter);
      const summary = registry.getSummary();

      const payload = { agents, summary };
      const result = makeResult('agent list', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const p = res.payload as typeof payload;
        projection.log('');
        projection.log(
          `  Agents: ${p.summary.active} active, ${p.summary.disabled} disabled, ${p.summary.error} error`
        );
        projection.log('');

        for (const agent of p.agents) {
          const statusIcon =
            agent.status === 'active'
              ? '+'
              : agent.status === 'disabled'
                ? '-'
                : agent.status === 'error'
                  ? '!!'
                  : '?';

          const modeTag = agent.config.mode === 'continuous' ? 'C' : 'D';
          projection.log(
            `  ${statusIcon} ${agent.config.name}  [${modeTag}]  ${agent.config.description}`
          );
          projection.log(
            `     Runs: ${agent.total_runs}  Violations: ${agent.total_violations}  Corrections: ${agent.total_corrections}`
          );

          if (verbose && agent.config.target_gates.length > 0) {
            projection.log(`     Gates: ${agent.config.target_gates.join(', ')}`);
          }
          if (verbose && agent.config.tags.length > 0) {
            projection.log(`     Tags: ${agent.config.tags.join(', ')}`);
          }
        }
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult(
        'agent list',
        error,
        EXIT_CODES.execution_error,
        'AGENT_LIST_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    });
  },
});
