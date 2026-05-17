import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

interface TraceDeviation {
  event_index: number;
  activity: string;
  deviation_type: string;
}

interface TraceResult {
  case_id: string;
  is_conforming: boolean;
  trace_fitness: number;
  tokens_missing: number;
  tokens_remaining: number;
  deviations: TraceDeviation[];
}

interface ConformancePayload {
  schema: string;
  status: string;
  input: string;
  activityKey: string;
  method: string;
  threshold: number;
  fitness: number;
  precision: number | null;
  precision_available: boolean;
  isFit: boolean;
  summary: {
    total_cases: number;
    conforming_cases: number;
    deviating_cases: number;
    conformance_rate: number;
  };
  diagnostics: {
    traced: number;
    remaining: number;
    missing: number;
    consumed: number;
    produced: number;
  };
  deviating_traces: TraceResult[];
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

      // The token-replay WASM function returns ConformanceResult with:
      //   avg_fitness, conforming_cases, total_cases, case_fitness[]
      // Each case_fitness entry has: case_id, is_conforming, trace_fitness,
      //   tokens_missing, tokens_remaining, deviations[]
      // alignment_fitness returns a different shape (fitness at top level).
      const isTokenReplay = method !== 'alignment';
      let fitnessValue: number;
      let totalCases: number;
      let conformingCases: number;
      let caseFitness: TraceResult[] = [];

      if (isTokenReplay) {
        fitnessValue = (conformanceResult.avg_fitness as number) ?? 0.0;
        totalCases = (conformanceResult.total_cases as number) ?? 0;
        conformingCases = (conformanceResult.conforming_cases as number) ?? 0;
        const rawCases = conformanceResult.case_fitness as TraceResult[] | undefined;
        caseFitness = Array.isArray(rawCases) ? rawCases : [];
      } else {
        // alignment path — shape differs, fitness is at root
        fitnessValue = (conformanceResult.fitness as number) ?? 0.0;
        totalCases = 0;
        conformingCases = 0;
      }

      const deviatingCases = isTokenReplay
        ? totalCases - conformingCases
        : 0;
      const conformanceRate = totalCases > 0
        ? conformingCases / totalCases
        : fitnessValue;

      // Separate deviating traces for reporting (up to 20 to keep output manageable)
      const deviatingTraces = caseFitness
        .filter((t) => !t.is_conforming)
        .slice(0, 20);

      // Aggregate token counts across all traces for diagnostics
      let totalMissing = 0;
      let totalRemaining = 0;
      for (const t of caseFitness) {
        totalMissing += t.tokens_missing ?? 0;
        totalRemaining += t.tokens_remaining ?? 0;
      }

      const isFit = fitnessValue >= threshold;
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
        summary: {
          total_cases: totalCases,
          conforming_cases: conformingCases,
          deviating_cases: deviatingCases,
          conformance_rate: conformanceRate,
        },
        diagnostics: {
          traced: totalCases,
          remaining: totalRemaining,
          missing: totalMissing,
          consumed: 0,
          produced: 0,
        },
        deviating_traces: deviatingTraces,
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
  const fitness = payload.fitness ?? 0.0;
  const precisionRaw = payload.precision;
  const precisionAvailable = payload.precision_available;
  const threshold = payload.threshold ?? 1.0;
  const isFit = payload.isFit;
  const summary = payload.summary;
  const deviatingTraces = payload.deviating_traces ?? [];

  projection.log('');
  projection.success(`Conformance Check — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Method: ${payload.method}`);
  projection.log('');

  // Primary fitness score with Van der Aalst threshold context
  const fitnessStatus = fitness >= 0.85 ? 'excellent' : fitness >= threshold ? 'acceptable' : 'below threshold';
  projection.log(
    `  Fitness: ${fitness.toFixed(3)} ${isFit ? '✓' : '✗'}  [threshold: ${threshold.toFixed(2)}, Van der Aalst target: >=0.85 — ${fitnessStatus}]`
  );
  const precisionDisplay =
    precisionAvailable && precisionRaw !== null ? precisionRaw.toFixed(3) : 'N/A (not computed)';
  projection.log(`  Precision: ${precisionDisplay}`);
  projection.log('');

  // Case summary — only shown for token-replay (alignment returns no case breakdown)
  if (summary.total_cases > 0) {
    const conformanceRatePct = (summary.conformance_rate * 100).toFixed(1);
    projection.log('  Case Summary:');
    projection.log(`    Total cases:      ${summary.total_cases}`);
    projection.log(`    Conforming:       ${summary.conforming_cases}  (${conformanceRatePct}%)`);
    projection.log(`    Deviating:        ${summary.deviating_cases}`);
    projection.log('');
  }

  // Deviating trace details — the key practitioner insight
  if (deviatingTraces.length > 0) {
    const totalDeviating = summary.deviating_cases;
    const shown = deviatingTraces.length;
    const suffix = totalDeviating > shown ? ` (showing first ${shown} of ${totalDeviating})` : '';
    projection.log(`  Deviating Traces${suffix}:`);

    for (const trace of deviatingTraces) {
      projection.log(`    Case ${trace.case_id}  fitness=${trace.trace_fitness.toFixed(3)}  missing_tokens=${trace.tokens_missing}  remaining_tokens=${trace.tokens_remaining}`);
      if (trace.deviations.length > 0) {
        for (const dev of trace.deviations) {
          const label = dev.deviation_type === 'missing_activity'
            ? `activity "${dev.activity}" was expected by the model but not found in the log (log move)`
            : dev.deviation_type === 'missing_tokens'
            ? `activity "${dev.activity}" fired but required tokens were not available (model move)`
            : `${dev.deviation_type} at "${dev.activity}"`;
          projection.log(`      [event ${dev.event_index}] ${label}`);
        }
      } else {
        projection.log(`      (deviation: final marking not reached)`);
      }
    }
    projection.log('');
    if (!isFit) {
      projection.log('  How to interpret deviations:');
      projection.log('    "log move"   — the log contains an activity the model does not expect; the model is too restrictive.');
      projection.log('    "model move" — the model requires an activity that was skipped in the log; the log is missing steps.');
      projection.log('  To fix: either relax the model (add transitions) or investigate why steps are skipped in the log.');
      projection.log('');
    }
  }

  if (isFit) {
    projection.success('Log conforms to model (fitness >= threshold)');
  } else {
    projection.warn('Log does NOT conform to model (fitness < threshold)');
  }
  projection.log('');
}
