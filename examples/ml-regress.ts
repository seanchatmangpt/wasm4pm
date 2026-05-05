/**
 * Example — Regression analysis (remaining time estimation)
 *
 * Demonstrates:
 *   1. Building feature matrix from event log
 *   2. Training regression models (linear, polynomial, exponential)
 *   3. Comparing prediction accuracy (R², MAE, RMSE)
 *   4. Using model for case-level predictions
 *
 * Run:
 *   tsx examples/ml-regress.ts ./sample.xes
 *   tsx examples/ml-regress.ts ./sample.xes polynomial
 *
 * Docs:
 *   docs/ml-algorithms.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from '@wasm4pm/kernel';
import {
  buildFeatureMatrix,
  regressRemainingTime,
  type RegressionResult,
} from '@wasm4pm/ml';

async function main(logPath: string, method: string = 'linear'): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();

  // 1. Load the log
  const handle = await registry.run('load_eventlog_from_xes', null, { xes });

  // 2. Build feature matrix
  const matrix = await buildFeatureMatrix(handle, {
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  console.log(`Feature matrix: ${matrix.data.length} traces × ${matrix.featureNames.length} features`);
  console.log(`Target: remaining time (seconds)`);

  // 3. Run regression
  const methodKey = method.includes('poly') ? 'polynomial_regression' : method.includes('exp') ? 'exponential_regression' : 'linear_regression';
  const result: RegressionResult = await regressRemainingTime(matrix, {
    method: methodKey,
    degree: method.includes('poly') ? 2 : undefined,
  });

  console.log(`\nRegression Results (${result.method})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  R² Score     : ${result.rSquared.toFixed(3)}`);
  console.log(`  MAE (sec)    : ${result.mae.toFixed(1)}`);
  console.log(`  RMSE (sec)   : ${result.rmse.toFixed(1)}`);

  // Model-specific parameters
  if (result.method === 'linear_regression') {
    console.log(`  Slope        : ${result.slope?.toFixed(4)}`);
    console.log(`  Intercept    : ${result.intercept?.toFixed(1)}`);
  } else if (result.method === 'polynomial_regression') {
    console.log(`  Degree       : ${result.degree}`);
    console.log(`  Coefficients : ${result.coefficients?.map(c => c.toFixed(4)).join(', ')}`);
  } else if (result.method === 'exponential_regression') {
    console.log(`  Growth rate  : ${result.growthRate?.toFixed(4)}`);
    console.log(`  Doubling time: ${result.doublingTime?.toFixed(1)} seconds`);
  }

  // 4. Accuracy interpretation
  console.log(`\nAccuracy Interpretation:`);
  if (result.rSquared > 0.7) {
    console.log(`  ✓ Strong model: ${(result.rSquared * 100).toFixed(0)}% of variance explained`);
  } else if (result.rSquared > 0.3) {
    console.log(`  ~ Moderate model: ${(result.rSquared * 100).toFixed(0)}% of variance explained`);
  } else {
    console.log(`  ✗ Weak model: Only ${(result.rSquared * 100).toFixed(0)}% variance explained`);
    console.log(`    (Process duration depends on case-specific factors not in features)`);
  }

  const meanTarget = matrix.targets.reduce((a, b) => a + b, 0) / matrix.targets.length;
  const mapePercent = (result.mae / meanTarget) * 100;
  console.log(`  MAE is ${mapePercent.toFixed(1)}% of mean duration (${meanTarget.toFixed(0)}s)`);

  // 5. Prediction samples
  console.log(`\nSample Predictions (first 10 cases):`);
  console.log(`  Case ID              Actual(s)  Predicted(s)  Error(s)   Accuracy`);
  console.log(`  ────────────────────────────────────────────────────────────────`);

  const samples = result.predictions.slice(0, 10);
  for (const pred of samples) {
    const error = Math.abs(pred.actual - pred.predicted);
    const accuracy = Math.max(0, 1 - error / pred.actual);
    console.log(
      `  ${pred.caseId.padEnd(20)} ${String(pred.actual).padStart(9)} ${String(pred.predicted.toFixed(0)).padStart(11)} ${String(error.toFixed(0)).padStart(9)} ${(accuracy * 100).toFixed(0).padStart(3)}%`
    );
  }

  // 6. Error distribution
  const errors = result.predictions.map(p => Math.abs(p.actual - p.predicted));
  const p50 = errors.sort((a, b) => a - b)[Math.floor(errors.length * 0.5)];
  const p95 = errors[Math.floor(errors.length * 0.95)];
  console.log(`\nError Distribution:`);
  console.log(`  Median error (p50): ${p50.toFixed(0)}s`);
  console.log(`  95th percentile    : ${p95.toFixed(0)}s`);
}

const logPath = process.argv[2] ?? './sample.xes';
const method = process.argv[3] ?? 'linear';
main(logPath, method).catch(err => {
  console.error('Regression failed:', err);
  process.exit(1);
});
