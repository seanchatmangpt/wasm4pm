import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { runSwarm } from '@wasm4pm/swarm';

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
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      if (formatter instanceof JSONFormatter) {
        // Only warn in non-JSON mode usually, but we must use appropriate methods
        // JSONFormatter doesn't have .warn() or .log().
      } else {
        formatter.warn('GROQ_API_KEY environment variable is missing.');
        formatter.warn('The swarm relies on Vercel AI SDK and Groq for orchestrating the mining agents.');
        formatter.warn('Running with mocked LLM output for demonstration purposes.');
      }

      const inputPath = ctx.args.input as string;
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const maxEpisodes = ctx.args['max-episodes'] ? parseInt(ctx.args['max-episodes'], 10) : 3;

      if (!(formatter instanceof JSONFormatter)) {
        formatter.log('');
        formatter.info(`Initializing Agent Swarm Logic on ${inputPath}...`);
      }
      
      const config = {
        maxEpisodes,
        maxSteps: 20,
        convergenceRuns: 2,
        algorithmIds: ['dfg', 'analyze_statistics', 'detect_drift'],
        logPaths: [inputPath],
        workerModel: 'llama-3.1-70b-versatile',
      };

      const result = await runSwarm(config);

      if (formatter instanceof JSONFormatter) {
        formatter.success('Agent Swarm execution complete', result);
      } else {
        formatter.log('');
        formatter.success(`Swarm reached convergence: ${result.converged ? 'YES' : 'NO'}`);
        formatter.log(`Episodes run: ${result.episodes.length}`);
        
        formatter.log('');
        formatter.info('Final Worker Results (Core Mining Backends):');
        for (const worker of result.finalWorkerResults) {
          formatter.log(`  - Worker [${worker.workerId}]: executed ${worker.algorithmId} in ${worker.durationMs}ms`);
        }
        
        if (ctx.args.verbose) {
          formatter.log('');
          formatter.log(JSON.stringify(result.artifact, null, 2));
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Agent Swarm execution failed', error);
      } else {
        formatter.error(
          `Agent Swarm execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
