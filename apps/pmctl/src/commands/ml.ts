import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@wasm4pm/engine';
import { savePredictionResult } from './results.js';
import { VALID_ML_TASKS, executeMlTask } from '../ml-runner.js';
import type { MlTask } from '../ml-runner.js';

export const ml = defineCommand({
  meta: {
    name: 'ml',
    description: 'Run ML-powered process mining analysis using micro-ml',
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
      description: 'Number of clusters or neighbors (default: 3)',
    },
    'target-key': {
      type: 'string',
      description: 'Target variable key (default: outcome)',
    },
    'forecast-periods': {
      type: 'string',
      description: 'Number of future periods to forecast (default: 5)',
    },
    'n-components': {
      type: 'string',
      description: 'PCA components (default: 2)',
    },
    eps: {
      type: 'string',
      description: 'DBSCAN epsilon (default: 1.0)',
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const task = ctx.args.task as string;
      if (!VALID_ML_TASKS.includes(task as MlTask)) {
        formatter.error(`Unknown ML task: "${task}". Valid: ${VALID_ML_TASKS.join(', ')}`);
        process.exit(EXIT_CODES.source_error);
      }

      const inputPath = ctx.args.input as string;
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Running ML task: ${task}`);
      }

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      try {
        const result = await executeMlTask(wasm, task as MlTask, logHandle, activityKey, {
          method: ctx.args.method as string,
          k: ctx.args.k as string,
          targetKey: ctx.args['target-key'] as string,
          forecastPeriods: ctx.args['forecast-periods'] as string,
          nComponents: ctx.args['n-components'] as string,
          eps: ctx.args.eps as string,
        });

        if (formatter instanceof JSONFormatter) {
          formatter.success(`ML complete: ${task}`, { task, input: inputPath, ...result });
        } else {
          formatter.success(`ML complete: ${task}`);
          formatMlHumanOutput(formatter, task as MlTask, result);
        }

        if (!ctx.args['no-save']) {
          const savedPath = await savePredictionResult(
            `ml-${task}`,
            inputPath,
            activityKey,
            result
          );
          if (savedPath && formatter instanceof HumanFormatter) {
            formatter.debug(`Result saved: ${savedPath}`);
          }
        }
      } finally {
        try {
          wasm.delete_object(logHandle);
        } catch {
          /* best-effort */
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      formatter.error(`ML failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function formatMlHumanOutput(
  formatter: HumanFormatter,
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
        formatter.info('No predictions available.');
        return;
      }
      formatter.log('');
      formatter.log('  Case ID              Predicted         Confidence');
      formatter.log('  ───────────────────  ────────────────  ─────────');
      for (const p of predictions.slice(0, 10)) {
        const id = (p.caseId ?? '?').padEnd(19);
        const pred = (p.predicted ?? '?').padEnd(16);
        const conf = (p.confidence * 100).toFixed(1).padStart(8) + '%';
        formatter.log(`  ${id}  ${pred}  ${conf}`);
      }
      if (predictions.length > 10) formatter.log(`  ... (${predictions.length - 10} more)`);
      const info = result.modelInfo as Record<string, unknown>;
      formatter.log(
        `  Method: ${result.method}, Traces: ${info?.traceCount}, Features: ${info?.featureCount}`
      );
      formatter.log('');
      break;
    }

    case 'cluster': {
      const assignments = result.assignments as Array<{ caseId: string; cluster: number }>;
      if (!assignments || assignments.length === 0) {
        formatter.info('No cluster assignments.');
        return;
      }
      formatter.log('');
      formatter.log('  Case ID              Cluster');
      formatter.log('  ───────────────────  ───────');
      for (const a of assignments.slice(0, 10)) {
        const id = (a.caseId ?? '?').padEnd(19);
        formatter.log(`  ${id}  ${String(a.cluster).padStart(6)}`);
      }
      if (assignments.length > 10) formatter.log(`  ... (${assignments.length - 10} more)`);
      const info = result.modelInfo as Record<string, unknown>;
      formatter.log(
        `  Method: ${result.method}, Clusters: ${result.clusterCount}, Noise: ${result.noiseCount}`
      );
      if (info?.inertia !== undefined) formatter.log(`  Inertia: ${info.inertia}`);
      formatter.log('');
      break;
    }

    case 'forecast': {
      const trend = result.trend as
        | { direction?: string; slope?: number; strength?: number }
        | undefined;
      const forecast = result.forecast as number[] | undefined;
      const seasonality = result.seasonality as { period?: number; strength?: number } | undefined;
      formatter.log('');
      formatter.log(
        `  Trend: ${trend?.direction} (slope: ${(trend?.slope ?? 0).toFixed(4)}, strength: ${(trend?.strength ?? 0).toFixed(2)})`
      );
      formatter.log(`  Window count: ${result.windowCount}`);
      if (forecast) {
        formatter.log(
          `  Forecast (${forecast.length} periods): ${forecast.map((v: number) => v.toFixed(1)).join(', ')}`
        );
      }
      if (seasonality) {
        formatter.log(
          `  Seasonality: period=${seasonality.period}, strength=${(seasonality.strength ?? 0).toFixed(2)}`
        );
      }
      formatter.log('');
      break;
    }

    case 'anomaly': {
      const peakIndices = result.peakIndices as number[] | undefined;
      const peakValues = result.peakValues as number[] | undefined;
      const residualPeaks = result.residualPeaks as number[] | undefined;
      formatter.log('');
      formatter.log(`  Peaks detected: ${peakIndices?.length ?? 0}`);
      if (peakIndices && peakValues) {
        for (let i = 0; i < Math.min(peakIndices.length, 10); i++) {
          formatter.log(`    Window ${peakIndices[i]}: drift=${peakValues[i]?.toFixed(4)}`);
        }
      }
      if (residualPeaks && residualPeaks.length > 0) {
        formatter.log(`  Residual anomalies: ${residualPeaks.length}`);
      }
      formatter.log(`  Original length: ${result.originalLength}`);
      formatter.log('');
      break;
    }

    case 'regress': {
      formatter.log('');
      formatter.log(`  Method: ${result.method}`);
      formatter.log(`  R-squared: ${Number(result.rSquared ?? 0).toFixed(4)}`);
      formatter.log(
        `  Slope: ${Number(result.slope ?? 0).toFixed(4)}, Intercept: ${Number(result.intercept ?? 0).toFixed(4)}`
      );
      formatter.log(
        `  RMSE: ${Number(result.rmse ?? 0).toFixed(2)}, MAE: ${Number(result.mae ?? 0).toFixed(2)}`
      );
      formatter.log('');
      break;
    }

    case 'pca': {
      const explainedVariance = result.explainedVariance as number[] | undefined;
      const transformedData = result.transformedData as number[][] | undefined;
      formatter.log('');
      formatter.log(
        `  Components: ${result.nComponents} (from ${result.originalFeatureCount} features)`
      );
      if (explainedVariance) {
        formatter.log(
          `  Explained variance: ${explainedVariance.map((v: number) => v.toFixed(4)).join(', ')}`
        );
      }
      formatter.log(`  Transformed data: ${transformedData?.length ?? 0} rows`);
      formatter.log('');
      break;
    }
  }
}
