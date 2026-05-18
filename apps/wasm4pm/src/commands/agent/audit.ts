import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AuditStore } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';
import { exitWithFlush } from '../../otel/exit.js';

export const audit = defineCommand({
  meta: {
    name: 'audit',
    description: 'View agent correction audit trail',
  },
  args: {
    agent: {
      type: 'string',
      description: 'Filter by agent name',
    },
    last: {
      type: 'string',
      description: 'Show last N entries (default: 10)',
      default: '10',
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
    return withSpanRaw('wasm4pm.command.agent.audit', {
      command: 'agent', subcommand: 'audit',
      agent_id: String(ctx.args.agent ?? ''),
      limit: Number(ctx.args.last ?? 0),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = false;
    const quiet = Boolean(ctx.args.quiet);

    try {
      const store = new AuditStore();
      const limit = parseInt(String(ctx.args.last), 10);
      const entries = store.query({
        agent: ctx.args.agent as string | undefined,
        limit,
      });
      const summary = store.getSummary();

      const payload = { entries, summary };
      const result = makeResult('agent audit', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const p = res.payload as typeof payload;
        projection.log('');
        projection.log(
          `  Audit: ${p.summary.total_entries} entries, ${p.summary.success_rate.toFixed(0)}% success, ${p.summary.critical_count} critical`
        );
        projection.log('');

        if (p.entries.length === 0) {
          projection.log('  No entries found');
        }

        for (const entry of p.entries) {
          const statusIcon = entry.correction_success ? '+' : '!!';
          const time = new Date(entry.timestamp).toLocaleString();
          projection.log(`  ${statusIcon} ${time}  ${entry.agent_name}`);
          projection.log(`     ${entry.correction_type}: ${entry.correction_action}`);
          projection.log(`     Target: ${entry.violation.target}`);
          projection.log('');
        }
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult(
        'agent audit',
        error,
        EXIT_CODES.execution_error,
        'AGENT_AUDIT_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    });
  },
});
