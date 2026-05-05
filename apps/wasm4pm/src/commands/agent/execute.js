import { defineCommand } from 'citty';
import { getFormatter, JSONFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentOrchestrator } from '@wasm4pm/agents';
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
        const formatter = getFormatter({
            format: ctx.args.format,
            verbose: ctx.args.verbose,
            quiet: ctx.args.quiet,
        });
        try {
            const orchestrator = new AgentOrchestrator();
            const agentName = ctx.args.agent;
            const result = await orchestrator.executeAgent(agentName, {
                artifact_id: 'cli-execution',
                input_file: ctx.args.input,
                dry_run: ctx.args['dry-run'],
            });
            if (formatter instanceof JSONFormatter) {
                formatter.success('Agent execution complete', result);
            }
            else {
                formatter.log('');
                if (result.passed) {
                    formatter.success(`Agent "${agentName}": PASSED`);
                }
                else {
                    formatter.warn(`Agent "${agentName}": ${result.violations.length} violation(s) found`);
                }
                if (result.violations.length > 0) {
                    formatter.log('');
                    for (const v of result.violations) {
                        const icon = v.severity === 'critical' ? '!!' : '! ';
                        formatter.log(`  ${icon} ${v.violation_type} (${v.severity})`);
                        formatter.log(`     Target: ${v.target}`);
                        if (ctx.args.verbose) {
                            formatter.log(`     Evidence: ${JSON.stringify(v.evidence)}`);
                        }
                    }
                }
                if (result.process_mining_proof) {
                    const proof = result.process_mining_proof;
                    formatter.log('');
                    formatter.log('  Process Mining Proof:');
                    formatter.log(`    Fitness: ${proof.fitness.toFixed(2)}`);
                    formatter.log(`    Precision: ${proof.precision.toFixed(2)}`);
                    formatter.log(`    Deviations: ${proof.deviations}`);
                }
                formatter.log('');
                formatter.log(`  Execution time: ${result.execution_time_ms}ms`);
            }
            process.exit(result.passed ? EXIT_CODES.success : 1);
        }
        catch (error) {
            if (formatter instanceof JSONFormatter) {
                formatter.error('Agent execution failed', error);
            }
            else {
                formatter.error(`Agent execution failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            process.exit(EXIT_CODES.execution_error);
        }
    },
});
//# sourceMappingURL=execute.js.map