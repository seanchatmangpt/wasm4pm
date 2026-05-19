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
import {
  extractRemainingTimeFeatures,
  regressRemainingTime,
  recommendAlgorithm,
  type AlgorithmRecommendation,
} from '@wasm4pm/ml';

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
    method: {
      type: 'string',
      description: 'Prediction method for remaining-time task (auto, weibull, regress, hybrid)',
    },
    'auto-select': {
      type: 'boolean',
      description: 'Automatically select best algorithm based on log characteristics',
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
        const suggestions = VALID_TASKS.filter(
          t => t.toLowerCase().includes(task.toLowerCase()) || task.toLowerCase().includes(t.toLowerCase())
        );
        const didYouMean = suggestions.length > 0
          ? `\n\n  Did you mean: wpm predict ${suggestions[0]} -i <log.xes>`
          : '';
        const errorMessage =
          `Unknown task: "${task}".${didYouMean}\n\n` +
          `Valid tasks:\n  ${VALID_TASKS.join(', ')}`;
        const result = makeErrorResult(
          'predict',
          new Error(errorMessage),
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

      // Validate and parse --top-k (must be > 0)
      const rawTopK = ctx.args['top-k'] as string | undefined;
      const parsedTopK = rawTopK != null ? parseInt(rawTopK, 10) : undefined;
      if (parsedTopK !== undefined && Number.isNaN(parsedTopK)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --top-k value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_TOP_K'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      if (parsedTopK !== undefined && parsedTopK <= 0) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --top-k value: must be greater than 0 (given: ' + parsedTopK + ')'),
          EXIT_CODES.config_error,
          'INVALID_TOP_K'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const topK = parsedTopK ?? 3;

      // Validate and parse --ngram-order (must be 2-5)
      const rawNgram = ctx.args['ngram-order'] as string | undefined;
      const parsedNgram = rawNgram != null ? parseInt(rawNgram, 10) : undefined;
      if (parsedNgram !== undefined && Number.isNaN(parsedNgram)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --ngram-order value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_NGRAM_ORDER'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      if (parsedNgram !== undefined && (parsedNgram < 2 || parsedNgram > 5)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --ngram-order value: must be between 2 and 5 (given: ' + parsedNgram + ')'),
          EXIT_CODES.config_error,
          'INVALID_NGRAM_ORDER'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const ngramOrder = parsedNgram ?? pred?.ngramOrder ?? 2;

      // Validate and parse --drift-window (must be > 0)
      const rawDrift = ctx.args['drift-window'] as string | undefined;
      const parsedDrift = rawDrift != null ? parseInt(rawDrift, 10) : undefined;
      if (parsedDrift !== undefined && Number.isNaN(parsedDrift)) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --drift-window value: must be a number'),
          EXIT_CODES.config_error,
          'INVALID_DRIFT_WINDOW'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      if (parsedDrift !== undefined && parsedDrift <= 0) {
        const result = makeErrorResult(
          'predict',
          new Error('Invalid --drift-window value: must be greater than 0 (given: ' + parsedDrift + ')'),
          EXIT_CODES.config_error,
          'INVALID_DRIFT_WINDOW'
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
        const method = (ctx.args.method as string) || 'auto';
        const autoSelect = Boolean(ctx.args['auto-select']);
        const taskResult = await executePredictionTask(
          wasm,
          task as PredictTask,
          logHandle,
          activityKey,
          topK,
          ngramOrder,
          driftWindow,
          prefixActivities,
          method,
          autoSelect
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
 * @param method - For remaining-time task: 'auto', 'weibull', 'regress', or 'hybrid'
 * @param autoSelect - When true, use log characteristics to recommend best algorithm
 */
async function executePredictionTask(
  wasm: Record<string, any>,
  task: PredictTask,
  logHandle: string,
  activityKey: string,
  topK: number,
  ngramOrder: number,
  driftWindow: number,
  prefixActivities?: string[],
  method?: string,
  autoSelect?: boolean
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
      // Extract features for ML-based regression
      const configJson = JSON.stringify({
        features: [
          'trace_length',
          'elapsed_time',
          'activity_counts',
          'rework_count',
          'unique_activities',
          'avg_inter_event_time',
        ],
        target: 'remaining_time',
      });
      const rawFeatures = wasm.extract_case_features(
        logHandle,
        activityKey,
        'time:timestamp',
        configJson
      );
      const featuresArray = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
      const featureMatrix = extractRemainingTimeFeatures(Array.isArray(featuresArray) ? featuresArray : []);

      // Auto-select best algorithm if --auto-select is set
      let resolvedMethod = method === 'auto' || !method ? 'auto' : method;
      if (autoSelect && resolvedMethod === 'auto' && Array.isArray(featuresArray)) {
        try {
          const recommendation = recommendAlgorithm('remaining-time', featuresArray);
          if (recommendation.algorithm === 'regress') {
            resolvedMethod = 'regress';
          } else if (recommendation.algorithm === 'weibull') {
            resolvedMethod = 'weibull';
          } else if (recommendation.algorithm === 'hybrid') {
            resolvedMethod = 'hybrid';
          }
          // Log recommendation to stderr for visibility
          console.error(`[Algorithm Selection] Recommended: ${recommendation.algorithm} (confidence: ${recommendation.confidence.toFixed(2)})`);
          console.error(`  Reason: ${recommendation.reason}`);
        } catch {
          // Fall back to auto-detect if selector fails
          resolvedMethod = 'auto';
        }
      }

      // If no ML features or empty log, fall back to WASM Weibull model
      if (featureMatrix.data.length === 0) {
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
          process.stderr.write(
            'wpm predict remaining-time: no --prefix given — model built but no prediction made.\n' +
            'To get a duration estimate, provide a prefix:\n' +
            '  wpm predict remaining-time -i <log.xes> --prefix "Register,Approve"\n'
          );
          return {
            predicted: false,
            message:
              'Remaining-time model built. Use --prefix "Activity1,Activity2" to predict case duration.',
          };
        }
      }

      // Route to appropriate method
      if (resolvedMethod === 'weibull') {
        // Use WASM Weibull model
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
          return { prediction, method: 'weibull' };
        } else {
          wasm.delete_object(modelHandle);
          return { predicted: false, message: 'Use --prefix to predict case duration.' };
        }
      } else if (resolvedMethod === 'regress') {
        // Use ML regression
        const regressionResult = await regressRemainingTime(featureMatrix.data.map((row, i) => ({
          case_id: featureMatrix.caseIds[i],
          ...Object.fromEntries(featureMatrix.featureNames.map((name, j) => [name, row[j]])),
          remaining_time: featureMatrix.targets[i],
        })), { method: 'linear_regression' });
        return { ...regressionResult, method: 'regress' };
      } else if (resolvedMethod === 'hybrid') {
        // Ensemble: Weibull + Regress, average predictions
        const modelHandle: string = wasm.build_remaining_time_model(
          logHandle,
          activityKey,
          'time:timestamp'
        );
        const weibullPrediction = prefixActivities && prefixActivities.length > 0
          ? JSON.parse(wasm.predict_case_duration(modelHandle, JSON.stringify(prefixActivities)))
          : null;
        wasm.delete_object(modelHandle);

        const regressionResult = await regressRemainingTime(featureMatrix.data.map((row, i) => ({
          case_id: featureMatrix.caseIds[i],
          ...Object.fromEntries(featureMatrix.featureNames.map((name, j) => [name, row[j]])),
          remaining_time: featureMatrix.targets[i],
        })), { method: 'linear_regression' });

        if (weibullPrediction && prefixActivities && prefixActivities.length > 0) {
          const avgRemaining = weibullPrediction.remaining_ms && regressionResult.predictions?.[0]?.predicted
            ? (weibullPrediction.remaining_ms + regressionResult.predictions[0].predicted) / 2
            : weibullPrediction.remaining_ms || regressionResult.predictions?.[0]?.predicted;
          return {
            prediction: {
              remaining_ms: avgRemaining,
              confidence: (weibullPrediction.confidence || 0.5) * 0.5 + 0.25,
              method: 'hybrid',
              weibull: weibullPrediction,
              regress: regressionResult.predictions?.[0],
            },
            method: 'hybrid',
          };
        } else {
          return { ...regressionResult, method: 'hybrid' };
        }
      } else {
        // Default: auto-detect based on log size
        // Large logs (>1000 traces): prefer regress
        // Small logs: prefer weibull
        const useRegress = featureMatrix.data.length > 1000;

        if (useRegress) {
          const regressionResult = await regressRemainingTime(featureMatrix.data.map((row, i) => ({
            case_id: featureMatrix.caseIds[i],
            ...Object.fromEntries(featureMatrix.featureNames.map((name, j) => [name, row[j]])),
            remaining_time: featureMatrix.targets[i],
          })), { method: 'linear_regression' });
          return { ...regressionResult, method: 'regress' };
        } else {
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
            return { prediction, method: 'weibull' };
          } else {
            wasm.delete_object(modelHandle);
            return { predicted: false, message: 'Use --prefix to predict case duration.' };
          }
        }
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
        p.warn((result.message as string) ?? 'Use --prefix to predict case duration.');
        p.log('');
        p.log('  Example:');
        p.log('    wpm predict remaining-time -i <log.xes> --prefix "Register,Approve"');
        p.log('');
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
