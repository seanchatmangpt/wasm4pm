import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { savePredictionResult } from './results.js';
import { VALID_ML_TASKS, executeMlTask } from '../ml-runner.js';
import type { MlTask, MlQualitySummary, ClusterProfile } from '../ml-runner.js';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
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
            const result = makeErrorResult(
              'ml',
              `Unknown ML task: "${task}". Valid: ${VALID_ML_TASKS.join(', ')}`,
              EXIT_CODES.source_error,
              'INVALID_TASK'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const inputPath = ctx.args.input as string;
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          await withLogSession(
            { inputPath, activityKey, commandName: 'ml', emitOptions: { format, verbose, quiet } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              const mlResult = await executeMlTask(wasm, task as MlTask, logHandle, activityKey, {
                method: ctx.args.method as string,
                k: ctx.args.k as string,
                targetKey: ctx.args['target-key'] as string,
                forecastPeriods: ctx.args['forecast-periods'] as string,
                nComponents: ctx.args['n-components'] as string,
                eps: ctx.args.eps as string,
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
                  projection.debug(
                    `Result saved: ${(data as Record<string, unknown>)['_savedPath']}`
                  );
                }
              });

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs
                    .readFile(inputPath)
                    .catch(() => Buffer.from(inputPath));
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
          const result = makeErrorResult('ml', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

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

      // Gap 3: Class distribution table — signal check before the raw prediction list
      const classDist = result._classDistribution as
        | Array<{ className: string; count: number; pct: number; meanConf: number }>
        | undefined;
      if (classDist && classDist.length > 0) {
        projection.log('');
        projection.log('  Class distribution (signal check):');
        projection.log('  ────────────────────────────────────────────────────');
        projection.log('  Class                 Count    Share    Mean conf');
        projection.log('  ────────────────────  ───────  ───────  ─────────');
        for (const row of classDist) {
          const cls = (row.className ?? '?').padEnd(20);
          const cnt = String(row.count).padStart(7);
          const share = `${(row.pct * 100).toFixed(1)}%`.padStart(7);
          const conf = `${(row.meanConf * 100).toFixed(1)}%`.padStart(8);
          // Dominance warning: one class takes >80% — model may be predicting trivially
          const warn = row.pct > 0.8 ? ' (dominant)' : '';
          projection.log(`  ${cls}  ${cnt}  ${share}  ${conf}${warn}`);
        }
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
      projection.log('  Next steps:');
      projection.log(
        `    wpm conformance -i <log>  verify whether low-confidence cases deviate from the reference model`
      );
      projection.log(
        `    wpm cluster -i <log>      discover whether the classified groups correspond to natural clusters`
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
      const info = result.modelInfo as Record<string, unknown>;
      const k = result.clusterCount as number;
      const noise = result.noiseCount as number;
      const total = assignments.length;
      const profiles = result._clusterProfiles as ClusterProfile[] | undefined;

      // Build per-cluster size map (used for noise row which has no profile entry)
      const clusterSizes = new Map<number, number>();
      for (const a of assignments) {
        clusterSizes.set(a.cluster, (clusterSizes.get(a.cluster) ?? 0) + 1);
      }

      projection.log('');
      projection.log('  Cluster profiles:');
      projection.log('  ──────────────────────────────────────────────────────────────');
      projection.log('  Cluster   Cases   Share    Process mining characteristics');
      projection.log('  ───────   ─────   ─────    ────────────────────────────────');

      // Render named clusters with narrative
      if (profiles && profiles.length > 0) {
        for (const p of profiles) {
          const label = `Cluster ${p.clusterId}`;
          const share = `${(p.pct * 100).toFixed(1)}%`.padStart(6);
          const bar = '▓'.repeat(Math.round(p.pct * 20)).padEnd(20, '░');
          projection.log(
            `  ${label.padEnd(9)}   ${String(p.caseCount).padStart(5)}   ${share}    ${bar}`
          );
          projection.log(`             ${p.narrative}`);
        }
      } else {
        // Fallback: size-only rows (no feature data available)
        const sortedClusters = [...clusterSizes.entries()]
          .filter(([id]) => id >= 0)
          .sort((a, b) => a[0] - b[0]);
        for (const [clusterId, count] of sortedClusters) {
          const label = `Cluster ${clusterId}`;
          const share = `${((count / total) * 100).toFixed(1)}%`.padStart(6);
          const bar = '▓'.repeat(Math.round((count / total) * 20)).padEnd(20, '░');
          projection.log(
            `  ${label.padEnd(9)}   ${String(count).padStart(5)}   ${share}    ${bar}`
          );
        }
      }

      // Noise row
      if (noise > 0) {
        const noiseShare = `${((noise / total) * 100).toFixed(1)}%`.padStart(6);
        const noiseBar = '▓'.repeat(Math.round((noise / total) * 20)).padEnd(20, '░');
        projection.log(`  noise     ${String(noise).padStart(5)}   ${noiseShare}    ${noiseBar}`);
        projection.log(`             outlier cases — unusual activity sequences`);
      }

      projection.log('');
      if (noise > 0) {
        projection.log(
          `  ${noise} case(s) classified as noise — consider increasing eps or reducing k.`
        );
      }
      if (info?.inertia !== undefined) {
        projection.log(`  Inertia: ${Number(info.inertia).toFixed(2)} (lower = tighter clusters)`);
      }
      projection.log(`  Method: ${result.method}, Clusters: ${k}, Total cases: ${total}`);
      projection.log('');
      projection.log('  Next steps:');
      projection.log(
        `    wpm temporal -i <log>     investigate performance differences between clusters`
      );
      projection.log(
        `    wpm social -i <log>       check if clusters reflect different resource groups`
      );
      projection.log('');
      break;
    }

    case 'forecast': {
      const trend = result.trend as
        | { direction?: string; slope?: number; strength?: number }
        | undefined;
      const forecast = result.forecast as number[] | undefined;
      const seasonality = result.seasonality as { period?: number; strength?: number } | undefined;

      // Compute percent-change summary over the forecast window
      let pctChangeSummary = '';
      if (forecast && forecast.length >= 2) {
        const first = forecast[0];
        const last = forecast[forecast.length - 1];
        if (first !== 0 && Number.isFinite(first) && Number.isFinite(last)) {
          const pct = ((last - first) / Math.abs(first)) * 100;
          const sign = pct >= 0 ? '+' : '';
          pctChangeSummary = ` (${sign}${pct.toFixed(1)}% over ${forecast.length}-period window)`;
        }
      }

      // Derive business implication from trend direction and strength
      const trendDir = (trend?.direction ?? 'unknown').toLowerCase();
      const trendStrength = trend?.strength ?? 0;
      let businessImplication = '';
      if (trendStrength >= 0.5) {
        if (trendDir === 'decreasing' || trendDir === 'downward') {
          businessImplication = `  Implication: throughput is declining${pctChangeSummary} — intervention may be needed.`;
        } else if (trendDir === 'increasing' || trendDir === 'upward') {
          businessImplication = `  Implication: throughput is growing${pctChangeSummary} — monitor for capacity constraints.`;
        } else if (trendDir === 'stable' || trendDir === 'flat') {
          businessImplication = `  Implication: process is stable — no corrective action indicated.`;
        }
      } else {
        businessImplication = `  Implication: trend is weak (strength ${trendStrength.toFixed(2)}) — forecast is indicative only.`;
      }

      projection.log('');
      projection.log(`  Trend: ${trend?.direction ?? 'unknown'}${pctChangeSummary}`);
      projection.log(
        `  Slope: ${(trend?.slope ?? 0).toFixed(4)}, Strength: ${(trend?.strength ?? 0).toFixed(2)} ${(trend?.strength ?? 0) >= 0.5 ? '[reliable]' : '[low confidence — treat as indicative only]'}`
      );
      if (businessImplication) {
        projection.log(businessImplication);
      }
      projection.log(`  Window count: ${result.windowCount ?? 'n/a'}`);
      if (forecast && forecast.length > 0) {
        projection.log(
          `  Forecast values (${forecast.length} periods): ${forecast.map((v: number) => v.toFixed(3)).join(', ')}`
        );
      }
      if (seasonality) {
        projection.log(
          `  Seasonality: period=${seasonality.period}, strength=${(seasonality.strength ?? 0).toFixed(2)}`
        );
      }
      projection.log('');
      projection.log('  Next steps:');
      projection.log(
        `    wpm drift-watch -i <log>  monitor drift in real-time as new cases arrive`
      );
      projection.log(
        `    wpm temporal -i <log>     analyze actual throughput and wait-time distributions`
      );
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

      if (peakCount === 0) {
        projection.log(
          `  No anomalous drift windows detected in ${totalWindows} windows — process appears stable.`
        );
      } else {
        const rate = totalWindows > 0 ? (peakCount / totalWindows) * 100 : 0;
        projection.log(
          `  ${peakCount} anomalous drift window(s) flagged (${rate.toFixed(1)}% of ${totalWindows} windows):`
        );
        projection.log('');
        projection.log('  Window   Drift score   Severity');
        projection.log('  ──────   ───────────   ────────');
        // Rank peaks by drift value descending for the display list
        const ranked: Array<{ idx: number; val: number }> = [];
        if (peakIndices && peakValues) {
          for (let i = 0; i < peakIndices.length; i++) {
            ranked.push({ idx: peakIndices[i], val: peakValues[i] ?? 0 });
          }
          ranked.sort((a, b) => b.val - a.val);
        }
        const maxVal = ranked.length > 0 ? ranked[0].val : 1;
        for (const { idx, val } of ranked.slice(0, 10)) {
          const bar = '▓'.repeat(Math.round((val / maxVal) * 12)).padEnd(12, '░');
          const severity = val > maxVal * 0.8 ? 'HIGH  ' : val > maxVal * 0.5 ? 'MEDIUM' : 'low   ';
          projection.log(
            `  ${String(idx).padStart(6)}   ${val.toFixed(4).padStart(11)}   ${severity}  ${bar}`
          );
        }
        if (peakCount > 10)
          projection.log(`  ... (${peakCount - 10} more — run with --verbose to see all)`);
      }

      if (residualPeaks && residualPeaks.length > 0) {
        projection.log('');
        projection.log(`  Residual anomalies (secondary signal): ${residualPeaks.length}`);
      }

      projection.log('');
      projection.log(
        '  Note: drift windows map to time slices in the log, not individual case IDs.'
      );
      projection.log('  To identify which cases drive the anomalous windows:');
      projection.log('');
      projection.log('  Next steps:');
      projection.log(
        `    wpm conformance -i <log>  check fitness of the anomalous period against your reference model`
      );
      projection.log(
        `    wpm temporal -i <log>     locate the time windows with the highest wait times`
      );
      projection.log(
        `    wpm drift-watch -i <log>  monitor drift continuously as new cases arrive`
      );
      projection.log('');
      break;
    }

    case 'regress': {
      const r2 = Number(result.rSquared ?? 0);
      projection.log('');
      projection.log(`  Method: ${result.method}`);
      projection.log(
        `  R-squared: ${r2.toFixed(4)} ${r2 >= 0.6 ? '[good fit]' : '[weak fit — consider non-linear method or more features]'}`
      );
      projection.log(
        `  Slope: ${Number(result.slope ?? 0).toFixed(4)}, Intercept: ${Number(result.intercept ?? 0).toFixed(4)}`
      );
      projection.log(
        `  RMSE: ${Number(result.rmse ?? 0).toFixed(2)}, MAE: ${Number(result.mae ?? 0).toFixed(2)}`
      );
      projection.log('');
      projection.log('  Next steps:');
      projection.log(
        `    wpm temporal -i <log>     verify the highest-RMSE traces against actual wait-time distributions`
      );
      projection.log(
        `    wpm predict remaining-time -i <log>  apply Weibull regression for per-case remaining-time estimates`
      );
      projection.log('');
      break;
    }

    case 'pca': {
      const explainedVariance = result.explainedVariance as number[] | undefined;
      const transformedData = result.transformedData as number[][] | undefined;
      const totalVariance = explainedVariance
        ? explainedVariance.reduce((s, v) => s + v, 0)
        : undefined;
      projection.log('');
      projection.log(
        `  Components: ${result.nComponents} (from ${result.originalFeatureCount} features)`
      );
      if (explainedVariance && explainedVariance.length > 0) {
        projection.log('  Variance per component:');
        for (let i = 0; i < explainedVariance.length; i++) {
          const v = explainedVariance[i];
          const bar = '▓'.repeat(Math.round(v * 40)).padEnd(40, '░');
          projection.log(`    PC${i + 1}  ${(v * 100).toFixed(1).padStart(5)}%  ${bar}`);
        }
        if (totalVariance !== undefined) {
          projection.log(
            `  Total variance explained: ${(totalVariance * 100).toFixed(1)}% ${totalVariance >= 0.7 ? '[good reduction]' : '[consider more components]'}`
          );
        }
      }
      projection.log(`  Transformed data: ${transformedData?.length ?? 0} rows`);
      projection.log('');
      projection.log('  Next steps:');
      projection.log(
        `    wpm cluster -i <log>      run clustering on the PCA-reduced feature space`
      );
      projection.log(
        `    wpm ml classify -i <log>  use PCA components as input features for classification`
      );
      projection.log('');
      break;
    }
  }
}
