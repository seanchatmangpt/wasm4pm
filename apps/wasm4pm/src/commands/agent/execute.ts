import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentOrchestrator } from '@wasm4pm/agents';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      const orchestrator = new AgentOrchestrator();
      const agentName = ctx.args.agent as string;

      const agentResult = await orchestrator.executeAgent(agentName, {
        artifact_id: 'cli-execution',
        input_file: ctx.args.input as string | undefined,
        dry_run: ctx.args['dry-run'] as boolean | undefined,
      });

      const exitCode = agentResult.passed ? EXIT_CODES.success : 1;
      const result = makeResult('agent execute', agentResult, performance.now() - t0, exitCode);
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

      process.exit(result.exit_code);
    } catch (error) {
      const result = makeErrorResult(
        'agent execute',
        error,
        EXIT_CODES.execution_error,
        'AGENT_EXECUTE_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      process.exit(result.exit_code);
    }
  },
});
