import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { loadWasm4pmConfig, buildCliOverrides } from '../config-loader.js';
import { savePredictionResult } from './results.js';
import { VALID_PREDICT_CLI_TASKS } from '@wasm4pm/contracts';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

const VALID_TASKS = VALID_PREDICT_CLI_TASKS;
type PredictTask = (typeof VALID_TASKS)[number];

export const predict = defineCommand({
  meta: {
    name: 'predict',
    description: 'Run predictive process mining on an event log',
  },
  args: {
    task: {
      type: 'positional',
      description:
        'Prediction task (next-activity, remaining-time, outcome, drift, features, resource)',
      required: true,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file (required)',
      required: true,
      alias: 'i',
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: from config or concept:name)',
    },
    prefix: {
      type: 'string',
      description: 'Comma-separated activity prefix for case-level predictions',
    },
    'top-k': {
      type: 'string',
      description: 'Number of top predictions to return (default: 3)',
    },
    'ngram-order': {
      type: 'string',
      description: 'N-gram order for next-activity prediction (default: from config or 2)',
    },
    'drift-window': {
      type: 'string',
      description: 'Window size for drift detection (default: from config or 10)',
    },
    config: {
      type: 'string',
      description: 'Path to configuration file',
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
    'no-save': {
      type: 'boolean',
      description: 'Do not persist the result to .wasm4pm/results/',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const start = Date.now();

    return withSpan(
      'predict',
      {
        task: String(ctx.args.task ?? ''),
        input: String(ctx.args.input ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        top_k: Number(ctx.args['top-k'] ?? 0),
        ngram_order: Number(ctx.args['ngram-order'] ?? 0),
        drift_window: Number(ctx.args['drift-window'] ?? 0),
        format,
      },
      async () => {
    try {
      // Step 1: Validate task
      const task = ctx.args.task as string;
      if (!VALID_TASKS.includes(task as PredictTask)) {
        const result = makeErrorResult(
          'predict',
          new Error(`Unknown task: "${task}". Valid tasks: ${VALID_TASKS.join(', ')}`),
          EXIT_CODES.source_error,
          'INVALID_TASK'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      // Step 2: Load config to get prediction defaults
      const cliOverrides = buildCliOverrides({
        config: ctx.args.config,
        predictionActivityKey: ctx.args['activity-key'],
        predictionNgramOrder: ctx.args['ngram-order'],
        predictionDriftWindow: ctx.args['drift-window'],
      });
      const config = await loadWasm4pmConfig(cliOverrides);
      const pred = config.prediction;

      // Resolve parameters: CLI flag > config > hardcoded default
      const activityKey =
        (ctx.args['activity-key'] as string) || pred?.activityKey || 'concept:name';
      const rawTopK = ctx.args['top-k'] as string | undefined;
      const parsedTopK = rawTopK != null ? parseInt(rawTopK, 10) : undefined;
      if (parsedTopK !== undefined && Number.isNaN(parsedTopK)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --top-k value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const topK = parsedTopK ?? 3;

      const rawNgram = ctx.args['ngram-order'] as string | undefined;
      const parsedNgram = rawNgram != null ? parseInt(rawNgram, 10) : undefined;
      if (parsedNgram !== undefined && Number.isNaN(parsedNgram)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --ngram-order value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const ngramOrder = parsedNgram ?? pred?.ngramOrder ?? 2;

      const rawDrift = ctx.args['drift-window'] as string | undefined;
      const parsedDrift = rawDrift != null ? parseInt(rawDrift, 10) : undefined;
      if (parsedDrift !== undefined && Number.isNaN(parsedDrift)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --drift-window value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const driftWindow = parsedDrift ?? pred?.driftWindowSize ?? 10;
      const prefixActivities = ctx.args.prefix
        ? (ctx.args.prefix as string).split(',').map((s) => s.trim())
        : undefined;

      // Step 3: Load session and execute
      const inputPath = ctx.args.input as string;

      await withLogSession(
        { inputPath, activityKey, commandName: 'predict', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        // Step 4: Execute prediction task
        const taskResult = await executePredictionTask(
          wasm,
          task as PredictTask,
          logHandle,
          activityKey,
          topK,
          ngramOrder,
          driftWindow,
          prefixActivities
        );

        // Step 5: Build result
        const payload = {
          task,
          input: inputPath,
          activityKey,
          ...taskResult,
        };

        const result = makeResult('predict', payload, Date.now() - start);

        // Step 6: Emit result
        emitResult(result, { format, verbose, quiet }, (res, p) => {
          p.success(`Prediction complete: ${res.payload.task}`);
          formatHumanOutput(p, res.payload.task as PredictTask, res.payload);
        });

        // Step 7: Persist result (unless --no-save)
        if (!ctx.args['no-save']) {
          const savedPath = await savePredictionResult(task, inputPath, activityKey, taskResult);
          if (savedPath && verbose) {
            // debug already handled by projection.debug if needed
          }
          try {
            const inputBytes = await fs.readFile(inputPath).catch(() => Buffer.from(inputPath));
            const predictionsCount = Array.isArray((taskResult as Record<string, unknown>).predictions)
              ? ((taskResult as Record<string, unknown>).predictions as unknown[]).length
              : 0;
            const receipt: CommandReceipt = {
              ...newReceipt('predict'),
              command: 'predict',
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                task,
                activity_key: activityKey,
                top_k: topK,
                ngram_order: ngramOrder,
                drift_window: driftWindow,
                predictions_count: predictionsCount,
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
        'predict',
        error,
        EXIT_CODES.execution_error,
        'PREDICTION_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

/**
 * Dispatch to the appropriate WASM prediction function based on the task.
 */
async function executePredictionTask(
  wasm: Record<string, any>,
  task: PredictTask,
  logHandle: string,
  activityKey: string,
  topK: number,
  ngramOrder: number,
  driftWindow: number,
  prefixActivities?: string[]
): Promise<Record<string, unknown>> {
  switch (task) {
    case 'next-activity': {
      const predictorHandle: string = wasm.build_ngram_predictor(
        logHandle,
        activityKey,
        ngramOrder
      );
      const prefix = prefixActivities ?? [];
      const raw: string = wasm.predict_next_activity(predictorHandle, JSON.stringify(prefix));
      const predictions: Array<{ activity: string; probability: number }> = JSON.parse(raw);
      const topPredictions = predictions.slice(0, topK);
      wasm.delete_object(predictorHandle);
      return { predictions: topPredictions };
    }

    case 'remaining-time': {
      const modelHandle: string = wasm.build_remaining_time_model(
        logHandle,
        activityKey,
        'time:timestamp'
      );
      if (prefixActivities && prefixActivities.length > 0) {
        const raw: string = wasm.predict_case_duration(
          modelHandle,
          JSON.stringify(prefixActivities)
        );
        const prediction = JSON.parse(raw);
        wasm.delete_object(modelHandle);
        return { prediction };
      } else {
        wasm.delete_object(modelHandle);
        return {
          message:
            'Remaining-time model built. Use --prefix "Activity1,Activity2" to predict case duration.',
        };
      }
    }

    case 'outcome': {
      // Use discover_dfg_handle (stores the DFG) so score_anomaly can access it
      const dfgHandle: string = wasm.discover_dfg_handle(logHandle, activityKey);

      if (prefixActivities && prefixActivities.length > 0) {
        // Score the given prefix as an anomaly
        const anomalyRaw: string = wasm.score_anomaly(dfgHandle, JSON.stringify(prefixActivities));
        const anomaly = JSON.parse(anomalyRaw);
        // Also score log-likelihood with n-gram
        const ngramHandle: string = wasm.build_ngram_predictor(logHandle, activityKey, ngramOrder);
        const logLikelihood: number = wasm.score_trace_likelihood(
          ngramHandle,
          JSON.stringify(prefixActivities)
        );
        wasm.delete_object(ngramHandle);
        wasm.delete_object(dfgHandle);
        return { anomaly, logLikelihood };
      } else {
        // Score all traces in the log
        const raw: string = wasm.score_log_anomalies(logHandle, dfgHandle, activityKey);
        const anomalies: Array<Record<string, unknown>> = JSON.parse(raw);
        wasm.delete_object(dfgHandle);
        return { anomalies: anomalies.slice(0, topK) };
      }
    }

    case 'drift': {
      const raw: string = wasm.detect_drift(logHandle, activityKey, driftWindow);
      const driftResult = JSON.parse(raw);
      return { driftResult };
    }

    case 'features': {
      const raw: string = wasm.build_transition_probabilities(logHandle, activityKey);
      const transitions = JSON.parse(raw);
      // Also extract prefix features if prefix given
      if (prefixActivities && prefixActivities.length > 0) {
        const prefixRaw: string = wasm.extract_prefix_features_wasm(
          JSON.stringify(prefixActivities)
        );
        const prefixFeatures = JSON.parse(prefixRaw);
        return { transitions, prefixFeatures };
      }
      return { transitions };
    }

    case 'resource': {
      // Estimate queue delay using M/M/1 model
      // Arrival and service rates derived from default demonstration values
      const arrivalRate = 0.7;
      const serviceRate = 1.0;
      const queueRaw: string = wasm.estimate_queue_delay(arrivalRate, serviceRate);
      const queueStats = JSON.parse(queueRaw);
      // Show transition structure for context
      const transRaw: string = wasm.build_transition_probabilities(logHandle, activityKey);
      const transitions = JSON.parse(transRaw);
      return { queueStats, transitionCount: Array.isArray(transitions) ? transitions.length : 0 };
    }

    default:
      throw new Error(`Unhandled task: ${task}`);
  }
}

/**
 * Format results for human-readable output via ConsoleProjection.
 */
function formatHumanOutput(
  p: import('../output.js').ConsoleProjection,
  task: PredictTask,
  result: Record<string, unknown>
): void {
  switch (task) {
    case 'next-activity': {
      const preds = result.predictions as Array<{ activity: string; probability: number }>;
      if (!preds || preds.length === 0) {
        p.info('No predictions available for the given prefix.');
        return;
      }
      p.log('');
      p.log('  Rank  Activity                   Probability');
      p.log('  ────  ─────────────────────────  ───────────');
      preds.forEach((pred, i) => {
        const rank = String(i + 1).padStart(4);
        const act = pred.activity.padEnd(25);
        const prob = (pred.probability * 100).toFixed(1).padStart(8) + '%';
        p.log(`  ${rank}  ${act}  ${prob}`);
      });
      p.log('');
      break;
    }

    case 'remaining-time': {
      if (result.prediction) {
        const pred = result.prediction as Record<string, unknown>;
        const remainingMs = (pred.remaining_ms as number) ?? 0;
        const remainingH = remainingMs / 3_600_000;
        const confidence = ((pred.confidence as number) ?? 0) * 100;
        p.log('');
        p.log(`  Estimated remaining time:  ${remainingH.toFixed(1)} hours`);
        p.log(`  Confidence:                ${confidence.toFixed(1)}%`);
        p.log(`  Method:                    ${pred.method ?? 'unknown'}`);
        p.log('');
      } else {
        p.info((result.message as string) ?? 'Use --prefix to predict case duration.');
      }
      break;
    }

    case 'outcome': {
      if (result.anomaly) {
        const a = result.anomaly as Record<string, unknown>;
        p.log('');
        p.log(`  Anomaly score:    ${(a.score as number).toFixed(4)}`);
        p.log(`  Is anomalous:     ${a.is_anomalous}`);
        p.log(`  Threshold:        ${a.threshold}`);
        p.log(`  Log-likelihood:   ${(result.logLikelihood as number).toFixed(4)}`);
        p.log('');
      } else {
        const anomalies = result.anomalies as Array<Record<string, unknown>>;
        if (!anomalies || anomalies.length === 0) {
          p.info('No anomalous traces found.');
          return;
        }
        p.log('');
        p.log('  Case ID              Score     Anomalous');
        p.log('  ───────────────────  ────────  ─────────');
        for (const a of anomalies) {
          const caseId = String(a.case_id ?? a.trace_id ?? '?').padEnd(19);
          const score = ((a.score as number) ?? 0).toFixed(4).padStart(8);
          const flag = a.is_anomalous ? 'yes' : 'no';
          p.log(`  ${caseId}  ${score}  ${flag}`);
        }
        p.log('');
      }
      break;
    }

    case 'drift': {
      const dr = result.driftResult as Record<string, unknown>;
      const drifts = (dr?.drifts as Array<Record<string, unknown>>) ?? [];
      if (drifts.length === 0) {
        p.info('No concept drift detected.');
        return;
      }
      p.log('');
      p.log(
        `  Detected ${drifts.length} drift point(s) (method: ${dr?.method ?? 'jaccard_window'}):`
      );
      for (const dp of drifts) {
        const pos = dp.position ?? '?';
        const dist =
          typeof dp.distance === 'number' ? dp.distance.toFixed(4) : String(dp.distance ?? '');
        p.log(`    Position ${pos}  distance=${dist}  type=${dp.type ?? 'concept_drift'}`);
      }
      p.log('');
      break;
    }

    case 'features': {
      const transitions = result.transitions as Array<Record<string, unknown>>;
      p.log('');
      if (Array.isArray(transitions)) {
        p.log(`  Transition probabilities: ${transitions.length} edge(s)`);
        for (const t of transitions.slice(0, 5)) {
          p.log(`    ${JSON.stringify(t)}`);
        }
        if (transitions.length > 5) p.log(`    ... (${transitions.length - 5} more)`);
      } else {
        p.log(`  ${JSON.stringify(transitions)}`);
      }
      if (result.prefixFeatures) {
        p.log('');
        p.log(`  Prefix features: ${JSON.stringify(result.prefixFeatures)}`);
      }
      p.log('');
      break;
    }

    case 'resource': {
      const qs = result.queueStats as Record<string, unknown>;
      p.log('');
      p.log('  M/M/1 Queue Model Estimate:');
      p.log(`    Wait time:    ${((qs?.wait_time as number) ?? 0).toFixed(2)}s`);
      p.log(`    Utilization:  ${(((qs?.utilization as number) ?? 0) * 100).toFixed(1)}%`);
      p.log(`    Stable:       ${qs?.is_stable ?? false}`);
      p.log(`  Transitions in model: ${result.transitionCount}`);
      p.log('');
      break;
    }
  }
}
