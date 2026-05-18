import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { runSwarm } from '@wasm4pm/swarm';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';
import { resolveConfig } from '@wasm4pm/config';

export const swarm = defineCommand({
  meta: {
    name: 'swarm',
    description: 'Execute the Agent Swarm Logic using core mining backends',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'max-episodes': {
      type: 'string',
      description: 'Maximum number of swarm episodes (overrides wasm4pm.toml [swarm].max_episodes)',
    },
    'convergence-runs': {
      type: 'string',
      description:
        'Identical consecutive rounds required for stability (overrides [swarm].convergence_runs)',
    },
    'convergence-threshold': {
      type: 'string',
      description:
        'Quorum fraction [0,1] for convergence (overrides [swarm].convergence_threshold). 1.0=unanimous',
    },
    'worker-model': {
      type: 'string',
      description: 'Groq model ID for worker agents (overrides [swarm].worker_model)',
    },
    algorithms: {
      type: 'string',
      description: 'Comma-separated algorithm IDs to run (overrides [swarm].algorithm_ids)',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    return withSpan(
      'swarm',
      {
        input: String(ctx.args.input ?? ''),
        format,
      },
      async () => {
        try {
          const inputPath = ctx.args.input as string;

          // Load config to read [swarm] section
          const resolvedConfig = await resolveConfig();
          const swarmCfg = resolvedConfig.swarm;

          // CLI args override config file values (precedence: CLI > config > built-in defaults)
          const maxEpisodes = ctx.args['max-episodes']
            ? parseInt(ctx.args['max-episodes'], 10)
            : (swarmCfg?.max_episodes ?? 5);

          const convergenceRuns = ctx.args['convergence-runs']
            ? parseInt(ctx.args['convergence-runs'], 10)
            : (swarmCfg?.convergence_runs ?? 2);

          const convergenceThreshold = ctx.args['convergence-threshold']
            ? parseFloat(ctx.args['convergence-threshold'])
            : (swarmCfg?.convergence_threshold ?? 1.0);

          const workerModel =
            (ctx.args['worker-model'] as string | undefined) ??
            swarmCfg?.worker_model ??
            'llama-3.1-70b-versatile';

          const algorithmIds = ctx.args.algorithms
            ? (ctx.args.algorithms as string)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : (swarmCfg?.algorithm_ids ?? ['dfg', 'analyze_statistics', 'detect_drift']);

          // Verify the XES file is accessible
          try {
            await fs.access(inputPath);
          } catch (readErr) {
            const result = makeErrorResult('swarm', readErr, EXIT_CODES.source_error);
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const config = {
            maxEpisodes,
            maxSteps: 20,
            convergenceRuns,
            algorithmIds,
            logPaths: [inputPath],
            workerModel,
          };

          const swarmResult = await runSwarm(config);

          const lastEpisode = swarmResult.episodes[swarmResult.episodes.length - 1];
          const finalReport = lastEpisode?.convergenceReport;

          const payload = {
            ...swarmResult,
            input: inputPath,
            maxEpisodes,
            convergenceRuns,
            convergenceThreshold,
            algorithmIds,
            workerModel,
            consensusRatio: finalReport?.consensusRatio ?? 0,
            dominantHash: finalReport?.dominantHash ?? null,
            dissentingWorkers: finalReport?.dissentingWorkers ?? [],
            stableWorkerCount: swarmResult.healthyWorkerCount,
            failedWorkerCount: swarmResult.failedWorkers.length,
          };

          const result = makeResult('swarm', payload, performance.now() - t0, EXIT_CODES.success);

          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            const data = res.payload as typeof payload;

            if (!process.env['GROQ_API_KEY']) {
              projection.warn('GROQ_API_KEY environment variable is missing.');
              projection.warn(
                'The swarm relies on Vercel AI SDK + Groq for orchestrating mining agents.'
              );
              projection.warn('Running with mocked LLM output for demonstration purposes.');
            }

            projection.log('');
            projection.info(`Swarm on: ${data.input}`);
            projection.log(
              `  Config: ${data.maxEpisodes} max episodes, ${data.convergenceRuns} convergence runs, ` +
                `threshold=${(data.convergenceThreshold * 100).toFixed(0)}%, model=${data.workerModel}`
            );
            projection.log(`  Algorithms: ${data.algorithmIds.join(', ')}`);
            projection.log('');

            // Per-round convergence progress (always shown, not just verbose)
            if (data.episodes.length > 0) {
              projection.log('Round-by-round convergence progress:');
              for (const ep of data.episodes) {
                const r = ep.convergenceReport;
                const stableCount = r.totalChecked - r.dissentingWorkers.length;
                const marker = r.converged ? 'CONV' : '    ';
                const ratePctRound = (r.consensusRatio * 100).toFixed(0);
                projection.log(
                  `  [${marker}] Round ${ep.ep + 1}/${data.maxEpisodes}: ` +
                    `${stableCount}/${r.totalChecked} workers converged, consensus ratio ${ratePctRound}%`
                );
                if (verbose && r.convergenceReason) {
                  projection.log(`           Reason: ${r.convergenceReason}`);
                }
              }
              projection.log('');
            }

            // Final convergence summary
            if (data.converged) {
              projection.success(`Convergence: YES (${data.episodes.length} episode(s))`);
            } else if (data.convergenceTimeout) {
              projection.warn(
                `Convergence: NO — exhausted ${data.episodes.length} episode(s) without converging`
              );
            } else {
              projection.warn('Convergence: NO');
            }

            // Show convergence reason from the last episode
            const lastEp = data.episodes[data.episodes.length - 1];
            if (lastEp?.convergenceReport.convergenceReason) {
              projection.log(`  Reason: ${lastEp.convergenceReport.convergenceReason}`);
            }

            const ratePct = (data.consensusRatio * 100).toFixed(1);
            projection.log(`  Consensus ratio:   ${ratePct}%`);
            projection.log(
              `  Dominant hash:     ${data.dominantHash ? data.dominantHash.slice(0, 12) + '...' : 'n/a'}`
            );
            projection.log(`  Healthy workers:   ${data.stableWorkerCount}`);

            if (data.failedWorkerCount > 0) {
              projection.warn(
                `  Failed workers:    ${data.failedWorkerCount} (isolated, did not abort swarm)`
              );
              for (const wid of data.failedWorkers) {
                const workerResult = data.finalWorkerResults.find((r) => r.workerId === wid);
                projection.warn(`    ${wid}: ${workerResult?.error ?? 'unknown error'}`);
              }
            }

            if (data.dissentingWorkers.length > 0 && !data.converged) {
              projection.warn(`  Dissenting workers: ${data.dissentingWorkers.join(', ')}`);
            }

            projection.log('');
            projection.info('Worker results:');
            for (const worker of data.finalWorkerResults) {
              if (worker.failed) {
                projection.warn(
                  `  [FAILED] ${worker.workerId} (${worker.algorithmId}): ${worker.error}`
                );
              } else {
                projection.log(
                  `  [OK]     ${worker.workerId} (${worker.algorithmId}) — ` +
                    `${worker.durationMs}ms  hash=${worker.resultHash.slice(0, 8)}...`
                );
              }
            }

            if (verbose && data.episodes.length > 0) {
              projection.log('');
              projection.log('Episode convergence trajectory (verbose):');
              for (const ep of data.episodes) {
                const r = ep.convergenceReport;
                const marker = r.converged ? 'CONV' : '    ';
                projection.log(
                  `  [${marker}] ep=${ep.ep}  ratio=${(r.consensusRatio * 100).toFixed(1)}%` +
                    `  checked=${r.totalChecked}  dissenting=${r.dissentingWorkers.length}`
                );
              }
            }

            // Next-steps hint
            projection.log('');
            if (data.converged) {
              projection.info(
                'Next steps: Use `wpm results --diff` to compare worker results across runs.'
              );
            } else {
              projection.info(
                'Next steps: Use `wpm results --diff` to compare worker results and diagnose dissent.'
              );
            }
          });

          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult('swarm', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});
