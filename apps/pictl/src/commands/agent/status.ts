import { defineCommand } from 'citty';
import { getFormatter, JSONFormatter, HumanFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@pictl/agents';

export const status = defineCommand({
  meta: {
    name: 'status',
    description: 'Check agent health and registry status',
  },
  args: {
    agent: {
      type: 'positional',
      description: 'Agent name to check (omit for summary)',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
    });

    try {
      const registry = new AgentRegistry();

      if (formatter instanceof JSONFormatter) {
        if (ctx.args.agent) {
          const agent = registry.getAgent(ctx.args.agent as string);
          formatter.success('Agent status', agent || { error: 'Agent not found' });
        } else {
          formatter.success('Registry summary', registry.getSummary());
        }
      } else {
        if (ctx.args.agent) {
          const agent = registry.getAgent(ctx.args.agent as string);
          if (!agent) {
            formatter.error(`Agent "${ctx.args.agent}" not found`);
            process.exit(1);
          }

          formatter.log('');
          formatter.log(`  Agent: ${agent.config.name}`);
          formatter.log(`  Description: ${agent.config.description}`);
          formatter.log(`  Mode: ${agent.config.mode}`);
          formatter.log(`  Status: ${agent.status}`);
          formatter.log(`  Version: ${agent.config.version}`);
          formatter.log(`  Runs: ${agent.total_runs}`);
          formatter.log(`  Violations: ${agent.total_violations}`);
          formatter.log(`  Corrections: ${agent.total_corrections}`);
          formatter.log(`  Last run: ${agent.last_run || 'never'}`);
          if (agent.last_error) {
            formatter.log(`  Last error: ${agent.last_error}`);
          }
        } else {
          const summary = registry.getSummary();
          const agents = registry.listAgents();

          formatter.log('');
          formatter.log('  Agent Registry Status');
          formatter.log(`  Total: ${summary.total}  Active: ${summary.active}  Disabled: ${summary.disabled}  Error: ${summary.error}`);
          formatter.log('');

          for (const agent of agents) {
            const icon =
              agent.status === 'active' ? '+' :
              agent.status === 'disabled' ? '-' :
              agent.status === 'error' ? '!!' : '?';

            const lastRun = agent.last_run
              ? new Date(agent.last_run).toLocaleString()
              : 'never';

            formatter.log(`  ${icon} ${agent.config.name}  (${agent.status})  last: ${lastRun}`);
          }
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Failed to get status', error);
      } else {
        formatter.error(`Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
