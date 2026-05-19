import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { runSwarm } from '@wasm4pm/swarm';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

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
      description: 'Maximum number of swarm episodes (default: 3)',
    },
    workers: {
      type: 'string',
      description: 'Worker count (positive integer)',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Validate --workers BEFORE WASM. Mirror parseInt semantics: "abc" → NaN,
    // "0.5" → 0 — both fail the >0 check. "2.9" → 2 is accepted (parseInt
    // truncates), as is "10" → 10. Reject NaN or any result < 1.
    const workersArg = ctx.args.workers;
    if (workersArg !== undefined) {
      const n = parseInt(String(workersArg), 10);
      if (!Number.isFinite(n) || n < 1) {
        const result = makeErrorResult(
          'swarm',
          `Invalid --workers value '${String(workersArg)}': must be a positive integer`,
          EXIT_CODES.config_error,
          'INVALID_WORKERS'
        );
        emitResult(result, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.config_error);
      }
    }

    return withSpan('swarm', {
      input: String(ctx.args.input ?? ''),
      max_episodes: Number(ctx.args['max-episodes'] ?? 3),
      format,
    }, async () => {
    try {
      const inputPath = ctx.args.input as string;
      // Existence check BEFORE readFile so a missing file maps to source_error (2),
      // not the catch-all execution_error (3) downstream.
      try {
        await fs.access(inputPath);
      } catch {
        const result = makeErrorResult(
          'swarm',
          `Input file not found: ${inputPath}`,
          EXIT_CODES.source_error,
          'source_error'
        );
        emitResult(result, { format, verbose, quiet });
        return exitWithFlush(EXIT_CODES.source_error);
      }
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const maxEpisodes = ctx.args['max-episodes'] ? parseInt(ctx.args['max-episodes'], 10) : 3;

      const config = {
        maxEpisodes,
        maxSteps: 20,
        convergenceRuns: 2,
        algorithmIds: ['dfg', 'analyze_statistics', 'detect_drift'],
        logPaths: [inputPath],
        workerModel: 'llama-3.1-70b-versatile',
      };

      const swarmResult = await runSwarm(config);

      const payload = { ...swarmResult, input: inputPath, maxEpisodes };
      const result = makeResult('swarm', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const data = res.payload as typeof payload;

        projection.warn('GROQ_API_KEY environment variable is missing.');
        projection.warn(
          'The swarm relies on Vercel AI SDK and Groq for orchestrating the mining agents.'
        );
        projection.warn('Running with mocked LLM output for demonstration purposes.');

        projection.log('');
        projection.info(`Initializing Agent Swarm Logic on ${data.input}...`);
        projection.log('');
        projection.success(`Swarm reached convergence: ${data.converged ? 'YES' : 'NO'}`);
        projection.log(`Episodes run: ${data.episodes.length}`);

        projection.log('');
        projection.info('Final Worker Results (Core Mining Backends):');
        for (const worker of data.finalWorkerResults) {
          projection.log(
            `  - Worker [${worker.workerId}]: executed ${worker.algorithmId} in ${worker.durationMs}ms`
          );
        }

        if (verbose) {
          projection.log('');
          projection.log(JSON.stringify(data.artifact, null, 2));
        }
      });
      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult('swarm', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
    });
  },
});
