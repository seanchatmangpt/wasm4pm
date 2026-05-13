import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

interface ConformancePayload {
  schema: string;
  status: string;
  input: string;
  activityKey: string;
  method: string;
  threshold: number;
  fitness: unknown;
  precision: number | null;
  precision_available: boolean;
  isFit: boolean;
  diagnostics: {
    traced: unknown;
    remaining: unknown;
    missing: unknown;
    consumed: unknown;
    produced: unknown;
  };
  modelHandle: string;
}

export const conformance = defineCommand({
  meta: {
    name: 'conformance',
    description:
      'Measure how well an event log conforms to a process model (fitness, precision, diagnostics)',
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
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const t0 = Date.now();

    return withSpan(
      'conformance',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        method: String(ctx.args.method ?? ''),
        format,
      },
      async () => {
    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        const result = makeErrorResult(
          'conformance',
          new Error(
            'Input file required.\n\nUsage:  wpm conformance <log.xes>\n        wpm conformance <log.xes> --model <model.json>\n\nRun "wpm conformance --help" for details.'
          ),
          EXIT_CODES.source_error,
          'SOURCE_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
        return;
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const method = ctx.args.method as 'token-replay' | 'alignment';
      const rawThreshold = ctx.args.threshold as string | undefined;
      const parsedThreshold = rawThreshold != null ? parseFloat(rawThreshold) : undefined;
      if (parsedThreshold !== undefined && Number.isNaN(parsedThreshold)) {
        const result = makeErrorResult(
          'conformance',
          new Error('Invalid --threshold value: must be a number'),
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
        return;
      }
      const threshold = parsedThreshold ?? 0.8;

      await withLogSession(
        { inputPath, activityKey, commandName: 'conformance', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

      // First discover a Petri Net model if none provided
      let petriNetHandle: string;
      const modelPath = ctx.args.model as string | undefined;

      if (modelPath) {
        // Load provided model from file, store it, and get a handle
        try {
          await fs.access(modelPath);
          const modelContent = await fs.readFile(modelPath, 'utf-8');
          JSON.parse(modelContent);
          // Note: For now, we assume the model file is a Petri Net JSON
          // In the future, we could store it via WASM API
          petriNetHandle = `model_${Date.now()}`;
        } catch {
          const result = makeErrorResult(
            'conformance',
            new Error(`Model file not found or invalid: ${modelPath}`),
            EXIT_CODES.source_error,
            'SOURCE_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
          return;
        }
      } else {
        // Auto-discover a Petri Net using Alpha++
        const discoveryResult = wasm.discover_alpha_plus_plus(logHandle, activityKey, 0.1);
        const resultData =
          typeof discoveryResult === 'string' ? JSON.parse(discoveryResult) : discoveryResult;
        petriNetHandle = (resultData as Record<string, unknown>).handle as string;

        if (!petriNetHandle) {
          const result = makeErrorResult(
            'conformance',
            new Error('Failed to discover Petri Net model'),
            EXIT_CODES.execution_error,
            'EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
          return;
        }
      }

      // Run conformance checking based on method
      let conformanceResult: Record<string, unknown>;

      if (method === 'alignment') {
        const configJson = JSON.stringify({
          max_iterations: 100000,
          sync_cost: 0.0,
          log_move_cost: 1.0,
          model_move_cost: 1.0,
        });
        const raw = wasm.alignment_fitness(logHandle, petriNetHandle, configJson);
        conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } else {
        const raw = wasm.check_token_based_replay(logHandle, petriNetHandle, activityKey);
        conformanceResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }

      // Precision calculation not yet supported in current API
      const precision = null;
      const precision_available = false;

      // Build payload
      const fitnessValue = conformanceResult.fitness ?? 0.0;
      const isFit = (fitnessValue as number) >= threshold;
      const payload: ConformancePayload = {
        schema: 'chatmangpt.wasm4pm.conformance.v1',
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
          traced: conformanceResult.traced ?? 0,
          remaining: conformanceResult.remaining ?? 0,
          missing: conformanceResult.missing ?? 0,
          consumed: conformanceResult.consumed ?? 0,
          produced: conformanceResult.produced ?? 0,
        },
        modelHandle: petriNetHandle,
      };

      const elapsedMs = Date.now() - t0;
      // Exit non-zero when fitness is below threshold so bash -e pipelines
      // and downstream tools can detect conformance failure.
      const exitCode = isFit ? EXIT_CODES.success : EXIT_CODES.conformance_fail;
      const result = makeResult('conformance', payload, elapsedMs, exitCode);

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        printHumanConformance(res.payload, projection);
      });

        // Persist BLAKE3 receipt for proof-of-execution
        if (!ctx.args['no-save']) {
          try {
            const inputBytes = await fs.readFile(inputPath);
            const receipt: CommandReceipt = {
              ...newReceipt('conformance'),
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: isFit ? 'success' : 'partial',
              summary: {
                method: payload.method,
                fitness: payload.fitness,
                precision: payload.precision,
                threshold: payload.threshold,
                elapsedMs,
              },
            };
            saveCommandReceipt(receipt);
          } catch {
            /* receipt write must never break the command */
          }
        }

        return await exitWithFlush(result.exit_code);
      });  // end withLogSession
    } catch (error) {
      const result = makeErrorResult(
        'conformance',
        error,
        EXIT_CODES.execution_error,
        'EXECUTION_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

import type { ConsoleProjection } from '../output.js';

function printHumanConformance(payload: ConformancePayload, projection: ConsoleProjection): void {
  const fitness = (payload.fitness as number) ?? 0.0;
  const precisionRaw = payload.precision;
  const precisionAvailable = payload.precision_available;
  const threshold = payload.threshold ?? 0.8;
  const isFit = payload.isFit;
  const diagnostics = payload.diagnostics;

  projection.log('');
  projection.success(`Conformance Check — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Method: ${payload.method}`);
  projection.log('');
  projection.log(
    `  Fitness: ${fitness.toFixed(3)} ${isFit ? '✓' : '✗'} (threshold: ${threshold.toFixed(2)})`
  );
  const precisionDisplay =
    precisionAvailable && precisionRaw !== null ? precisionRaw.toFixed(3) : 'N/A (not computed)';
  projection.log(`  Precision: ${precisionDisplay}`);
  projection.log('');
  projection.log('  Diagnostics (token replay):');
  projection.log(`    Traced:     ${diagnostics.traced as number}`);
  projection.log(`    Remaining:  ${diagnostics.remaining as number}`);
  projection.log(`    Missing:    ${diagnostics.missing as number}`);
  projection.log(`    Consumed:   ${diagnostics.consumed as number}`);
  projection.log(`    Produced:   ${diagnostics.produced as number}`);
  projection.log('');

  if (isFit) {
    projection.success('Log conforms to model (fitness ≥ threshold)');
  } else {
    projection.warn('Log does NOT conform to model (fitness < threshold)');
  }
  projection.log('');
}
