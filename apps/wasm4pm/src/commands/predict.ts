import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES, translateContractExitCode } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { loadWasm4pmConfig, buildCliOverrides } from '../config-loader.js';
import { savePredictionResult } from './results.js';
import { VALID_PREDICT_CLI_TASKS, createError, findClosestMatch } from '@wasm4pm/contracts';
import { withSpan, withWasmSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

const VALID_TASKS = VALID_PREDICT_CLI_TASKS;
type PredictTask = (typeof VALID_TASKS)[number];

export const predict = defineCommand({
  meta: {
    name: 'predict',
    description:
      'Run predictive process mining. Tasks: next-activity, remaining-time, outcome, drift, features, resource.\n' +
      '\n' +
      'Examples:\n' +
      '  wpm predict next-activity  -i log.xes                          # top-3 next activities (global priors)\n' +
      '  wpm predict next-activity  -i log.xes --prefix "Submit,Approve" --top-k 5\n' +
      '  wpm predict remaining-time -i log.xes --prefix "Register,Approve"\n' +
      '  wpm predict outcome        -i log.xes --prefix "A,B"           # anomaly score for a case prefix\n' +
      '  wpm predict drift          -i log.xes --drift-window 20        # concept-drift detection\n' +
      '  wpm predict features       -i log.xes                          # transition probability table\n' +
      '  wpm predict resource       -i log.xes                          # M/M/1 queue model\n' +
      '  wpm predict next-activity  -i log.xes --format json            # machine-readable output\n' +
      '\n' +
      'Exit codes: 0=success  1=config/arg error  2=source/file error  3=execution error',
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
            const suggestion = findClosestMatch(task, [...VALID_TASKS], 3);
            const didYouMean = suggestion ? `\nDid you mean: '${suggestion}'?` : '';
            const result = makeErrorResult(
              'predict',
              new Error(
                `Unknown task: "${task}".${didYouMean}\n` +
                  `Valid tasks: ${VALID_TASKS.join(', ')}\n\n` +
                  `Usage:  wpm predict <task> -i <log.xes>\n` +
                  `Examples:\n` +
                  `  wpm predict next-activity -i process.xes\n` +
                  `  wpm predict remaining-time -i process.xes --prefix "A,B"\n\n` +
                  `Run 'wpm predict --help' for full task descriptions.`
              ),
              EXIT_CODES.config_error,
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
            {
              inputPath,
              activityKey,
              commandName: 'predict',
              emitOptions: { format, verbose, quiet },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              // Step 4: Execute prediction task
              let taskResult: Record<string, unknown>;
              try {
                taskResult = await executePredictionTask(
                  wasm,
                  task as PredictTask,
                  logHandle,
                  activityKey,
                  topK,
                  ngramOrder,
                  driftWindow,
                  prefixActivities
                );
              } catch (predictionErr: unknown) {
                // PREDICTION_FAILED: create structured error with remediation
                const errorInfo = createError(
                  'PREDICTION_FAILED',
                  predictionErr instanceof Error ? predictionErr.message : String(predictionErr),
                  { task, activityKey, topK, ngramOrder, driftWindow }
                );
                const result = makeErrorResult(
                  'predict',
                  new Error(errorInfo.message),
                  translateContractExitCode(errorInfo.exit_code),
                  'PREDICTION_FAILED',
                  errorInfo.remediation
                );
                emitResult(result, { format, verbose, quiet });
                return await exitWithFlush(result.exit_code);
              }

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
                const savedPath = await savePredictionResult(
                  task,
                  inputPath,
                  activityKey,
                  taskResult
                );
                if (savedPath && verbose) {
                  // debug already handled by projection.debug if needed
                }
                try {
                  const inputBytes = await fs
                    .readFile(inputPath)
                    .catch(() => Buffer.from(inputPath));
                  const predictionsCount = Array.isArray(
                    (taskResult as Record<string, unknown>).predictions
                  )
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
            }
          ); // end withLogSession
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
      }
    );
  },
});

