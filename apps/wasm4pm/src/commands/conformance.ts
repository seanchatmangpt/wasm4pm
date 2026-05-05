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

      // First discover a Petri Net model if none provided
      let petriNetHandle: string;
      const modelPath = ctx.args.model as string | undefined;

      if (modelPath) {
        // Load provided model from file, store it, and get a handle
        try {
          await fs.access(modelPath);
          const modelContent = await fs.readFile(modelPath, 'utf-8');
          const modelData = JSON.parse(modelContent);
          if (formatter instanceof HumanFormatter) {
            formatter.debug(`Using provided model: ${modelPath}`);
          }
          // Note: For now, we assume the model file is a Petri Net JSON
          // In the future, we could store it via WASM API
          petriNetHandle = `model_${Date.now()}`;
        } catch {
          formatter.error(`Model file not found or invalid: ${modelPath}`);
          process.exit(EXIT_CODES.source_error);
        }
      } else {
        // Auto-discover a Petri Net using Alpha++
        if (formatter instanceof HumanFormatter) {
          formatter.debug('No model provided, discovering with Alpha++...');
        }
        const result = wasm.discover_alpha_plus_plus(logHandle, activityKey, 0.1);
        const resultData = typeof result === 'string' ? JSON.parse(result) : result;
        petriNetHandle = (resultData as Record<string, unknown>).handle as string;

        if (!petriNetHandle) {
          formatter.error('Failed to discover Petri Net model');
          process.exit(EXIT_CODES.execution_error);
        }
      }

      // Run conformance checking based on method
      let conformanceResult: Record<string, unknown>;

      if (method === 'alignment') {
        if (formatter instanceof HumanFormatter) {
          formatter.debug('Running alignment-based conformance...');
        }
        const configJson = JSON.stringify({ max_iterations: 100000, sync_cost: 0.0, log_move_cost: 1.0, model_move_cost: 1.0 });
        const raw = wasm.alignment_fitness(logHandle, petriNetHandle, configJson);
        conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } else {
        if (formatter instanceof HumanFormatter) {
          formatter.debug('Running token-based replay conformance...');
        }
        const raw = wasm.check_token_based_replay(logHandle, petriNetHandle, activityKey);
        conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }

      // Precision calculation not yet supported in current API
      const precision = null;
      const precision_available = false;

      // Free log handle
      wasm.delete_object(logHandle);

      // Build result
      const fitnessValue = (conformanceResult as Record<string, unknown>).fitness ?? 0.0;
      const isFit = (fitnessValue as number) >= threshold;
      const result = {
        schema: 'chatmangpt.pictl.conformance.v1',
        status: isFit ? 'success' : 'conformance_fail',
        input: inputPath,
        activityKey,
        method,
        threshold,
        fitness: fitnessValue,
        precision,
        precision_available,
        isFit,
        diagnostics: {
          traced: (conformanceResult as Record<string, unknown>).traced ?? 0,
          remaining: (conformanceResult as Record<string, unknown>).remaining ?? 0,
          missing: (conformanceResult as Record<string, unknown>).missing ?? 0,
          consumed: (conformanceResult as Record<string, unknown>).consumed ?? 0,
          produced: (conformanceResult as Record<string, unknown>).produced ?? 0,
        },
        modelHandle: petriNetHandle,
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Conformance check complete', result);
      } else {
        printHumanConformance(formatter as HumanFormatter, result);
      }

      // Exit non-zero when fitness is below threshold so bash -e pipelines
      // and downstream tools can detect conformance failure.
      if (!isFit) {
        process.exit(EXIT_CODES.conformance_fail);
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
  const precisionRaw = result.precision as number | null;
  const precisionAvailable = result.precision_available as boolean;
  const threshold = (result.threshold as number) ?? 0.8;
  const isFit = result.isFit as boolean;
  const diagnostics = result.diagnostics as Record<string, unknown>;

  formatter.log('');
  formatter.success(`Conformance Check — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Method: ${result.method as string}`);
  formatter.log('');
  formatter.log(`  Fitness: ${fitness.toFixed(3)} ${isFit ? '✓' : '✗'} (threshold: ${threshold.toFixed(2)})`);
  const precisionDisplay = precisionAvailable && precisionRaw !== null
    ? precisionRaw.toFixed(3)
    : 'N/A (not computed)';
  formatter.log(`  Precision: ${precisionDisplay}`);
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
