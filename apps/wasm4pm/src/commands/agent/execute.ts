import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentOrchestrator } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';
import { exitWithFlush } from '../../otel/exit.js';
import { emitCrownReceipt } from '../../receipts/_shared.js';

export interface AgentExecuteOptions {
  format?: 'human' | 'json';
  verbose?: boolean;
  quiet?: boolean;
}

export const execute = defineCommand({
  meta: {
    name: 'execute',
    description: 'Execute a Van der Aalst process mining agent',
  },
  args: {
    agent: {
      type: 'positional',
      description: 'Agent name (e.g., process-mining-skeptic)',
      required: true,
    },
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to event log (XES, OCEL, or CSV)',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Detect violations without applying corrections',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Enable verbose output',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    const agentName = String(ctx.args.agent ?? '');
    return withSpanRaw('wasm4pm.command.agent.execute', {
      command: 'agent', subcommand: 'execute',
      agent_id: agentName,
      input: String(ctx.args.input ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      const orchestrator = new AgentOrchestrator();

      const agentResult = await orchestrator.executeAgent(agentName, {
        artifact_id: 'cli-execution',
        input_file: ctx.args.input as string | undefined,
        dry_run: ctx.args['dry-run'] as boolean | undefined,
      });

      const exitCode = agentResult.passed ? EXIT_CODES.success : 1;
      const result = makeResult('agent execute', agentResult, performance.now() - t0, exitCode);

      try {
        emitCrownReceipt(
          'agentic_pipeline',
          JSON.stringify({ agent: agentName, input: ctx.args.input ?? null }),
          JSON.stringify(agentResult ?? {}),
        );
      } catch (_receiptErr) {
        // receipt write must never break the command
      }

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const r = res.payload as typeof agentResult;
        projection.log('');
        if (r.passed) {
          projection.success(`Agent "${agentName}": PASSED`);
        } else {
          projection.warn(`Agent "${agentName}": ${r.violations.length} violation(s) found`);
        }

        if (r.violations.length > 0) {
          projection.log('');
          for (const v of r.violations) {
            const icon = v.severity === 'critical' ? '!!' : '! ';
            projection.log(`  ${icon} ${v.violation_type} (${v.severity})`);
            projection.log(`     Target: ${v.target}`);
            if (verbose) {
              projection.log(`     Evidence: ${JSON.stringify(v.evidence)}`);
            }
          }
        }

        if (r.process_mining_proof) {
          const proof = r.process_mining_proof;
          projection.log('');
          projection.log('  Process Mining Proof:');
          projection.log(`    Fitness: ${proof.fitness.toFixed(2)}`);
          projection.log(`    Precision: ${proof.precision.toFixed(2)}`);
          projection.log(`    Deviations: ${proof.deviations}`);
        }

        projection.log('');
        projection.log(`  Execution time: ${r.execution_time_ms}ms`);
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);

      // Add deployment profile hint for algorithm availability errors
      if (
        errorMessage.includes('algorithm') &&
        (errorMessage.includes('not found') || errorMessage.includes('not available'))
      ) {
        errorMessage += '\n\nNote: Some algorithms require fog or browser deployment profiles.\n' +
          'Rebuild with: npm run build:browser (or build:fog)';
      }

      const result = makeErrorResult(
        'agent execute',
        new Error(errorMessage),
        EXIT_CODES.execution_error,
        'AGENT_EXECUTE_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    });
  },
});
