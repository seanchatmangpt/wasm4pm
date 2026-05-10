import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';

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
    return withSpanRaw('wasm4pm.command.agent.status', {
      command: 'agent', subcommand: 'status',
      agent: String(ctx.args.agent ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = false;
    const quiet = false;

    try {
      const registry = new AgentRegistry();

      if (ctx.args.agent) {
        const agentName = ctx.args.agent as string;
        const agentData = registry.getAgent(agentName);

        if (!agentData) {
          const errResult = makeErrorResult(
            'agent status',
            new Error(`Agent "${agentName}" not found`),
            EXIT_CODES.source_error,
            'AGENT_NOT_FOUND'
          );
          emitResult(errResult, { format, verbose, quiet });
          process.exit(errResult.exit_code);
        }

        const result = makeResult(
          'agent status',
          { agent: agentData },
          performance.now() - t0,
          EXIT_CODES.success
        );
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          const agent = (res.payload as { agent: typeof agentData }).agent;
          projection.log('');
          projection.log(`  Agent: ${agent.config.name}`);
          projection.log(`  Description: ${agent.config.description}`);
          projection.log(`  Mode: ${agent.config.mode}`);
          projection.log(`  Status: ${agent.status}`);
          projection.log(`  Version: ${agent.config.version}`);
          projection.log(`  Runs: ${agent.total_runs}`);
          projection.log(`  Violations: ${agent.total_violations}`);
          projection.log(`  Corrections: ${agent.total_corrections}`);
          projection.log(`  Last run: ${agent.last_run || 'never'}`);
          if (agent.last_error) {
            projection.log(`  Last error: ${agent.last_error}`);
          }
        });
        process.exit(result.exit_code);
      } else {
        const summary = registry.getSummary();
        const agents = registry.listAgents();

        const payload = { summary, agents };
        const result = makeResult('agent status', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          const p = res.payload as typeof payload;
          projection.log('');
          projection.log('  Agent Registry Status');
          projection.log(
            `  Total: ${p.summary.total}  Active: ${p.summary.active}  Disabled: ${p.summary.disabled}  Error: ${p.summary.error}`
          );
          projection.log('');

          for (const agent of p.agents) {
            const icon =
              agent.status === 'active'
                ? '+'
                : agent.status === 'disabled'
                  ? '-'
                  : agent.status === 'error'
                    ? '!!'
                    : '?';

            const lastRun = agent.last_run ? new Date(agent.last_run).toLocaleString() : 'never';
            projection.log(`  ${icon} ${agent.config.name}  (${agent.status})  last: ${lastRun}`);
          }
        });
        process.exit(result.exit_code);
      }
    } catch (error) {
      const result = makeErrorResult(
        'agent status',
        error,
        EXIT_CODES.execution_error,
        'AGENT_STATUS_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      process.exit(result.exit_code);
    }
    });
  },
});
