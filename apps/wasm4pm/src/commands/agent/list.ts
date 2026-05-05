import { defineCommand } from 'citty';
import { getFormatter, JSONFormatter, HumanFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import type { AgentMode } from '@wasm4pm/agents';

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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const registry = new AgentRegistry();
      const filter = ctx.args.filter as AgentMode | undefined;
      const agents = registry.listAgents(filter);

      if (formatter instanceof JSONFormatter) {
        formatter.success('Agents', agents);
      } else {
        const summary = registry.getSummary();

        formatter.log('');
        formatter.log(`  Agents: ${summary.active} active, ${summary.disabled} disabled, ${summary.error} error`);
        formatter.log('');

        for (const agent of agents) {
          const statusIcon =
            agent.status === 'active' ? '+' :
            agent.status === 'disabled' ? '-' :
            agent.status === 'error' ? '!!' : '?';

          const modeTag = agent.config.mode === 'continuous' ? 'C' : 'D';
          formatter.log(`  ${statusIcon} ${agent.config.name}  [${modeTag}]  ${agent.config.description}`);
          formatter.log(`     Runs: ${agent.total_runs}  Violations: ${agent.total_violations}  Corrections: ${agent.total_corrections}`);

          if (ctx.args.verbose && agent.config.target_gates.length > 0) {
            formatter.log(`     Gates: ${agent.config.target_gates.join(', ')}`);
          }
          if (ctx.args.verbose && agent.config.tags.length > 0) {
            formatter.log(`     Tags: ${agent.config.tags.join(', ')}`);
          }
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Failed to list agents', error);
      } else {
        formatter.error(`Failed to list agents: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
