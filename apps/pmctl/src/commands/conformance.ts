import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';

export interface ConformanceOptions extends OutputOptions {
  input?: string;
  model?: string;
  activityKey?: string;
  method?: 'token-replay' | 'alignment';
  threshold?: number;
}

export const conformance = defineCommand({
  meta: {
    name: 'conformance',
    description: 'Measure how well an event log conforms to a process model (fitness, precision, diagnostics)',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (named alternative to positional)',
      alias: 'i',
    },
    model: {
      type: 'string',
      description: 'Process model handle or file path to compare against (Petri net JSON)',
      alias: 'm',
    },
    method: {
      type: 'string',
      description: 'Conformance checking method: token-replay (default) or alignment',
      default: 'token-replay',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    threshold: {
      type: 'string',
      description: 'Fitness threshold for "good" conformance (default: 0.8)',
      default: '0.8',
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
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl conformance <log.xes>\n        pictl conformance <log.xes> --model <model.json>\n\nRun "pictl conformance --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const method = ctx.args.method as 'token-replay' | 'alignment';
      const rawThreshold = ctx.args.threshold as string | undefined;
      const parsedThreshold = rawThreshold != null ? parseFloat(rawThreshold) : undefined;
      if (parsedThreshold !== undefined && Number.isNaN(parsedThreshold)) {
        formatter.error('Invalid --threshold value: must be a number');
        process.exit(EXIT_CODES.config_error);
      }
      const threshold = parsedThreshold ?? 0.8;

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Conformance checking: ${inputPath}`);
        formatter.debug(`Method: ${method}, Threshold: ${threshold}`);
      }

      // Load WASM module
      const loaderConfig = ctx.args.format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
      const loader = WasmLoader.getInstance(loaderConfig);
      await loader.init();
      const wasm = loader.get();

      // Parse XES and load log
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Loading event log from XES file...');
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // First discover a model if none provided
      let modelData: Record<string, unknown>;
      const modelPath = ctx.args.model as string | undefined;

      if (modelPath) {
        // Load provided model
        try {
          await fs.access(modelPath);
          const modelContent = await fs.readFile(modelPath, 'utf-8');
          modelData = JSON.parse(modelContent);
          if (formatter instanceof HumanFormatter) {
            formatter.debug(`Using provided model: ${modelPath}`);
          }
        } catch {
          formatter.error(`Model file not found or invalid: ${modelPath}`);
          process.exit(EXIT_CODES.source_error);
        }
      } else {
        // Auto-discover a model using heuristic miner
        if (formatter instanceof HumanFormatter) {
          formatter.debug('No model provided, discovering with heuristic miner...');
        }
        const rawModel = wasm.discover_heuristic_miner(logHandle, activityKey, 0.5);
        modelData = typeof rawModel === 'string' ? JSON.parse(rawModel) : rawModel;
      }

      // Run conformance checking based on method
      let conformanceResult: Record<string, unknown>;

      if (method === 'alignment') {
        if (formatter instanceof HumanFormatter) {
          formatter.debug('Running alignment-based conformance...');
        }
        try {
          const raw = wasm.conformance_alignment_fitness(logHandle, activityKey, JSON.stringify(modelData));
          conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          // Fallback to token replay if alignment not available
          if (formatter instanceof HumanFormatter) {
            formatter.warn('Alignment-based conformance not available, falling back to token replay');
          }
          const raw = wasm.conformance_token_replay(logHandle, activityKey, JSON.stringify(modelData));
          conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
      } else {
        if (formatter instanceof HumanFormatter) {
          formatter.debug('Running token-based replay conformance...');
        }
        const raw = wasm.conformance_token_replay(logHandle, activityKey, JSON.stringify(modelData));
        conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }

      // Calculate ETConformance precision if available
      let precision = 0.0;
      try {
        const rawPrecision = wasm.conformance_etconformance_precision(logHandle, activityKey, JSON.stringify(modelData));
        const precisionResult = typeof rawPrecision === 'string' ? JSON.parse(rawPrecision) : rawPrecision;
        precision = (precisionResult as Record<string, unknown>).precision as number;
      } catch {
        // Precision not available
      }

      // Free log handle
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      // Build result
      const result = {
        status: 'success',
        input: inputPath,
        activityKey,
        method,
        threshold,
        fitness: (conformanceResult as Record<string, unknown>).fitness ?? 0.0,
        precision,
        isFit: ((conformanceResult as Record<string, unknown>).fitness as number ?? 0.0) >= threshold,
        diagnostics: {
          traced: (conformanceResult as Record<string, unknown>).traced ?? 0,
          remaining: (conformanceResult as Record<string, unknown>).remaining ?? 0,
          missing: (conformanceResult as Record<string, unknown>).missing ?? 0,
          consumed: (conformanceResult as Record<string, unknown>).consumed ?? 0,
          produced: (conformanceResult as Record<string, unknown>).produced ?? 0,
        },
        model: modelData,
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Conformance check complete', result);
      } else {
        printHumanConformance(formatter as HumanFormatter, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Conformance check failed', error);
      } else {
        formatter.error(
          `Conformance check failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanConformance(
  formatter: HumanFormatter,
  result: Record<string, unknown>
): void {
  const fitness = (result.fitness as number) ?? 0.0;
  const precision = (result.precision as number) ?? 0.0;
  const threshold = (result.threshold as number) ?? 0.8;
  const isFit = result.isFit as boolean;
  const diagnostics = result.diagnostics as Record<string, unknown>;

  formatter.log('');
  formatter.success(`Conformance Check — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Method: ${result.method as string}`);
  formatter.log('');
  formatter.log(`  Fitness: ${fitness.toFixed(3)} ${isFit ? '✓' : '✗'} (threshold: ${threshold.toFixed(2)})`);
  formatter.log(`  Precision: ${precision.toFixed(3)}`);
  formatter.log('');
  formatter.log('  Diagnostics (token replay):');
  formatter.log(`    Traced:     ${diagnostics.traced as number}`);
  formatter.log(`    Remaining:  ${diagnostics.remaining as number}`);
  formatter.log(`    Missing:    ${diagnostics.missing as number}`);
  formatter.log(`    Consumed:   ${diagnostics.consumed as number}`);
  formatter.log(`    Produced:   ${diagnostics.produced as number}`);
  formatter.log('');

  if (isFit) {
    formatter.success('Log conforms to model (fitness ≥ threshold)');
  } else {
    formatter.warn('Log does NOT conform to model (fitness < threshold)');
  }
  formatter.log('');
}
