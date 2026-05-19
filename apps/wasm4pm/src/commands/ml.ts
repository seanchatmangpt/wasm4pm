import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { savePredictionResult } from './results.js';
import { VALID_ML_TASKS, executeMlTask } from '../ml-runner.js';
import type { MlTask } from '../ml-runner.js';
import { withSpan } from './_otel.js';

import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

export const ml = defineCommand({
  meta: {
    name: 'ml',
    description: 'Run ML-powered process mining analysis',
  },
  args: {
    task: {
      type: 'positional',
      description: 'ML task: classify, cluster, forecast, anomaly, regress, pca',
      required: true,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file',
      required: true,
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
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
    'no-save': { type: 'boolean' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    return withSpan(
      'ml',
      {
        task: String(ctx.args.task ?? ''),
        input: String(ctx.args.input ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        method: String(ctx.args.method ?? ''),
        format,
      },
      async () => {
        try {
          const task = ctx.args.task as string;
          if (!VALID_ML_TASKS.includes(task as MlTask)) {
            const suggestions = VALID_ML_TASKS.filter(
              t => t.toLowerCase().includes(task.toLowerCase()) || task.toLowerCase().includes(t.toLowerCase())
            );
            const didYouMean = suggestions.length > 0
              ? `\n\n  Did you mean: wpm ml ${suggestions[0]} -i <log.xes>`
              : '';
            const errorMessage =
              `Unknown ML task: "${task}".${didYouMean}\n\n` +
              `Valid tasks:\n  ${VALID_ML_TASKS.join(', ')}`;
            const result = makeErrorResult(
              'ml',
              errorMessage,
              EXIT_CODES.source_error,
              'INVALID_TASK'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const inputPath = ctx.args.input as string;
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          // Validate numeric parameters (k, eps, forecast-periods, n-components)
          const k = ctx.args.k as number | string | undefined;
          if (k !== undefined) {
            const kNum = typeof k === 'number' ? k : parseInt(String(k), 10);
            if (Number.isNaN(kNum) || kNum <= 0) {
              const result = makeErrorResult(
                'ml',
                new Error('Invalid --k value: must be a positive number (given: ' + k + ')'),
                EXIT_CODES.config_error,
                'INVALID_K'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          const eps = ctx.args.eps as number | string | undefined;
          if (eps !== undefined) {
            const epsNum = typeof eps === 'number' ? eps : parseFloat(String(eps));
            if (Number.isNaN(epsNum) || epsNum <= 0) {
              const result = makeErrorResult(
                'ml',
                new Error('Invalid --eps value: must be a positive number (given: ' + eps + ')'),
                EXIT_CODES.config_error,
                'INVALID_EPS'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          const forecastPeriods = ctx.args['forecast-periods'] as number | string | undefined;
          if (forecastPeriods !== undefined) {
            const fpNum = typeof forecastPeriods === 'number' ? forecastPeriods : parseInt(String(forecastPeriods), 10);
            if (Number.isNaN(fpNum) || fpNum <= 0) {
              const result = makeErrorResult(
                'ml',
                new Error('Invalid --forecast-periods value: must be a positive number (given: ' + forecastPeriods + ')'),
                EXIT_CODES.config_error,
                'INVALID_FORECAST_PERIODS'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          const nComponents = ctx.args['n-components'] as number | string | undefined;
          if (nComponents !== undefined) {
            const ncNum = typeof nComponents === 'number' ? nComponents : parseInt(String(nComponents), 10);
            if (Number.isNaN(ncNum) || ncNum <= 0) {
              const result = makeErrorResult(
                'ml',
                new Error('Invalid --n-components value: must be a positive number (given: ' + nComponents + ')'),
                EXIT_CODES.config_error,
                'INVALID_N_COMPONENTS'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          const tune = Boolean(ctx.args.tune);
          const cvFolds = ctx.args['cv-folds']
            ? parseInt(String(ctx.args['cv-folds']), 10)
            : 3;

          if (tune && Number.isNaN(cvFolds) || cvFolds <= 0) {
            const result = makeErrorResult(
              'ml',
              new Error('Invalid --cv-folds value: must be a positive number (given: ' + ctx.args['cv-folds'] + ')'),
              EXIT_CODES.config_error,
              'INVALID_CV_FOLDS'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          await withLogSession(
            { inputPath, activityKey, commandName: 'ml', emitOptions: { format, verbose, quiet } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              const mlResult = await executeMlTask(wasm, task as MlTask, logHandle, activityKey, {
                method: ctx.args.method as string,
                autoSelect: Boolean(ctx.args['auto-select']),
                k: ctx.args.k as string | number,
                targetKey: ctx.args['target-key'] as string,
                forecastPeriods: ctx.args['forecast-periods'] as string | number,
                nComponents: ctx.args['n-components'] as string | number,
                eps: ctx.args.eps as string | number,
                tune,
                cvFolds,
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

              const payload = { task, input: inputPath, ...mlResult };
              const result = makeResult('ml', payload, performance.now() - t0, EXIT_CODES.success);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const data = res.payload as typeof payload;
                projection.success(`ML complete: ${data.task}`);
                formatMlHumanOutput(projection, data.task as MlTask, data);
                if (verbose && (data as Record<string, unknown>)['_savedPath']) {
                  projection.debug(`Result saved: ${(data as Record<string, unknown>)['_savedPath']}`);
                }
              });

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs.readFile(inputPath).catch(() => Buffer.from(inputPath));
                  const sampleSize = Array.isArray((mlResult as Record<string, unknown>).predictions)
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
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          );
        } catch (error) {
          const result = makeErrorResult('ml', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

function formatMlHumanOutput(
  projection: import('../output.js').ConsoleProjection,
  task: MlTask,
  result: Record<string, unknown>
): void {
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
      projection.log('');
      projection.log('  Case ID              Predicted         Confidence');
      projection.log('  ───────────────────  ────────────────  ─────────');
      for (const p of predictions.slice(0, 10)) {
        const id = (p.caseId ?? '?').padEnd(19);
        const pred = (p.predicted ?? '?').padEnd(16);
        const conf = (p.confidence * 100).toFixed(1).padStart(8) + '%';
        projection.log(`  ${id}  ${pred}  ${conf}`);
      }
      if (predictions.length > 10) projection.log(`  ... (${predictions.length - 10} more)`);
      const info = result.modelInfo as Record<string, unknown>;
      projection.log(
        `  Method: ${result.method}, Traces: ${info?.traceCount}, Features: ${info?.featureCount}`
      );
      projection.log('');
      break;
    }

    case 'cluster': {
      const assignments = result.assignments as Array<{ caseId: string; cluster: number }>;
      if (!assignments || assignments.length === 0) {
        projection.info('No cluster assignments.');
        return;
      }
      projection.log('');
      projection.log('  Case ID              Cluster');
      projection.log('  ───────────────────  ───────');
      for (const a of assignments.slice(0, 10)) {
        const id = (a.caseId ?? '?').padEnd(19);
        projection.log(`  ${id}  ${String(a.cluster).padStart(6)}`);
      }
      if (assignments.length > 10) projection.log(`  ... (${assignments.length - 10} more)`);
      const info = result.modelInfo as Record<string, unknown>;
      projection.log(
        `  Method: ${result.method}, Clusters: ${result.clusterCount}, Noise: ${result.noiseCount}`
      );
      if (info?.inertia !== undefined) projection.log(`  Inertia: ${info.inertia}`);
      projection.log('');
      break;
    }

    case 'forecast': {
      const trend = result.trend as
        | { direction?: string; slope?: number; strength?: number }
        | undefined;
      const forecast = result.forecast as number[] | undefined;
      const seasonality = result.seasonality as { period?: number; strength?: number } | undefined;
      projection.log('');
      projection.log(
        `  Trend: ${trend?.direction} (slope: ${(trend?.slope ?? 0).toFixed(4)}, strength: ${(trend?.strength ?? 0).toFixed(2)})`
      );
      projection.log(`  Window count: ${result.windowCount}`);
      if (forecast) {
        projection.log(
          `  Forecast (${forecast.length} periods): ${forecast.map((v: number) => v.toFixed(1)).join(', ')}`
        );
      }
      if (seasonality) {
        projection.log(
          `  Seasonality: period=${seasonality.period}, strength=${(seasonality.strength ?? 0).toFixed(2)}`
        );
      }
      projection.log('');
      break;
    }

    case 'anomaly': {
      const peakIndices = result.peakIndices as number[] | undefined;
      const peakValues = result.peakValues as number[] | undefined;
      const residualPeaks = result.residualPeaks as number[] | undefined;
      projection.log('');
      projection.log(`  Peaks detected: ${peakIndices?.length ?? 0}`);
      if (peakIndices && peakValues) {
        for (let i = 0; i < Math.min(peakIndices.length, 10); i++) {
          projection.log(`    Window ${peakIndices[i]}: drift=${peakValues[i]?.toFixed(4)}`);
        }
      }
      if (residualPeaks && residualPeaks.length > 0) {
        projection.log(`  Residual anomalies: ${residualPeaks.length}`);
      }
      projection.log(`  Original length: ${result.originalLength}`);
      projection.log('');
      break;
    }

    case 'regress': {
      projection.log('');
      projection.log(`  Method: ${result.method}`);
      projection.log(`  R-squared: ${Number(result.rSquared ?? 0).toFixed(4)}`);
      projection.log(
        `  Slope: ${Number(result.slope ?? 0).toFixed(4)}, Intercept: ${Number(result.intercept ?? 0).toFixed(4)}`
      );
      projection.log(
        `  RMSE: ${Number(result.rmse ?? 0).toFixed(2)}, MAE: ${Number(result.mae ?? 0).toFixed(2)}`
      );
      projection.log('');
      break;
    }

    case 'pca': {
      const explainedVariance = result.explainedVariance as number[] | undefined;
      const transformedData = result.transformedData as number[][] | undefined;
      projection.log('');
      projection.log(
        `  Components: ${result.nComponents} (from ${result.originalFeatureCount} features)`
      );
      if (explainedVariance) {
        projection.log(
          `  Explained variance: ${explainedVariance.map((v: number) => v.toFixed(4)).join(', ')}`
        );
      }
      projection.log(`  Transformed data: ${transformedData?.length ?? 0} rows`);
      projection.log('');
      break;
    }
  }
}