/**
 * Dispatch to the appropriate WASM prediction function based on the task.
 *
 * Gap fixes applied here:
 *   Gap 1 (next-activity): Return prefix echo + n-gram order context + coverage signal.
 *   Gap 2 (remaining-time): Surface Weibull shape/scale from predict_hazard_rate so the
 *     analyst understands the uncertainty shape, not just a point estimate.
 *   Gap 3 (resource): Derive arrival/service rates from actual log statistics via
 *     analyze_event_statistics instead of hardcoded demonstration values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executePredictionTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const predictorHandle: string = withWasmSpan(
        'build_ngram_predictor',
        { activity_key: activityKey, ngram_order: ngramOrder },
        () => wasm.build_ngram_predictor(logHandle, activityKey, ngramOrder)
      );
      const prefix = prefixActivities ?? [];
      const raw: string = withWasmSpan(
        'predict_next_activity',
        { ngram_order: ngramOrder, prefix_length: prefix.length },
        () => wasm.predict_next_activity(predictorHandle, JSON.stringify(prefix))
      );
      const allPredictions: Array<{ activity: string; probability: number }> = JSON.parse(raw);
      const topPredictions = allPredictions.slice(0, topK);
      // Gap 1: expose prefix echo, n-gram order, and whether the model had an exact match.
      // Empty allPredictions means the prefix was not seen in training (cold start / OOV).
      const coverage = allPredictions.length > 0 ? 'exact_match' : 'no_match';
      const totalCandidates = allPredictions.length;
      wasm.delete_object(predictorHandle);
      return {
        predictions: topPredictions,
        context: {
          prefix,
          ngramOrder,
          coverage,
          totalCandidates,
          note:
            prefix.length === 0
              ? 'No prefix supplied — predictions are global priors'
              : `Predictions conditioned on last ${Math.min(ngramOrder - 1, prefix.length)} activity(ies)`,
        },
      };
    }

    case 'remaining-time': {
      const modelHandle: string = withWasmSpan(
        'build_remaining_time_model',
        { activity_key: activityKey, timestamp_key: 'time:timestamp' },
        () => wasm.build_remaining_time_model(logHandle, activityKey, 'time:timestamp')
      );

      // Gap 2: always surface Weibull distribution parameters so the analyst
      // understands the uncertainty shape — not just a point estimate.
      let weibull: Record<string, unknown> | null = null;
      try {
        const hazardRaw: string = withWasmSpan('predict_hazard_rate', { case_index: 0 }, () =>
          wasm.predict_hazard_rate(modelHandle, 0)
        );
        const hazardResult = JSON.parse(hazardRaw) as {
          shape: number;
          scale: number;
          survival_probability: number;
        };
        const k = hazardResult.shape;
        weibull = {
          shape: k,
          scale_ms: hazardResult.scale,
          interpretation:
            k < 1
              ? 'k<1: hazard decreasing — most completions happen early (infant-mortality pattern)'
              : k > 1
                ? 'k>1: hazard increasing — completions concentrate at later times'
                : 'k=1: constant hazard (exponential distribution — memoryless process)',
        };
      } catch {
        // predict_hazard_rate may fail on degenerate models (all-same duration); non-critical
      }

      if (prefixActivities && prefixActivities.length > 0) {
        const raw: string = withWasmSpan(
          'predict_case_duration',
          { prefix_length: prefixActivities.length },
          () => wasm.predict_case_duration(modelHandle, JSON.stringify(prefixActivities))
        );
        const prediction = JSON.parse(raw);
        wasm.delete_object(modelHandle);
        return { prediction, weibull };
      } else {
        wasm.delete_object(modelHandle);
        return {
          weibull,
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
      const raw: string = withWasmSpan(
        'detect_drift',
        { activity_key: activityKey, window_size: driftWindow },
        () => wasm.detect_drift(logHandle, activityKey, driftWindow)
      );
      const driftResult = JSON.parse(raw) as {
        drifts_detected: number;
        drifts: Array<{
          position: number;
          distance: number;
          type: string;
          appeared?: string[];
          disappeared?: string[];
          suggestion?: string;
        }>;
        window_size: number;
        method: string;
      };

      // Apply EWMA smoothing to the distance series extracted from drift points.
      // This gives the analyst the same smoothed trend signal that drift-watch
      // provides in streaming mode — a single static snapshot of the series.
      const distances = driftResult.drifts.map((dp) => dp.distance);
      let ewmaResult: { smoothed: number[]; trend: string; last_value: number | null } | null =
        null;
      if (distances.length > 0) {
        try {
          const ewmaRaw: string = withWasmSpan(
            'compute_ewma',
            { series_length: distances.length, alpha: 0.3 },
            () => wasm.compute_ewma(JSON.stringify(distances), 0.3)
          );
          ewmaResult = JSON.parse(ewmaRaw) as {
            smoothed: number[];
            trend: string;
            last_value: number | null;
          };
        } catch {
          // compute_ewma is best-effort; missing it does not invalidate the drift result
        }
      }

      // Aggregate structural changes across all drift points so the analyst
      // sees the full picture, not just the last point.
      const allAppeared = Array.from(
        new Set(driftResult.drifts.flatMap((dp) => dp.appeared ?? []))
      );
      const allDisappeared = Array.from(
        new Set(driftResult.drifts.flatMap((dp) => dp.disappeared ?? []))
      );
      const suggestions = driftResult.drifts
        .map((dp) => dp.suggestion)
        .filter((s): s is string => Boolean(s));

      return {
        driftResult,
        ewma: ewmaResult
          ? {
              trend: ewmaResult.trend,
              last_value: ewmaResult.last_value,
              smoothed: ewmaResult.smoothed,
            }
          : null,
        structural_changes: {
          appeared: allAppeared,
          disappeared: allDisappeared,
          suggestions,
        },
      };
    }

    case 'features': {
      const raw: string = withWasmSpan(
        'build_transition_probabilities',
        { activity_key: activityKey },
        () => wasm.build_transition_probabilities(logHandle, activityKey)
      );
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
      // Gap 3: derive arrival and service rates from actual event log statistics
      // instead of hardcoded demonstration values.
      //   arrivalRate = total_cases / total_events (cases per event — dimensionless load)
      //   serviceRate = 1 / avg_events_per_case (reciprocal of mean service cost in events)
      //   utilisation rho = arrivalRate / serviceRate
      // rho >= 1 means the queue is unstable — throughput exceeds capacity.
      let arrivalRate = 0.7;
      let serviceRate = 1.0;
      let logStats: Record<string, unknown> = {};
      try {
        const statsRaw: string = withWasmSpan('analyze_event_statistics', {}, () =>
          wasm.analyze_event_statistics(logHandle)
        );
        logStats = JSON.parse(statsRaw) as Record<string, unknown>;
        const totalCases = (logStats['total_cases'] as number) ?? 0;
        const totalEvents = (logStats['total_events'] as number) ?? 0;
        const avgEventsPerCase = (logStats['avg_events_per_case'] as number) ?? 0;
        if (totalEvents > 0 && totalCases > 0) {
          arrivalRate = totalCases / totalEvents;
          serviceRate = avgEventsPerCase > 0 ? 1.0 / avgEventsPerCase : 1.0;
        }
      } catch {
        // fall back to demonstration defaults if statistics unavailable
      }
      const utilisation = serviceRate > 0 ? arrivalRate / serviceRate : Infinity;
      const queueRaw: string = wasm.estimate_queue_delay(arrivalRate, serviceRate);
      const queueStats = JSON.parse(queueRaw);
      // Show transition structure for context
      const transRaw: string = wasm.build_transition_probabilities(logHandle, activityKey);
      const transitions = JSON.parse(transRaw) as Record<string, unknown>;
      const edges = Array.isArray(transitions['edges']) ? transitions['edges'] : [];
      return {
        queueStats,
        utilisation,
        derivedRates: {
          arrivalRate,
          serviceRate,
          rho: utilisation,
          stable: utilisation < 1.0,
          warning:
            utilisation >= 1.0
              ? `Queue unstable: rho=${utilisation.toFixed(2)} >= 1.0 — throughput exceeds capacity, add resources`
              : undefined,
        },
        logStats,
        transitionCount: edges.length,
      };
    }

    default:
      throw new Error(`Unhandled task: ${task}`);
  }
}

/**
 * Van der Aalst predictive perspective context.
 *
 * Teinemaa et al. (2019) "Alarm-based prescriptive process monitoring" defines six
 * prediction perspectives.  Each entry captures:
 *   perspective   — the Van der Aalst mining perspective (control-flow, time, etc.)
 *   vda_dimension — which quality dimension the result speaks to
 *   when_to_use   — practitioner-oriented guidance on when this task is relevant
 */
