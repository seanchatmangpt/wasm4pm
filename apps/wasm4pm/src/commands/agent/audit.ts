import { defineCommand } from 'citty';
import { getFormatter, JSONFormatter, HumanFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AuditStore } from '@wasm4pm/agents';

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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      quiet: ctx.args.quiet,
    });

    try {
      const store = new AuditStore();
      const limit = parseInt(String(ctx.args.last), 10);
      const entries = store.query({
        agent: ctx.args.agent as string | undefined,
        limit,
      });

      if (formatter instanceof JSONFormatter) {
        formatter.success('Audit trail', entries);
      } else {
        const summary = store.getSummary();

        formatter.log('');
        formatter.log(
          `  Audit: ${summary.total_entries} entries, ${summary.success_rate.toFixed(0)}% success, ${summary.critical_count} critical`
        );
        formatter.log('');

        if (entries.length === 0) {
          formatter.log('  No entries found');
        }

        for (const entry of entries) {
          const statusIcon = entry.correction_success ? '+' : '!!';
          const time = new Date(entry.timestamp).toLocaleString();
          formatter.log(`  ${statusIcon} ${time}  ${entry.agent_name}`);
          formatter.log(`     ${entry.correction_type}: ${entry.correction_action}`);
          formatter.log(`     Target: ${entry.violation.target}`);
          formatter.log('');
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Failed to read audit trail', error);
      } else {
        formatter.error(
          `Failed to read audit trail: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
