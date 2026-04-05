import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface RunOptions extends OutputOptions {
  config?: string;
  algorithm?: string;
  input?: string;
  output?: string;
  timeout?: number;
}

export const run = defineCommand({
  meta: {
    name: 'run',
    description: 'Run process discovery on input event log',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to configuration file (JSON/YAML)',
    },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm to use (dfg, alpha, heuristic, genetic, ilp)',
    },
    input: {
      type: 'string',
      description: 'Path to input event log (XES/CSV)',
    },
    output: {
      type: 'string',
      description: 'Path to write output results',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Step 1: Load and validate configuration
      const configPath = ctx.args.config || process.cwd();
      let config;

      try {
        config = await loadConfig({
          configSearchPaths: [configPath],
          cliOverrides: {
            profile: ctx.args.algorithm
              ? (getProfileFromAlgorithm(ctx.args.algorithm) as 'fast' | 'balanced' | 'quality' | 'stream')
              : undefined,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (formatter instanceof JSONFormatter) {
          formatter.error('Failed to load configuration', error);
        } else {
          formatter.error(`Config error: ${message}`);
        }
        process.exit(EXIT_CODES.config_error);
      }

      // Step 2: Validate input file if provided
      if (ctx.args.input) {
        try {
          await fs.access(ctx.args.input);
        } catch {
          const message = `Input file not found: ${ctx.args.input}`;
          if (formatter instanceof JSONFormatter) {
            formatter.error(message);
          } else {
            formatter.error(message);
          }
          process.exit(EXIT_CODES.source_error);
        }
      }

      // Step 3: Create and bootstrap engine (placeholder - actual engine injection would come from DI)
      if (formatter instanceof HumanFormatter) {
        formatter.info('Discovering process model from event log...');
      }

      // Step 4: Load source data
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Loading source from: ${ctx.args.input || 'config'}`);
      }

      // Step 5: Execute discovery (this will be actual engine.run(plan))
      // For now, this is a placeholder that demonstrates the structure
      const result = {
        status: 'success',
        message: 'Discovery completed',
        config: {
          profile: config.execution.profile,
          timeout: config.execution.timeout,
        },
        metadata: {
          loadTime: config.metadata.loadTime,
          configHash: config.metadata.hash,
        },
      };

      // Step 6: Write output if specified
      if (ctx.args.output) {
        try {
          const outputDir = path.dirname(ctx.args.output);
          await fs.mkdir(outputDir, { recursive: true });

          if (formatter instanceof JSONFormatter) {
            await fs.writeFile(ctx.args.output, JSON.stringify(result, null, 2));
          } else {
            await fs.writeFile(ctx.args.output, JSON.stringify(result, null, 2));
          }

          if (formatter instanceof HumanFormatter) {
            formatter.info(`Results written to: ${ctx.args.output}`);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (formatter instanceof JSONFormatter) {
            formatter.error('Failed to write output', error);
          } else {
            formatter.error(`Output error: ${message}`);
          }
          process.exit(EXIT_CODES.system_error);
        }
      }

      // Step 7: Format and output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Discovery completed', result);
      } else {
        formatter.success('Discovery completed successfully');
        formatter.info(`Profile: ${config.execution.profile}`);
        if (ctx.args.output) {
          formatter.info(`Output written to: ${ctx.args.output}`);
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Discovery failed', error);
      } else {
        formatter.error(
          `Discovery failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Maps algorithm name to execution profile
 */
function getProfileFromAlgorithm(algorithm: string): string {
  const profileMap: Record<string, string> = {
    dfg: 'fast',
    alpha: 'balanced',
    'alpha++': 'balanced',
    'alpha-plus-plus': 'balanced',
    heuristic: 'balanced',
    inductive: 'quality',
    genetic: 'quality',
    ilp: 'quality',
    pso: 'quality',
    'a-star': 'quality',
    aco: 'quality',
    'simulated-annealing': 'quality',
  };

  return profileMap[algorithm.toLowerCase()] || 'balanced';
}