interface PerspectiveContext {
  perspective: string;
  vda_dimension: string;
  when_to_use: string;
}

const PERSPECTIVE_CONTEXT: Record<PredictTask, PerspectiveContext> = {
  'next-activity': {
    perspective: 'Control-Flow',
    vda_dimension: 'fitness',
    when_to_use: 'When you need to guide the next step in a running case',
  },
  'remaining-time': {
    perspective: 'Time',
    vda_dimension: 'performance',
    when_to_use: 'When SLA compliance is at risk or bottlenecks must be found',
  },
  outcome: {
    perspective: 'Case Data',
    vda_dimension: 'generalization',
    when_to_use: 'When predicting whether a case will succeed or fail',
  },
  drift: {
    perspective: 'Time / Process Change',
    vda_dimension: 'fitness over time',
    when_to_use: 'When monitoring for concept drift or process change',
  },
  features: {
    perspective: 'Case Data',
    vda_dimension: 'precision',
    when_to_use: 'When building ML models that need process-aware features',
  },
  resource: {
    perspective: 'Organizational',
    vda_dimension: 'resource allocation',
    when_to_use: 'When optimizing workload assignment or capacity planning',
  },
};

/**
 * Format results for human-readable output via ConsoleProjection.
 */
function formatHumanOutput(
  p: import('../output.js').ConsoleProjection,
  task: PredictTask,
  result: Record<string, unknown>
): void {
  // Always emit the Van der Aalst perspective banner so the practitioner knows
  // which of the six prediction angles they are looking at, which quality
  // dimension the result speaks to, and when to reach for this task.
  const perspCtx = PERSPECTIVE_CONTEXT[task];
  p.log('');
  p.log(
    `  Perspective: ${perspCtx.perspective}  ·  Dimension: ${perspCtx.vda_dimension}  ·  When to use: ${perspCtx.when_to_use}`
  );

  switch (task) {
    case 'next-activity': {
      // Gap 1: show prefix context so the analyst knows what drove the predictions.
      const ctx = result['context'] as Record<string, unknown> | undefined;
      if (ctx) {
        const prefixArr = ctx['prefix'] as string[];
        p.log('');
        if (prefixArr && prefixArr.length > 0) {
          p.log(`  Prefix:       ${prefixArr.join(' -> ')}`);
        } else {
          p.log('  Prefix:       (none -- global priors)');
        }
        p.log(`  N-gram order: ${ctx['ngramOrder']}`);
        p.log(`  Coverage:     ${ctx['coverage']}  (${ctx['totalCandidates']} candidate(s))`);
        p.log(`  Note:         ${ctx['note']}`);
      }
      const preds = result['predictions'] as Array<{ activity: string; probability: number }>;
      if (!preds || preds.length === 0) {
        p.log('');
        p.info('No predictions available for the given prefix.');
        return;
      }
      p.log('');
      p.log('  Rank  Activity                   Probability  Confidence');
      p.log('  ----  -------------------------  -----------  ----------');
      preds.forEach((pred, i) => {
        const rank = String(i + 1).padStart(4);
        const act = pred.activity.padEnd(25);
        const prob = (pred.probability * 100).toFixed(1).padStart(8) + '%';
        const tier =
          pred.probability >= 0.8
            ? '★ High   — safe to act on'
            : pred.probability >= 0.5
              ? '◆ Medium — verify before critical decisions'
              : '○ Low    — uncertain, use with caution';
        p.log(`  ${rank}  ${act}  ${prob}  ${tier}`);
      });
      p.log('');
      // Plain-English interpretation of the top prediction
      if (preds.length > 0) {
        const top = preds[0];
        const pct = (top.probability * 100).toFixed(0);
        const confidenceLabel =
          top.probability >= 0.8 ? 'High' : top.probability >= 0.5 ? 'Medium' : 'Low';
        p.info(
          `Top prediction: "${top.activity}" with ${pct}% probability (${confidenceLabel} confidence)`
        );
        if (top.probability < 0.5) {
          p.info(
            '  Low/Medium confidence — the process may have high variant diversity after this prefix.'
          );
          p.info('  Consider supplying a longer --prefix or increasing --ngram-order.');
        }
      }
      p.log('');
      p.log('  Next actions:');
      p.log('    • Narrow to a prefix:  wpm predict next-activity -i <log> --prefix "<A>,<B>,<C>"');
      p.log('    • Estimate completion: wpm predict remaining-time -i <log> --prefix "<A>,<B>"');
      p.log('    • Check conformance:   wpm conformance -i <log>');
      p.log('    • Discover full model: wpm run -i <log> --algorithm inductive_miner');
      p.log('');
      break;
    }

    case 'remaining-time': {
      // Gap 2: show Weibull parameters to convey uncertainty shape, not just point estimate.
      const weibull = result['weibull'] as Record<string, unknown> | null | undefined;
      if (result['prediction']) {
        const pred = result['prediction'] as Record<string, unknown>;
        const remainingMs = (pred['remaining_ms'] as number) ?? 0;
        const remainingH = remainingMs / 3_600_000;
        const confidence = ((pred['confidence'] as number) ?? 0) * 100;
        p.log('');
        p.log(`  Estimated remaining time:  ${remainingH.toFixed(1)} hours`);
        p.log(`  Confidence:                ${confidence.toFixed(1)}%`);
        p.log(`  Method:                    ${pred['method'] ?? 'unknown'}`);
        if (weibull) {
          p.log('');
          p.log('  Weibull survival model (fitted to historical case durations):');
          p.log(`    Shape (k):    ${(weibull['shape'] as number).toFixed(3)}`);
          p.log(
            `    Scale (lambda): ${((weibull['scale_ms'] as number) / 3_600_000).toFixed(2)} hours`
          );
          p.log(`    Distribution: ${weibull['interpretation']}`);
        }
        p.log('');
      } else {
        if (weibull) {
          p.log('');
          p.log('  Weibull survival model (fitted to historical case durations):');
          p.log(`    Shape (k):    ${(weibull['shape'] as number).toFixed(3)}`);
          p.log(
            `    Scale (lambda): ${((weibull['scale_ms'] as number) / 3_600_000).toFixed(2)} hours`
          );
          p.log(`    Distribution: ${weibull['interpretation']}`);
          p.log('');
        }
        p.info((result['message'] as string) ?? 'Use --prefix to predict case duration.');
      }
      p.log('');
      p.log('  Next actions:');
      p.log('    • Predict with prefix: wpm predict remaining-time -i <log> --prefix "<A>,<B>"');
      p.log('    • Check SLA breaches:  wpm temporal -i <log>');
      p.log('    • Detect bottlenecks:  wpm run -i <log> --algorithm inductive_miner');
      p.log('');
      break;
    }

    case 'outcome': {
      if (result['anomaly']) {
        const a = result['anomaly'] as Record<string, unknown>;
        p.log('');
        p.log(`  Anomaly score:    ${(a['score'] as number).toFixed(4)}`);
        p.log(`  Is anomalous:     ${a['is_anomalous']}`);
        p.log(`  Threshold:        ${a['threshold']}`);
        p.log(`  Log-likelihood:   ${(result['logLikelihood'] as number).toFixed(4)}`);
        p.log('');
      } else {
        const anomalies = result['anomalies'] as Array<Record<string, unknown>>;
        if (!anomalies || anomalies.length === 0) {
          p.info('No anomalous traces found.');
          return;
        }
        p.log('');
        p.log('  Case ID              Score     Anomalous');
        p.log('  -------------------  --------  ---------');
        for (const a of anomalies) {
          const caseId = String(a['case_id'] ?? a['trace_id'] ?? '?').padEnd(19);
          const score = ((a['score'] as number) ?? 0).toFixed(4).padStart(8);
          const flag = a['is_anomalous'] ? 'yes' : 'no';
          p.log(`  ${caseId}  ${score}  ${flag}`);
        }
        p.log('');
      }
      p.log('  Next actions:');
      p.log('    • Inspect deviating cases: wpm conformance -i <log>');
      p.log('    • Discover reference model: wpm run -i <log> --algorithm inductive_miner');
      p.log('    • Score a specific prefix:  wpm predict outcome -i <log> --prefix "<A>,<B>"');
      p.log('');
      break;
    }

    case 'drift': {
      const dr = result['driftResult'] as Record<string, unknown>;
      const drifts = (dr?.['drifts'] as Array<Record<string, unknown>>) ?? [];

      // EWMA smoothing context (from the enriched predict result)
      const ewma = result['ewma'] as Record<string, unknown> | null | undefined;
      // Structural change aggregates across all drift points
      const sc = result['structural_changes'] as Record<string, unknown> | undefined;
      const appeared = (sc?.['appeared'] as string[]) ?? [];
      const disappeared = (sc?.['disappeared'] as string[]) ?? [];
      const suggestions = (sc?.['suggestions'] as string[]) ?? [];

      if (drifts.length === 0) {
        p.info('No concept drift detected in this log window.');
        p.log('');
        p.log('  What this means: The Jaccard similarity between consecutive trace windows');
        p.log('  remained stable — the process behaviour did not change significantly.');
        p.log('');
        p.log('  What to do: Run again on a longer log or with a smaller --drift-window to');
        p.log('  increase sensitivity. Use "wpm drift-watch" for continuous monitoring.');
        return;
      }
      p.log('');
      p.log(
        `  Detected ${drifts.length} drift point(s) (method: ${dr?.['method'] ?? 'jaccard_window'}, window=${dr?.['window_size'] ?? '?'}):`
      );
      for (const dp of drifts) {
        const pos = dp['position'] ?? '?';
        const dist =
          typeof dp['distance'] === 'number'
            ? dp['distance'].toFixed(4)
            : String(dp['distance'] ?? '');
        p.log(`    Position ${pos}  distance=${dist}  type=${dp['type'] ?? 'concept_drift'}`);
      }

      // EWMA trend summary with plain-English threshold interpretation
      if (ewma) {
        const lastVal =
          typeof ewma['last_value'] === 'number' ? (ewma['last_value'] as number) : null;
        const trendLabel =
          ewma['trend'] === 'rising'
            ? 'RISING (drift is accelerating)'
            : ewma['trend'] === 'falling'
              ? 'falling (drift is subsiding)'
              : 'stable';
        p.log('');
        p.log(
          `  EWMA trend: ${trendLabel}  (smoothed last value: ${lastVal !== null ? lastVal.toFixed(4) : '–'})`
        );
        if (lastVal !== null) {
          // Interpret the EWMA value relative to a typical Jaccard threshold of 0.3
          const TYPICAL_THRESHOLD = 0.3;
          const ratio = lastVal / TYPICAL_THRESHOLD;
          if (ratio >= 1.0) {
            p.log(
              `  Interpretation: EWMA ${lastVal.toFixed(4)} exceeds threshold ${TYPICAL_THRESHOLD.toFixed(1)} — drift is confirmed.`
            );
            p.log('  What to do:');
            p.log('    1. Inspect the drift points above to find where behaviour changed.');
            p.log('    2. Check appeared/disappeared activities below for structural clues.');
            p.log('    3. Re-discover the process model from the pre-drift and post-drift');
            p.log('       sub-logs separately: wpm run <log> --algorithm inductive_miner');
            p.log('    4. Compare the two models: wpm diff <log1> <log2>');
          } else {
            p.log(
              `  Interpretation: EWMA ${lastVal.toFixed(4)} is below typical threshold ${TYPICAL_THRESHOLD.toFixed(1)} — drift points detected but signal is low.`
            );
            p.log('  Consider: Increase --drift-window or wait for more event data before acting.');
          }
        }
      }

      // Structural changes aggregated across all drift points
      if (disappeared.length > 0) {
        p.log('');
        p.log(`  Activities that disappeared across drift windows:`);
        p.log(
          `    ${disappeared.slice(0, 8).join(', ')}${disappeared.length > 8 ? ` (+${disappeared.length - 8} more)` : ''}`
        );
      }
      if (appeared.length > 0) {
        p.log(`  Activities that appeared across drift windows:`);
        p.log(
          `    ${appeared.slice(0, 8).join(', ')}${appeared.length > 8 ? ` (+${appeared.length - 8} more)` : ''}`
        );
      }
      if (suggestions.length > 0) {
        p.log('');
        for (const s of suggestions) {
          p.log(`  Suggestion: ${s}`);
        }
      }
      p.log('');
      p.log('  Next actions:');
      p.log('    • Continuous monitoring:  wpm drift-watch -i <log>');
      p.log('    • Compare pre/post models: wpm diff <log1> <log2>');
      p.log('    • Re-discover after drift: wpm run -i <log> --algorithm inductive_miner');
      p.log('');
      break;
    }

    case 'features': {
      const transitions = result['transitions'] as Record<string, unknown>;
      p.log('');
      const edges = Array.isArray(transitions?.['edges'])
        ? (transitions['edges'] as unknown[])
        : [];
      if (edges.length > 0) {
        p.log(`  Transition probabilities: ${edges.length} edge(s)`);
        for (const t of edges.slice(0, 5)) {
          p.log(`    ${JSON.stringify(t)}`);
        }
        if (edges.length > 5) p.log(`    ... (${edges.length - 5} more)`);
      } else if (Array.isArray(transitions)) {
        const arr = transitions as unknown as Array<Record<string, unknown>>;
        p.log(`  Transition probabilities: ${arr.length} edge(s)`);
        for (const t of arr.slice(0, 5)) {
          p.log(`    ${JSON.stringify(t)}`);
        }
        if (arr.length > 5) p.log(`    ... (${arr.length - 5} more)`);
      } else {
        p.log(`  ${JSON.stringify(transitions)}`);
      }
      if (result['prefixFeatures']) {
        p.log('');
        p.log(`  Prefix features: ${JSON.stringify(result['prefixFeatures'])}`);
      }
      p.log('');
      p.log('  What this means:');
      p.log('  Transition probabilities capture the likelihood of moving from one activity');
      p.log('  to the next. High-probability edges are the process backbone; low-probability');
      p.log('  edges indicate rare variants, rework loops, or exceptions.');
      p.log('');
      p.log('  Next actions:');
      p.log('    • Feed to ML classifier:   wpm ml classify -i <log>');
      p.log('    • Narrow by prefix:        wpm predict features -i <log> --prefix "<A>,<B>"');
      p.log('    • Compare algorithm views: wpm compare -i <log>');
      p.log('');
      break;
    }

    case 'resource': {
      // Gap 3: show derived rates and utilisation (rho) so analyst can judge queue health.
      const qs = result['queueStats'] as Record<string, unknown>;
      const dr = result['derivedRates'] as Record<string, unknown> | undefined;
      p.log('');
      p.log('  M/M/1 Queue Model (rates derived from event log):');
      if (dr) {
        p.log(`    Arrival rate (lambda): ${(dr['arrivalRate'] as number).toFixed(4)} cases/event`);
        p.log(
          `    Service rate (mu):     ${(dr['serviceRate'] as number).toFixed(4)} completions/event`
        );
        const rho = (dr['rho'] as number) ?? 0;
        const unstableFlag = rho >= 1.0 ? '  WARNING: UNSTABLE' : '';
        p.log(`    Utilisation (rho):     ${(rho * 100).toFixed(1)}%${unstableFlag}`);
        p.log(
          `    Queue stable:          ${dr['stable'] ? 'yes' : 'no (rho >= 1 -- add capacity)'}`
        );
        if (dr['warning']) {
          p.log(`    Warning:               ${dr['warning']}`);
        }
        p.log('');
      }
      p.log(
        `    Est. wait time:        ${((qs?.['wait_time'] as number) ?? 0).toFixed(2)} event-units`
      );
      p.log(`  Transitions in model: ${result['transitionCount']}`);
      p.log('');
      p.log('  What this means:');
      p.log('  Utilisation (rho) measures how close the process is to capacity.');
      p.log('  rho < 0.7  — comfortable headroom; queue wait times are short.');
      p.log('  rho 0.7–1.0 — approaching saturation; wait times grow non-linearly.');
      p.log('  rho >= 1.0  — queue is unstable; cases accumulate without bound.');
      p.log('');
      p.log('  Next actions:');
      p.log('    • Identify overloaded resources: wpm social -i <log>');
      p.log('    • Find bottleneck activities:    wpm temporal -i <log>');
      p.log('    • Compare algorithm views:       wpm compare -i <log>');
      p.log('');
      break;
    }
  }
}
