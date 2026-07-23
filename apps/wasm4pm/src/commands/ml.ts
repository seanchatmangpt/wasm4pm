import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { savePredictionResult } from './results.js';
import { VALID_ML_TASKS, executeMlTask } from '../ml-runner.js';
import type { MlTask, MlQualitySummary, ClusterProfile } from '../ml-runner.js';
import { findClosestMatch } from '@wasm4pm/contracts';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';
import { resolveInputPath } from '../input-validation.js';

export const ml = defineCommand({
  meta: {
    name: 'ml',
    description:
      'Run ML analysis (classify, cluster, forecast, anomaly, regress, pca). Ex: wpm ml cluster -i log.xes\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    task: {
      type: 'positional',
      description: `ML task:
  classify   - Classify traces into categories using knn or logistic regression
  cluster    - Cluster variants using k-means or dbscan (with silhouette quality scores)
  forecast   - Forecast drift trends with linear/polynomial/exponential models (accuracy: MAPE, MAE, RMSE)
  anomaly    - Detect anomalies in drift signal using EMA smoothing (recall, precision, FPR metrics)
  regress    - Regress remaining time prediction using linear regression (R², MAE, RMSE)
  pca        - PCA dimensionality reduction (variance explained per component)`,
      required: true,
    },
    log: {
      type: 'positional',
      description: 'Path to XES event log file (positional alternative to -i/--input)',
      required: false,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file',
      required: false,
      alias: 'i',
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
    },
    method: {
      type: 'string',
      description: 'ML method (knn, logistic_regression, kmeans, dbscan)',
    },
    k: {
      type: 'string',
      description: 'Number of clusters or neighbors (numeric, default: 3)',
    },
    'target-key': {
      type: 'string',
      description: 'Target variable key (default: outcome)',
    },
    'forecast-periods': {
      type: 'string',
      description: 'Number of future periods to forecast (numeric, default: 5)',
    },
    'n-components': {
      type: 'string',
      description: 'PCA components (numeric, default: 2)',
    },
    eps: {
      type: 'string',
      description: 'DBSCAN epsilon (numeric, default: 1.0)',
    },
    'auto-select': {
      type: 'boolean',
      description: 'Automatically select best algorithm based on data characteristics',
    },
    tune: {
      type: 'boolean',
      description: 'Enable hyperparameter tuning via grid search with 3-fold CV',
    },
    'cv-folds': {
      type: 'string',
      description: 'Number of CV folds for hyperparameter tuning (default: 3)',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: { type: 'boolean', alias: 'v', description: 'Show detailed output (feature counts, per-class metrics, model parameters)' },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress all non-error output' },
    'no-save': { type: 'boolean', description: 'Do not auto-save the result to .wasm4pm/results/' },
    cv: {
      type: 'string',
      description: 'Enable k-fold cross-validation for classify (--cv 3 → 3-fold, --cv alone → 3-fold default). Reports per-fold scores, mean, std-dev, and a STABLE/VARIABLE verdict.',
    },
    'compare-tasks': {
      type: 'boolean',
      description: 'Run all 6 ML tasks on the same log and show a multi-task summary table',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // ── --compare-tasks: run all 6 tasks and render a summary ────────────────
    if (ctx.args['compare-tasks']) {
      return withSpan('ml', { task: 'compare-tasks', format }, async () => {
        try {
          const inputPath = resolveInputPath(
            ctx.args.log as string | undefined,
            ctx.args.input as string | undefined
          );
          if (!inputPath) {
            const result = makeErrorResult(
              'ml',
              new Error('Input file required.\n\nUsage:  wpm ml --compare-tasks -i <log.xes>'),
              EXIT_CODES.source_error,
              'MISSING_INPUT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
          const tasks: MlTask[] = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'];
          const taskResults: Record<string, unknown> = {};

          await withLogSession(
            { inputPath, activityKey, commandName: 'ml', emitOptions: { format, verbose, quiet } },
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;
              for (const t of tasks) {
                try {
                  taskResults[t] = await executeMlTask(wasm, t, logHandle, activityKey, {
                    crossValidate: false,
                  });
                } catch (e) {
                  taskResults[t] = {
                    _error: e instanceof Error ? e.message : String(e),
                  };
                }
              }
            }
          );

          // Build structured comparison array + recommendation
          const comparison = buildComparisonArray(taskResults);
          const recommendation = buildRecommendation(comparison, taskResults);

          const payload = {
            status: 'ok' as const,
            task: 'compare-tasks',
            input: inputPath,
            comparison,
            recommendation,
            // keep task_results for verbose/debug consumers
            task_results: taskResults,
          };
          const result = makeResult('ml', payload, performance.now() - t0, EXIT_CODES.success);
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            const data = res.payload as typeof payload;
            projection.success('ML Multi-Task Analysis Summary');
            formatCompareTasksOutput(projection, data.task_results);
            projection.log('');
            projection.log(`  Recommendation: ${data.recommendation}`);
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const result = makeErrorResult(
            'ml',
            new Error(`ML compare-tasks failed: ${msg}`),
            EXIT_CODES.execution_error,
            'ML_EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      });
    }

    return withSpan(
      'ml',
      {
        task: String(ctx.args.task ?? ''),
        input: String(ctx.args.input ?? ctx.args.log ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        method: String(ctx.args.method ?? ''),
        format,
      },
      async () => {
        try {
          const task = ctx.args.task as string;
          if (!VALID_ML_TASKS.includes(task as MlTask)) {
            const suggestion = findClosestMatch(task, [...VALID_ML_TASKS], 3);
            const didYouMean = suggestion ? `\nDid you mean: '${suggestion}'?` : '';
            const result = makeErrorResult(
              'ml',
              new Error(
                `Unknown ML task: "${task}".${didYouMean}\n` +
                  `Valid tasks: ${VALID_ML_TASKS.join(', ')}\n\n` +
                  `Usage:  wpm ml <task> -i <log.xes>\n` +
                  `Examples:\n` +
                  `  wpm ml cluster -i process.xes\n` +
                  `  wpm ml classify -i process.xes\n\n` +
                  `Run 'wpm ml --help' for full task descriptions.`
              ),
              EXIT_CODES.source_error,
              'INVALID_TASK'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Validate --format value
          if (format !== 'human' && format !== 'json') {
            const result = makeErrorResult(
              'ml',
              new Error(
                `Invalid --format value: "${format}". Must be "human" or "json".\n` +
                  `Usage:  wpm ml <task> -i <log.xes> --format human|json`
              ),
              EXIT_CODES.config_error,
              'INVALID_FORMAT'
            );
            // `format` itself holds the invalid value here, so it can't be
            // passed through verbatim to `emitResult` (unrecognized switch
            // case). Fall back to 'human' for a real interactive terminal,
            // but 'json' when `--quiet` is set — `emitResult` unconditionally
            // suppresses non-json/sarif output under `--quiet`, and quiet
            // callers (e.g. the noun-verb bridge, which always appends
            // `--quiet`) need this diagnostic on stdout as JSON, not silence.
            emitResult(result, { format: quiet ? 'json' : 'human', verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Validate --k (clusters / neighbors) when provided
          const rawK = ctx.args.k as string | undefined;
          if (rawK !== undefined) {
            const parsedK = parseInt(rawK, 10);
            if (Number.isNaN(parsedK) || parsedK <= 0) {
              const inputPath = resolveInputPath(
                ctx.args.log as string | undefined,
                ctx.args.input as string | undefined
              );
              let fileExists = false;
              if (inputPath) {
                try {
                  await fs.access(inputPath);
                  fileExists = true;
                } catch {
                  // ignored
                }
              }

              if (fileExists && Number.isNaN(parsedK)) {
                const result = makeErrorResult(
                  'ml',
                  new Error(`Invalid parameter: k must be a positive integer`),
                  EXIT_CODES.execution_error,
                  'COMMAND_ERROR',
                  'Ensure that the parameter k is a positive number.'
                );
                emitResult(result, { format, verbose, quiet });
                return await exitWithFlush(result.exit_code);
              } else {
                const result = makeErrorResult(
                  'ml',
                  new Error(
                    `Invalid --k value: "${rawK}". Must be a positive integer.\n` +
                      `Example:  wpm ml cluster -i log.xes --k 3`
                  ),
                  EXIT_CODES.config_error,
                  'INVALID_K'
                );
                emitResult(result, { format, verbose, quiet });
                return await exitWithFlush(result.exit_code);
              }
            }
          }

          // Validate --forecast-periods when provided (forecast task)
          const rawForecastPeriods = ctx.args['forecast-periods'] as string | undefined;
          if (rawForecastPeriods !== undefined) {
            const parsedFp = parseInt(rawForecastPeriods, 10);
            if (Number.isNaN(parsedFp) || parsedFp <= 0) {
              const result = makeErrorResult(
                'ml',
                new Error(
                  `Invalid --forecast-periods value: "${rawForecastPeriods}". Must be a positive integer.\n` +
                    `Example:  wpm ml forecast -i log.xes --forecast-periods 5`
                ),
                EXIT_CODES.config_error,
                'INVALID_FORECAST_PERIODS'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          const inputPath = resolveInputPath(
            ctx.args.log as string | undefined,
            ctx.args.input as string | undefined
          );
          if (!inputPath) {
            const result = makeErrorResult(
              'ml',
              new Error(
                'Input file required.\n\nUsage:  wpm ml <task> <log.xes>\n        wpm ml <task> -i <log.xes>\n\nRun "wpm ml --help" for details.'
              ),
              EXIT_CODES.source_error,
              'MISSING_INPUT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          await withLogSession(
            { inputPath, activityKey, commandName: 'ml', emitOptions: { format, verbose, quiet } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              // --cv can be --cv (boolean true), --cv 3 (string "3"), or absent (false/undefined)
              const rawCv = ctx.args.cv as string | boolean | undefined;
              const crossValidate = rawCv !== undefined && rawCv !== false && rawCv !== '';
              // If rawCv is a numeric string use it as fold count; otherwise fall back to cv-folds
              const cvFoldsFromCv =
                typeof rawCv === 'string' && rawCv !== '' && !Number.isNaN(parseInt(rawCv, 10))
                  ? rawCv
                  : undefined;
              const mlResult = await executeMlTask(wasm, task as MlTask, logHandle, activityKey, {
                method: ctx.args.method as string,
                k: ctx.args.k as string,
                targetKey: ctx.args['target-key'] as string,
                forecastPeriods: ctx.args['forecast-periods'] as string,
                nComponents: ctx.args['n-components'] as string,
                eps: ctx.args.eps as string,
                crossValidate,
                cvFolds: cvFoldsFromCv ?? (ctx.args['cv-folds'] as string | undefined),
              });

              if (!ctx.args['no-save']) {
                const savedPath = await savePredictionResult(
                  `ml-${task}`,
                  inputPath,
                  activityKey,
                  mlResult
                );
                if (savedPath && format === 'human' && verbose) {
                  // savedPath info surfaced via verbose in human renderer
                  (mlResult as Record<string, unknown>)['_savedPath'] = savedPath;
                }
              }

              const payload = { status: 'ok' as const, task, input: inputPath, ...mlResult };
              const result = makeResult('ml', payload, performance.now() - t0, EXIT_CODES.success);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const data = res.payload as typeof payload;
                projection.success(`ML complete: ${data.task}`);
                formatMlHumanOutput(projection, data.task as MlTask, data);
                if (verbose && (data as Record<string, unknown>)['_savedPath']) {
                  projection.debug(
                    `Result saved: ${(data as Record<string, unknown>)['_savedPath']}`
                  );
                }
              });

              if (!ctx.args['no-save']) {
                const inputBytes = await fs.readFile(inputPath);
                const sampleSize = Array.isArray(
                  (mlResult as Record<string, unknown>).predictions
                )
                  ? ((mlResult as Record<string, unknown>).predictions as unknown[]).length
                  : Array.isArray((mlResult as Record<string, unknown>).assignments)
                    ? ((mlResult as Record<string, unknown>).assignments as unknown[]).length
                    : 0;
                const receipt: CommandReceipt = {
                  ...newReceipt('ml'),
                  command: 'ml',
                  input_hash: blake3Hex(inputBytes),
                  output_hash: blake3Hex(JSON.stringify(payload)),
                  status: 'success',
                  summary: {
                    task,
                    method: String(ctx.args.method ?? ''),
                    activity_key: activityKey,
                    sample_size: sampleSize,
                    input_file: inputPath,
                  },
                };
                saveCommandReceipt(receipt);
              }

              return await exitWithFlush(result.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isKError = msg.toLowerCase().includes('k must be') || msg.toLowerCase().includes('parameter k');
          const errCode = isKError ? 'COMMAND_ERROR' : 'ML_EXECUTION_ERROR';
          const remediation = isKError 
            ? 'Ensure that the parameter k is a positive number.' 
            : undefined;
          const result = makeErrorResult(
            'ml',
            new Error(`ML analysis failed: ${msg}\n\nRun 'wpm doctor' to check your environment.`),
            EXIT_CODES.execution_error,
            errCode,
            remediation
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

// ─── Comparison helpers ───────────────────────────────────────────────────────

export interface ComparisonEntry {
  task: string;
  score: number | null;
  metric: string;
  insight: string;
}

/** Derive a single numeric score + metric label from a task result. */
function taskScoreAndMetric(
  task: string,
  taskResult: Record<string, unknown>
): { score: number | null; metric: string; insight: string } {
  if (taskResult._error) {
    return { score: null, metric: 'error', insight: String(taskResult._error).slice(0, 80) };
  }
  switch (task) {
    case 'classify': {
      const preds = taskResult.predictions as Array<{ confidence: number }> | undefined;
      const cvAcc = taskResult.cv_accuracy as number | undefined;
      const score = cvAcc !== undefined
        ? parseFloat(cvAcc.toFixed(4))
        : preds && preds.length > 0
          ? parseFloat((preds.reduce((s, p) => s + p.confidence, 0) / preds.length).toFixed(4))
          : null;
      const qs = taskResult._qualitySummary as { interpretation?: string } | undefined;
      return {
        score,
        metric: cvAcc !== undefined ? 'cv_accuracy' : 'mean_confidence',
        insight: qs?.interpretation ?? (score !== null && score >= 0.7 ? 'Clear separation detected' : 'Weak class signal'),
      };
    }
    case 'cluster': {
      const silhouette = taskResult.silhouette_score as number | null | undefined;
      const k = taskResult.clusterCount as number | undefined;
      const score = typeof silhouette === 'number' ? parseFloat(silhouette.toFixed(4)) : null;
      return {
        score,
        metric: 'silhouette',
        insight: k !== undefined ? `${k} natural group(s) detected` : 'Clustering complete',
      };
    }
    case 'forecast': {
      const rSquared = taskResult.rSquared as number | undefined;
      const trend = taskResult.trend as { direction?: string } | undefined;
      const score = rSquared !== undefined ? parseFloat(rSquared.toFixed(4)) : null;
      return {
        score,
        metric: 'r2',
        insight: trend?.direction
          ? `${trend.direction} trend${score !== null ? ` (R²=${score})` : ''}`
          : 'Forecast complete',
      };
    }
    case 'anomaly': {
      const rate = taskResult.anomaly_rate as number | undefined;
      const peakCount = (taskResult.peakIndices as number[] | undefined)?.length ?? 0;
      const score = rate !== undefined ? parseFloat(rate.toFixed(4)) : null;
      return {
        score,
        metric: 'anomaly_rate',
        insight: peakCount === 0 ? 'Process appears stable' : `${peakCount} anomalous window(s) detected`,
      };
    }
    case 'regress': {
      const r2 = taskResult.rSquared as number | undefined;
      const score = r2 !== undefined ? parseFloat(r2.toFixed(4)) : null;
      return {
        score,
        metric: 'r2',
        insight: score !== null
          ? score >= 0.6 ? 'Moderate fit — duration predictable from features' : 'Weak fit — consider more features'
          : 'Regression complete',
      };
    }
    case 'pca': {
      const ev = taskResult.explainedVariance as number[] | undefined;
      const total = ev ? ev.reduce((s, v) => s + v, 0) : undefined;
      const nComp = taskResult.nComponents as number | undefined;
      const score = total !== undefined ? parseFloat(total.toFixed(4)) : null;
      return {
        score,
        metric: 'variance_explained',
        insight: score !== null && nComp !== undefined
          ? `${(score * 100).toFixed(0)}% variance in ${nComp} component(s)`
          : 'PCA complete',
      };
    }
    default:
      return { score: null, metric: 'unknown', insight: 'Task complete' };
  }
}

/** Build the structured comparison array from taskResults dict. */
export function buildComparisonArray(taskResults: Record<string, unknown>): ComparisonEntry[] {
  const tasks = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'];
  return tasks.map((t) => {
    const tr = (taskResults[t] as Record<string, unknown>) ?? { _error: 'not run' };
    const { score, metric, insight } = taskScoreAndMetric(t, tr);
    return { task: t, score, metric, insight };
  });
}

/** Pick the best recommendation from the comparison array. */
export function buildRecommendation(
  comparison: ComparisonEntry[],
  taskResults: Record<string, unknown>
): string {
  // Find highest-scoring successful task.
  // anomaly_rate: lower is better, but 0-rate anomaly is "no news" — skip it from the
  // "best task" ranking (it can only win a recommendation if everything else also has null scores).
  const positiveMetric: Record<string, boolean> = {
    cv_accuracy: true, mean_confidence: true, silhouette: true, r2: true, variance_explained: true,
    anomaly_rate: false, // lower is better
  };
  let bestTask: string | null = null;
  let bestScore = -Infinity;
  for (const entry of comparison) {
    if (entry.score === null) continue;
    // Skip anomaly from positive-ranking — a 0% rate is good but not an actionable finding
    if (entry.metric === 'anomaly_rate') continue;
    const higherIsBetter = positiveMetric[entry.metric] !== false;
    const normalized = higherIsBetter ? entry.score : 1 - entry.score;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestTask = entry.task;
    }
  }
  // Secondary pass: if nothing positive found, check if anomaly is interesting (rate > 0)
  if (bestTask === null) {
    const anomalyEntry = comparison.find((e) => e.metric === 'anomaly_rate' && e.score !== null && e.score > 0);
    if (anomalyEntry) bestTask = 'anomaly';
  }

  // Build an actionable recommendation
  if (bestTask === 'classify') {
    const score = comparison.find((e) => e.task === 'classify')?.score;
    return `Use classify for outcome prediction (highest confidence${score !== null ? `: ${score}` : ''})`;
  }
  if (bestTask === 'cluster') {
    const k = (taskResults['cluster'] as Record<string, unknown>)?.clusterCount as number | undefined;
    return `Use clustering to segment the process${k !== undefined ? ` (${k} natural groups)` : ''}`;
  }
  if (bestTask === 'forecast') {
    const trend = ((taskResults['forecast'] as Record<string, unknown>)?.trend as { direction?: string } | undefined);
    return `Use forecast to track ${trend?.direction ?? 'process'} throughput trend`;
  }
  if (bestTask === 'regress') {
    return 'Use regress for remaining-time estimation';
  }
  if (bestTask === 'pca') {
    return 'Use PCA to reduce feature dimensionality before applying other ML tasks';
  }
  if (bestTask === 'anomaly') {
    const peakCount = ((taskResults['anomaly'] as Record<string, unknown>)?.peakIndices as number[] | undefined)?.length ?? 0;
    return peakCount > 0 ? `Investigate ${peakCount} anomalous drift window(s)` : 'Process appears stable — no urgent anomalies';
  }
  return 'Run individual tasks for deeper analysis';
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

/** Render a percentage bar like ████████░░ up to `width` chars */
function bar(pct: number, width = 20): string {
  const filled = Math.round(Math.min(1, Math.max(0, pct)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Format a number as a percentage string: 0.847 → "84.7%" */
function pctStr(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function renderQualityBanner(
  projection: import('../output.js').ConsoleProjection,
  qs: MlQualitySummary
): void {
  const tick = qs.primaryGood ? '[OK]' : '[!!]';
  const primary = `${qs.primaryLabel}: ${qs.primaryValue}`;
  const secondary = qs.secondary.map((s) => `${s.label}: ${s.value}`).join('  ');
  projection.log('');
  projection.log(`  ${tick} ${primary}  ${secondary}`);
  projection.log(`     ${qs.interpretation}`);
}

function formatMlHumanOutput(
  projection: import('../output.js').ConsoleProjection,
  task: MlTask,
  result: Record<string, unknown>
): void {
  // Render quality banner (Gap 1) — present on every result from executeMlTask
  const qs = result._qualitySummary as MlQualitySummary | undefined;
  if (qs) {
    renderQualityBanner(projection, qs);
  }

  switch (task) {
    case 'classify': {
      const predictions = result.predictions as Array<{
        caseId: string;
        predicted: string;
        confidence: number;
      }>;
      if (!predictions || predictions.length === 0) {
        projection.info('No predictions available.');
        return;
      }

      const info = result.modelInfo as Record<string, unknown>;
      const method = String(result.method ?? 'knn');

      // ── Accuracy metrics block ─────────────────────────────────────────────
      projection.log('');
      projection.log('  ML Classification — Case Outcome Prediction');
      projection.log('  ============================================');
      // Derive accuracy-like metrics from predictions (honest: mean confidence)
      const meanConf =
        predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length;
      // Attempt to get CV accuracy from result
      const cvAcc = result.cv_accuracy as number | undefined;
      const cvStd = result.cv_std_dev as number | undefined;
      const cvFolds = result.cv_folds as number | undefined;
      const cvFoldScores = result.cv_fold_scores as number[] | undefined;

      if (cvAcc !== undefined) {
        projection.log(`  Accuracy (CV):  ${pctStr(cvAcc)}  ${bar(cvAcc)}`);
        if (cvStd !== undefined) {
          projection.log(`  Std Dev:        ±${pctStr(cvStd)}  (${cvFolds ?? 'k'}-fold)`);
        }
      }
      projection.log(`  Mean Conf:      ${pctStr(meanConf)}  ${bar(meanConf)}`);
      projection.log(`  Method: ${method}  |  Traces: ${info?.traceCount ?? predictions.length}  |  Features: ${info?.featureCount ?? '?'}`);

      // ── Per-fold CV block ──────────────────────────────────────────────────
      if (cvFoldScores && cvFoldScores.length > 0) {
        projection.log('');
        projection.log('  Cross-Validation Results');
        projection.log('  ─────────────────────────────────────────────');
        cvFoldScores.forEach((score, i) => {
          const foldBar = bar(score, 16);
          projection.log(`  Fold ${i + 1}: ${pctStr(score).padStart(7)}  ${foldBar}`);
        });
        if (cvAcc !== undefined) {
          projection.log('  ─────────────────────────────────────────────');
          projection.log(`  Mean:   ${pctStr(cvAcc).padStart(7)}  (±${cvStd !== undefined ? pctStr(cvStd) : '?'})`);
          const isStable = cvStd !== undefined && cvStd < 0.05;
          projection.log(
            `  Verdict: ${isStable ? 'STABLE — low variance, model is generalizable' : 'VARIABLE — high fold-to-fold variation, consider more data'}`
          );
        }
      }

      // ── Confusion matrix (derived from class distribution) ─────────────────
      const classDist = result._classDistribution as
        | Array<{ className: string; count: number; pct: number; meanConf: number }>
        | undefined;
      if (classDist && classDist.length >= 2) {
        projection.log('');
        projection.log('  Class Distribution (signal check):');
        projection.log('  ──────────────────────────────────────────────────────');
        projection.log('  Class                 Count    Share    Mean conf');
        projection.log('  ────────────────────  ───────  ───────  ─────────');
        for (const row of classDist) {
          const cls = (row.className ?? '?').padEnd(20);
          const cnt = String(row.count).padStart(7);
          const share = pctStr(row.pct).padStart(7);
          const conf = pctStr(row.meanConf).padStart(8);
          const warn = row.pct > 0.8 ? ' ⚠ dominant class' : '';
          projection.log(`  ${cls}  ${cnt}  ${share}  ${conf}${warn}`);
        }
        // Build a simple 2×2 confusion-matrix approximation from confidence
        if (classDist.length === 2) {
          const [a, b] = classDist;
          const aCorrect = Math.round(a.count * a.meanConf);
          const aWrong = a.count - aCorrect;
          const bCorrect = Math.round(b.count * b.meanConf);
          const bWrong = b.count - bCorrect;
          projection.log('');
          projection.log('  Confusion Matrix (estimated from confidence):');
          projection.log('                 Predicted');
          projection.log(`           ${a.className.padEnd(10)}  ${b.className.padEnd(10)}`);
          projection.log(`  Actual ${a.className.padEnd(10)}  ${String(aCorrect).padStart(5)}     ${String(aWrong).padStart(5)}    (${pctStr(a.meanConf)} correct)`);
          projection.log(`         ${b.className.padEnd(10)}  ${String(bWrong).padStart(5)}     ${String(bCorrect).padStart(5)}    (${pctStr(b.meanConf)} correct)`);
        }
      } else if (classDist && classDist.length === 1) {
        projection.log('');
        projection.log(`  ⚠ Single class predicted: "${classDist[0].className}". Check target key or log diversity.`);
      }

      // ── Top predictions sample ─────────────────────────────────────────────
      projection.log('');
      projection.log('  Sample predictions (top 10):');
      projection.log('  ───────────────────────────────────────────────────────');
      projection.log('  Case ID              Predicted         Confidence');
      projection.log('  ───────────────────  ────────────────  ─────────');
      for (const p of predictions.slice(0, 10)) {
        const id = (p.caseId ?? '?').padEnd(19);
        const pred = (p.predicted ?? '?').padEnd(16);
        const conf = pctStr(p.confidence).padStart(8);
        projection.log(`  ${id}  ${pred}  ${conf}`);
      }
      if (predictions.length > 10) projection.log(`  ... (${predictions.length - 10} more)`);

      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm conformance -i <log>  verify whether low-confidence cases deviate from the reference model`);
      projection.log(`    wpm ml cluster -i <log>   discover whether classified groups correspond to natural clusters`);
      projection.log('');
      break;
    }

    case 'cluster': {
      const assignments = result.assignments as Array<{ caseId: string; cluster: number }>;
      if (!assignments || assignments.length === 0) {
        projection.info('No cluster assignments.');
        return;
      }
      const info = result.modelInfo as Record<string, unknown>;
      const k = result.clusterCount as number;
      const noise = result.noiseCount as number;
      const total = assignments.length;
      const profiles = result._clusterProfiles as ClusterProfile[] | undefined;

      // Build per-cluster size map
      const clusterSizes = new Map<number, number>();
      for (const a of assignments) {
        clusterSizes.set(a.cluster, (clusterSizes.get(a.cluster) ?? 0) + 1);
      }

      // Silhouette score from quality summary
      const qs2 = result._qualitySummary as MlQualitySummary | undefined;
      const silhouette = qs2?.secondary.find((s) => s.label === 'Silhouette')?.value;
      const inertia = info?.inertia as number | undefined;

      projection.log('');
      projection.log('  ML Clustering — Process Variant Groups');
      projection.log('  =======================================');
      if (silhouette) {
        projection.log(`  Silhouette score: ${silhouette}`);
      }
      if (inertia !== undefined) {
        projection.log(`  Inertia: ${inertia.toFixed(2)}  (lower = tighter clusters)`);
      }
      projection.log(`  Clusters: ${k}  |  Total cases: ${total}  |  Method: ${result.method}`);

      projection.log('');
      projection.log('  Cluster Profiles:');
      projection.log('  ─────────────────────────────────────────────────────────────────────');
      projection.log('  Cluster   Cases   Share   Bar                  Characteristics');
      projection.log('  ───────   ─────   ─────   ──────────────────   ───────────────────');

      if (profiles && profiles.length > 0) {
        for (const p of profiles) {
          const label = `Cluster ${p.clusterId}`;
          const share = pctStr(p.pct).padStart(6);
          const clBar = bar(p.pct, 18);
          const means = p.means;
          const meansStr = `len=${means.traceLength} rework=${means.reworkCount} acts=${means.uniqueActivities}`;
          projection.log(
            `  ${label.padEnd(9)}  ${String(p.caseCount).padStart(5)}   ${share}   ${clBar}   ${p.narrative}`
          );
          projection.log(`           ${' '.repeat(5)}            Feature means: ${meansStr}`);
        }
      } else {
        const sortedClusters = [...clusterSizes.entries()]
          .filter(([id]) => id >= 0)
          .sort((a, b) => a[0] - b[0]);
        for (const [clusterId, count] of sortedClusters) {
          const label = `Cluster ${clusterId}`;
          const share = pctStr(count / total).padStart(6);
          const clBar = bar(count / total, 18);
          projection.log(`  ${label.padEnd(9)}  ${String(count).padStart(5)}   ${share}   ${clBar}`);
        }
      }

      if (noise > 0) {
        const noiseShare = pctStr(noise / total).padStart(6);
        const noiseBar = bar(noise / total, 18);
        projection.log(`  noise     ${String(noise).padStart(5)}   ${noiseShare}   ${noiseBar}   outlier cases — unusual sequences`);
        projection.log('');
        projection.log(`  ⚠ ${noise} case(s) classified as noise — consider increasing eps or reducing k.`);
      }

      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm temporal -i <log>   investigate performance differences between clusters`);
      projection.log(`    wpm social -i <log>     check if clusters reflect different resource groups`);
      projection.log('');
      break;
    }

    case 'forecast': {
      const trend = result.trend as
        | { direction?: string; slope?: number; strength?: number }
        | undefined;
      const forecast = result.forecast as number[] | undefined;
      const seasonality = result.seasonality as { period?: number; strength?: number } | undefined;
      const rSquared = result.rSquared as number | undefined;
      const confidenceIntervals = result.confidenceIntervals as
        | Array<[number, number]>
        | undefined;
      const mae = result.mae as number | undefined;
      const rmse = result.rmse as number | undefined;
      const mape = result.mape as number | undefined;

      // Compute percent-change summary over the forecast window
      let pctChangeSummary = '';
      if (forecast && forecast.length >= 2) {
        const first = forecast[0];
        const last = forecast[forecast.length - 1];
        if (first !== 0 && Number.isFinite(first) && Number.isFinite(last)) {
          const p = ((last - first) / Math.abs(first)) * 100;
          const sign = p >= 0 ? '+' : '';
          pctChangeSummary = ` (${sign}${p.toFixed(1)}% over ${forecast.length}-period window)`;
        }
      }

      const trendDir = (trend?.direction ?? 'unknown').toLowerCase();
      const trendStrength = trend?.strength ?? 0;

      function r2Label(r2: number): string {
        if (r2 >= 0.9) return 'strong — trend is reliable';
        if (r2 >= 0.7) return 'moderate — trend is a reasonable guide';
        if (r2 >= 0.5) return 'weak — trend direction is meaningful but magnitude is uncertain';
        if (r2 >= 0) return 'poor — use with caution, high variability';
        return 'negative — model worse than constant baseline';
      }

      projection.log('');
      projection.log('  ML Forecast — Process Throughput Prediction');
      projection.log('  ===========================================');
      projection.log(`  Trend:    ${trend?.direction ?? 'unknown'}${pctChangeSummary}`);
      projection.log(
        `  Strength: ${trendStrength.toFixed(2)}  ${trendStrength >= 0.5 ? '[reliable]' : '[low confidence — indicative only]'}`
      );
      projection.log(`  Slope:    ${(trend?.slope ?? 0).toFixed(4)}`);
      if (rSquared !== undefined) {
        projection.log(`  R²:       ${rSquared.toFixed(4)}  (${r2Label(rSquared)})`);
      }
      if (mae !== undefined) projection.log(`  MAE:      ${mae.toFixed(3)}  |  RMSE: ${rmse !== undefined ? rmse.toFixed(3) : 'n/a'}  |  MAPE: ${mape !== undefined ? mape.toFixed(2) + '%' : 'n/a'}`);

      // ── ASCII trend chart ──────────────────────────────────────────────────
      if (forecast && forecast.length > 0) {
        projection.log('');
        const max = Math.max(...forecast);
        const min = Math.min(...forecast);
        const range = max - min || 1;
        const chartH = 5;
        const chartW = Math.min(forecast.length, 40);
        const rows: string[] = Array.from({ length: chartH }, () => '  ' + ' '.repeat(chartW + 2));
        for (let i = 0; i < Math.min(forecast.length, chartW); i++) {
          const norm = (forecast[i] - min) / range;
          const rowIdx = chartH - 1 - Math.round(norm * (chartH - 1));
          const rowChars = rows[rowIdx].split('');
          rowChars[i + 2] = '▪';
          rows[rowIdx] = rowChars.join('');
        }
        projection.log(`  Forecast chart (${forecast.length} periods):`);
        projection.log(`  ${max.toFixed(2)} ┐`);
        for (const r of rows) {
          projection.log(`         │${r}`);
        }
        projection.log(`  ${min.toFixed(2)} └${'─'.repeat(chartW + 2)}→`);
        projection.log(`  ${'P1'.padEnd(Math.floor(chartW / 2))}${('P' + forecast.length).padStart(Math.ceil(chartW / 2))}`);
      }

      // ── Next period summary ────────────────────────────────────────────────
      if (forecast && forecast.length > 0) {
        const last = forecast[forecast.length - 1];
        const ci = confidenceIntervals?.[confidenceIntervals.length - 1];
        const ciStr = ci ? ` (±${((ci[1] - ci[0]) / 2).toFixed(2)})` : '';
        projection.log('');
        projection.log(`  Next period forecast: ${last.toFixed(2)}${ciStr}`);

        const trendLabel =
          trendDir === 'increasing' || trendDir === 'upward' || trendDir === 'up'
            ? 'INCREASING'
            : trendDir === 'decreasing' || trendDir === 'downward' || trendDir === 'down'
              ? 'DECREASING'
              : 'STABLE';
        projection.log(`  Trend direction:      ${trendLabel}${pctChangeSummary}`);
      }

      if (seasonality) {
        projection.log(
          `  Seasonality: period=${seasonality.period}, strength=${(seasonality.strength ?? 0).toFixed(2)}`
        );
      }
      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm drift-watch -i <log>  monitor drift in real-time as new cases arrive`);
      projection.log(`    wpm temporal -i <log>     analyze actual throughput and wait-time distributions`);
      projection.log('');
      break;
    }

    case 'anomaly': {
      const peakIndices = result.peakIndices as number[] | undefined;
      const peakValues = result.peakValues as number[] | undefined;
      const residualPeaks = result.residualPeaks as number[] | undefined;
      const totalWindows = (result.originalLength as number) ?? 0;
      const peakCount = peakIndices?.length ?? 0;

      projection.log('');
      projection.log('  ML Anomaly Detection — Outlier Cases');
      projection.log('  =====================================');

      if (peakCount === 0) {
        projection.log(`  ✓ No anomalous drift windows detected in ${totalWindows} windows — process appears stable.`);
      } else {
        const rate = totalWindows > 0 ? peakCount / totalWindows : 0;
        projection.log(`  Score threshold: auto (EMA-based)`);
        projection.log(`  Anomalous windows: ${peakCount} (${pctStr(rate)} of ${totalWindows} total)`);

        // Build ranked anomaly list
        const ranked: Array<{ idx: number; val: number }> = [];
        if (peakIndices && peakValues) {
          for (let i = 0; i < peakIndices.length; i++) {
            ranked.push({ idx: peakIndices[i], val: peakValues[i] ?? 0 });
          }
          ranked.sort((a, b) => b.val - a.val);
        }
        const maxVal = ranked.length > 0 ? ranked[0].val : 1;

        projection.log('');
        projection.log('  Top anomalous windows (ranked by drift score):');
        projection.log('  ──────────────────────────────────────────────────────');
        projection.log('  Rank   Window   Score        Severity  Bar');
        projection.log('  ────   ──────   ──────────   ────────  ──────────────');
        for (const [rank, { idx, val }] of ranked.slice(0, 10).entries()) {
          const scorePct = maxVal > 0 ? val / maxVal : 0;
          const anomBar = bar(scorePct, 14);
          const severity =
            val > maxVal * 0.8 ? 'HIGH  ' : val > maxVal * 0.5 ? 'MEDIUM' : 'low   ';
          projection.log(
            `  ${String(rank + 1).padStart(4)}   ${String(idx).padStart(6)}   ${val.toFixed(4).padStart(10)}   ${severity}  ${anomBar}`
          );
        }
        if (peakCount > 10)
          projection.log(`  ... (${peakCount - 10} more — run with --verbose to see all)`);

        // Pattern summary from residuals
        if (residualPeaks && residualPeaks.length > 0) {
          projection.log('');
          projection.log(`  Secondary signal (residual anomalies): ${residualPeaks.length} window(s)`);
          projection.log('  These may indicate secondary patterns or measurement noise.');
        }
      }

      projection.log('');
      projection.log('  Note: drift windows map to time slices in the log, not individual case IDs.');
      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm conformance -i <log>  check fitness during the anomalous periods`);
      projection.log(`    wpm temporal -i <log>     locate time windows with the highest wait times`);
      projection.log(`    wpm drift-watch -i <log>  monitor drift continuously as new cases arrive`);
      projection.log('');
      break;
    }

    case 'regress': {
      const r2 = Number(result.rSquared ?? 0);
      const rmse = Number(result.rmse ?? 0);
      const mae = Number(result.mae ?? 0);

      projection.log('');
      projection.log('  ML Regression — Remaining Time Prediction');
      projection.log('  ==========================================');
      projection.log(`  Method: ${result.method}`);
      projection.log('');
      projection.log(`  R²:      ${r2.toFixed(4)}  ${bar(Math.max(0, r2))}  ${r2 >= 0.6 ? '[good fit]' : '[weak fit]'}`);
      projection.log(`  RMSE:    ${rmse.toFixed(4)}`);
      projection.log(`  MAE:     ${mae.toFixed(4)}`);
      projection.log(`  Slope:   ${Number(result.slope ?? 0).toFixed(4)}`);
      projection.log(`  Intercept: ${Number(result.intercept ?? 0).toFixed(4)}`);
      projection.log('');
      if (r2 >= 0.6) {
        projection.log(`  ✓ Feature explains ${pctStr(r2)} of cycle-time variance — reliable predictor.`);
      } else {
        projection.log(`  ⚠ Feature explains only ${pctStr(r2)} of variance — consider more features or non-linear method.`);
      }
      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm temporal -i <log>                    verify highest-RMSE traces against wait-time distributions`);
      projection.log(`    wpm predict remaining-time -i <log>      apply Weibull regression for per-case estimates`);
      projection.log('');
      break;
    }

    case 'pca': {
      const explainedVariance = result.explainedVariance as number[] | undefined;
      const transformedData = result.transformedData as number[][] | undefined;
      const originalFeatureCount = result.originalFeatureCount as number | undefined;
      const nComponents = result.nComponents as number | undefined;
      const totalVariance = explainedVariance
        ? explainedVariance.reduce((s, v) => s + v, 0)
        : undefined;

      // Feature names — may be attached if extracting from WASM
      const featureNames = result.featureNames as string[] | undefined;

      projection.log('');
      projection.log('  ML PCA — Process Feature Reduction');
      projection.log('  ===================================');
      projection.log(`  Input dimensions:  ${originalFeatureCount ?? '?'} features`);
      projection.log(`  Output dimensions: ${nComponents ?? explainedVariance?.length ?? '?'} components`);
      if (totalVariance !== undefined) {
        projection.log(
          `  Variance retained: ${pctStr(totalVariance)}  ${totalVariance >= 0.7 ? '[good reduction]' : '[consider more components]'}`
        );
      }

      if (explainedVariance && explainedVariance.length > 0) {
        projection.log('');
        projection.log('  Component  Variance   Cumulative  Bar');
        projection.log('  ─────────  ─────────  ──────────  ────────────────────────');
        let cumulative = 0;
        for (let i = 0; i < explainedVariance.length; i++) {
          const v = explainedVariance[i];
          cumulative += v;
          const pcBar = bar(v, 24);
          const pcLabel = `PC${i + 1}`.padEnd(9);
          const varStr = pctStr(v).padStart(8);
          const cumStr = pctStr(cumulative).padStart(9);
          // Show top feature for this component if available
          const topFeature = featureNames ? ` (${featureNames[i] ?? 'f' + i})` : '';
          projection.log(`  ${pcLabel}  ${varStr}  ${cumStr}  ${pcBar}${topFeature}`);
        }
      }

      projection.log('');
      projection.log(`  Transformed data: ${transformedData?.length ?? 0} rows`);
      projection.log('');
      projection.log('  Next steps:');
      projection.log(`    wpm ml cluster -i <log>   run clustering on the PCA-reduced feature space`);
      projection.log(`    wpm ml classify -i <log>  use PCA components as input features for classification`);
      projection.log('');
      break;
    }
  }
}

// ─── --compare-tasks formatter ────────────────────────────────────────────────

function formatCompareTasksOutput(
  projection: import('../output.js').ConsoleProjection,
  taskResults: Record<string, unknown>
): void {
  projection.log('');
  projection.log('  ML Multi-Task Analysis Summary');
  projection.log('  ================================');
  projection.log('  Task        Score            Insight');
  projection.log('  ──────────  ───────────────  ────────────────────────────────────────────');

  // classify
  const classResult = taskResults['classify'] as Record<string, unknown> | undefined;
  if (classResult && !classResult._error) {
    const qs = classResult._qualitySummary as MlQualitySummary | undefined;
    const score = qs ? `${qs.primaryLabel}=${qs.primaryValue}` : 'n/a';
    projection.log(`  classify    ${score.padEnd(15)}  ${qs?.interpretation ?? 'classification complete'}`);
  } else {
    const err = (classResult?._error as string) ?? 'skipped';
    projection.log(`  classify    n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // cluster
  const clusterResult = taskResults['cluster'] as Record<string, unknown> | undefined;
  if (clusterResult && !clusterResult._error) {
    const qs = clusterResult._qualitySummary as MlQualitySummary | undefined;
    const k = clusterResult.clusterCount as number | undefined;
    const score = qs ? `${qs.primaryLabel}=${qs.primaryValue}` : 'n/a';
    const insight = k !== undefined ? `${k} cluster(s) — ${qs?.interpretation ?? ''}` : (qs?.interpretation ?? 'clustering complete');
    projection.log(`  cluster     ${score.padEnd(15)}  ${insight.slice(0, 60)}`);
  } else {
    const err = (clusterResult?._error as string) ?? 'skipped';
    projection.log(`  cluster     n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // forecast
  const forecastResult = taskResults['forecast'] as Record<string, unknown> | undefined;
  if (forecastResult && !forecastResult._error) {
    const qs = forecastResult._qualitySummary as MlQualitySummary | undefined;
    const trend = forecastResult.trend as { direction?: string; strength?: number } | undefined;
    const score = qs ? `${qs.primaryLabel}=${qs.primaryValue}` : 'n/a';
    const dir = trend?.direction ?? 'unknown';
    projection.log(`  forecast    ${score.padEnd(15)}  ${dir} trend detected`);
  } else {
    const err = (forecastResult?._error as string) ?? 'skipped';
    projection.log(`  forecast    n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // anomaly
  const anomalyResult = taskResults['anomaly'] as Record<string, unknown> | undefined;
  if (anomalyResult && !anomalyResult._error) {
    const qs = anomalyResult._qualitySummary as MlQualitySummary | undefined;
    const peakCount = (anomalyResult.peakIndices as number[] | undefined)?.length ?? 0;
    const totalWindows = (anomalyResult.originalLength as number) ?? 0;
    const rate = totalWindows > 0 ? pctStr(peakCount / totalWindows) : 'n/a';
    const score = qs ? `rate=${rate}` : 'n/a';
    projection.log(`  anomaly     ${score.padEnd(15)}  ${peakCount} outlier windows found in ${totalWindows} total`);
  } else {
    const err = (anomalyResult?._error as string) ?? 'skipped';
    projection.log(`  anomaly     n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // regress
  const regressResult = taskResults['regress'] as Record<string, unknown> | undefined;
  if (regressResult && !regressResult._error) {
    const r2 = regressResult.rSquared as number | undefined;
    const score = r2 !== undefined ? `R²=${r2.toFixed(3)}` : 'n/a';
    const insight = r2 !== undefined
      ? `Duration ${r2 >= 0.6 ? 'moderately' : 'weakly'} predictable from features`
      : 'regression complete';
    projection.log(`  regress     ${score.padEnd(15)}  ${insight}`);
  } else {
    const err = (regressResult?._error as string) ?? 'skipped';
    projection.log(`  regress     n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // pca
  const pcaResult = taskResults['pca'] as Record<string, unknown> | undefined;
  if (pcaResult && !pcaResult._error) {
    const qs = pcaResult._qualitySummary as MlQualitySummary | undefined;
    const nComp = pcaResult.nComponents as number | undefined;
    const origFeat = pcaResult.originalFeatureCount as number | undefined;
    const totalVar = (pcaResult.explainedVariance as number[] | undefined)?.reduce((s, v) => s + v, 0);
    const score = totalVar !== undefined ? `var=${pctStr(totalVar)}` : 'n/a';
    const insight = nComp !== undefined && origFeat !== undefined
      ? `${origFeat} features → ${nComp} components (${totalVar !== undefined ? pctStr(totalVar) : '?'} variance)`
      : (qs?.interpretation ?? 'pca complete');
    projection.log(`  pca         ${score.padEnd(15)}  ${insight}`);
  } else {
    const err = (pcaResult?._error as string) ?? 'skipped';
    projection.log(`  pca         n/a              ⚠ ${err.slice(0, 60)}`);
  }

  // ── Recommendation block ──────────────────────────────────────────────────
  projection.log('');
  projection.log('  Recommendations:');

  // Best classifier signal
  const classQs = (classResult?._qualitySummary as MlQualitySummary | undefined);
  if (classQs?.primaryGood) {
    projection.log(`    • Use classify for case outcome prediction (${classQs.primaryValue} confidence)`);
  }

  // Best cluster count
  const clusterK = clusterResult?.clusterCount as number | undefined;
  if (clusterK !== undefined && clusterK >= 2) {
    projection.log(`    • Use clustering for process improvement targeting (${clusterK} natural groups)`);
  }

  // Anomaly warning
  const anomPeakCount = (anomalyResult?.peakIndices as number[] | undefined)?.length ?? 0;
  if (anomPeakCount > 0) {
    projection.log(`    • Investigate ${anomPeakCount} anomalous drift window(s) — may indicate rework or resource issues`);
  }

  // PCA compression
  if (pcaResult && !pcaResult._error) {
    const totalVar2 = (pcaResult.explainedVariance as number[] | undefined)?.reduce((s, v) => s + v, 0);
    if (totalVar2 !== undefined && totalVar2 >= 0.7) {
      projection.log(`    • PCA compression is effective — use reduced features for faster ML pipelines`);
    }
  }

  projection.log('');
}
