import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { runSwarm } from '@wasm4pm/swarm';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';
import { resolveConfig } from '@wasm4pm/config';

/**
 * Save swarm execution receipt to .wasm4pm/receipts/
 */
async function saveSwarmReceipt(
  swarmResult: any,
  elapsedMs: number,
  inputPath: string,
): Promise<string> {
  const receiptDir = path.resolve('.wasm4pm/receipts');
  await fs.mkdir(receiptDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString();

  // Compute hashes for receipt chain
  const inputHash = createHash('sha256')
    .update(await fs.readFile(inputPath, 'utf-8'))
    .digest('hex');

  const outputHash = createHash('sha256')
    .update(JSON.stringify({
      converged: swarmResult.converged,
      episodes: swarmResult.episodes.length,
      healthyWorkers: swarmResult.healthyWorkerCount,
      dominantHash: swarmResult.episodes[swarmResult.episodes.length - 1]?.convergenceReport.dominantHash,
    }))
    .digest('hex');

  const receipt = {
    run_id: randomUUID(),
    timestamp,
    duration_ms: elapsedMs,
    input_hash: inputHash,
    output_hash: outputHash,
    status: swarmResult.converged ? 'success' : 'partial',
    converged: swarmResult.converged,
    episode_count: swarmResult.episodes.length,
    healthy_worker_count: swarmResult.healthyWorkerCount,
    failed_worker_count: swarmResult.failedWorkers.length,
  };

  const receiptPath = path.join(receiptDir, `swarm-${receipt.run_id}.json`);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));

  return receiptPath;
}

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
    workers: {
      type: 'string',
      description:
        'Number of parallel workers to spawn (must be >= 1; trims algorithm list to this count)',
      alias: 'w',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the swarm result to .wasm4pm/results/',
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

          // --workers validation: must be a positive integer when supplied
          const workersRaw = ctx.args.workers as string | undefined;
          let workersOverride: number | null = null;
          if (workersRaw !== undefined) {
            workersOverride = parseInt(workersRaw, 10);
            if (!Number.isFinite(workersOverride) || workersOverride <= 0) {
              const result = makeErrorResult(
                'swarm',
                new Error(
                  `Invalid --workers value: "${workersRaw}". Must be a positive integer (>= 1).`
                ),
                EXIT_CODES.config_error,
                'INVALID_WORKERS'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

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

          // --convergence-threshold validation: must be in [0, 1]
          const rawThreshold = ctx.args['convergence-threshold'] as string | undefined;
          let convergenceThreshold = swarmCfg?.convergence_threshold ?? 1.0;
          if (rawThreshold !== undefined) {
            const parsedThreshold = parseFloat(rawThreshold);
            if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
              const result = makeErrorResult(
                'swarm',
                new Error(
                  `Invalid --convergence-threshold value: "${rawThreshold}". ` +
                    `Must be a number in [0, 1] (e.g. 0.75 for 75% quorum, 1.0 for unanimous).`
                ),
                EXIT_CODES.config_error,
                'INVALID_CONVERGENCE_THRESHOLD'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
            convergenceThreshold = parsedThreshold;
          }

          const workerModel =
            (ctx.args['worker-model'] as string | undefined) ??
            swarmCfg?.worker_model ??
            'llama-3.1-70b-versatile';

          let algorithmIds = ctx.args.algorithms
            ? (ctx.args.algorithms as string)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : (swarmCfg?.algorithm_ids ?? ['dfg', 'analyze_statistics', 'detect_drift']);

          // Apply --workers cap: trim algorithm list to at most N entries
          if (workersOverride !== null && algorithmIds.length > workersOverride) {
            algorithmIds = algorithmIds.slice(0, workersOverride);
          }

          // Verify the XES file is accessible
          try {
            await fs.access(inputPath);
          } catch (readErr) {
            const result = makeErrorResult('swarm', readErr, EXIT_CODES.source_error);
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Verify the input log is non-empty — an empty file cannot be parsed and would
          // produce misleading worker results. Fail fast with source_error.
          const fileStat = await fs.stat(inputPath);
          if (fileStat.size === 0) {
            const result = makeErrorResult(
              'swarm',
              new Error(
                `Input log is empty: ${inputPath}. Provide a non-empty XES or OCEL event log file.`
              ),
              EXIT_CODES.source_error,
              'EMPTY_INPUT_LOG'
            );
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

          // Save receipt for audit trail (unless --no-save is specified)
          const noSave = ctx.args['no-save'] === true;
          if (!noSave) {
            await saveSwarmReceipt(swarmResult, performance.now() - t0, inputPath);
          }

          const lastEpisode = swarmResult.episodes[swarmResult.episodes.length - 1];
          const finalReport = lastEpisode?.convergenceReport;

          const consensusAlgorithm = finalReport?.algorithm ?? 'unknown';
          const payload = {
            ...swarmResult,
            input: inputPath,
            maxEpisodes,
            convergenceRuns,
            convergenceThreshold,
            algorithmIds,
            workerModel,
            workerCount: algorithmIds.length,
            iterationCount: swarmResult.episodes.length,
            convergenceStatus: swarmResult.converged
              ? 'converged'
              : swarmResult.convergenceTimeout
                ? 'timeout'
                : 'not_converged',
            consensusAlgorithm,
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
            projection.log(`  Consensus algorithm: ${data.consensusAlgorithm}`);
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
          const result = makeErrorResult('swarm', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});
