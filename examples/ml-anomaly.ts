/**
 * Example — Anomaly detection with @wasm4pm/ml
 *
 * Demonstrates:
 *   1. Building feature matrix from event log
 *   2. Running anomaly detection (EMA-based)
 *   3. Identifying and inspecting anomalous cases
 *   4. Sensitivity tuning
 *
 * Run:
 *   tsx examples/ml-anomaly.ts ./sample.xes
 *   tsx examples/ml-anomaly.ts ./sample.xes 0.8  # high sensitivity
 *
 * Docs:
 *   docs/ml-algorithms.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from 'wasm4pm';
import {
  buildFeatureMatrix,
  detectEnhancedAnomalies,
  type EnhancedAnomalyResult,
} from '@wasm4pm/ml';

async function main(logPath: string, sensitivity: string = '0.5'): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();

  // 1. Load the log
  const handle = await registry.run('load_eventlog_from_xes', null, { xes });

  // 2. Build feature matrix
  const matrix = await buildFeatureMatrix(handle, {
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  console.log(`Feature matrix built: ${matrix.data.length} traces × ${matrix.featureNames.length} features`);

  // 3. Run anomaly detection
  // Sensitivity: 0.0 (lenient) to 1.0 (strict)
  const sens = Math.max(0, Math.min(1, parseFloat(sensitivity)));
  const anomalyResult: EnhancedAnomalyResult = await detectEnhancedAnomalies(
    matrix.data,
    {
      // Sensitivity controls EMA alpha and peak detection thresholds
      method: 'ema_peaks', // default
      sensitivity: sens,
    }
  );

  console.log(`\nAnomaly Detection (sensitivity=${sens.toFixed(1)})`);
  console.log(`  Anomaly windows: ${anomalyResult.peakIndices.length}`);
  console.log(`  Residual anomalies: ${anomalyResult.residualPeaks?.length ?? 0}`);

  // 4. Show top anomalies
  if (anomalyResult.peakIndices.length > 0) {
    console.log(`\nTop anomalies (by peak value):`);
    const peaks = anomalyResult.peakIndices
      .map((idx, rank) => ({
        index: idx,
        value: anomalyResult.peakValues[rank],
        caseId: matrix.caseIds[idx],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    peaks.forEach((peak, rank) => {
      console.log(
        `  ${rank + 1}. Case ${peak.caseId.padEnd(20)} window ${String(peak.index).padStart(3)} (anomaly score=${peak.value.toFixed(2)})`
      );
    });
  }

  // 5. Smoothed series visualization (first 20 windows)
  if (anomalyResult.smoothedSeries.length > 0) {
    console.log(`\nSmoothed series (first 20 windows):`);
    const maxVal = Math.max(...anomalyResult.smoothedSeries.slice(0, 20));
    for (let i = 0; i < Math.min(20, anomalyResult.smoothedSeries.length); i++) {
      const normalized = anomalyResult.smoothedSeries[i] / maxVal;
      const bars = '█'.repeat(Math.round(normalized * 30));
      console.log(`  [${String(i).padStart(2)}] ${bars} ${anomalyResult.smoothedSeries[i].toFixed(2)}`);
    }
  }

  // 6. Interpretation guide
  console.log(`\nInterpretation guide:`);
  console.log(`  - Sensitivity 0.0 (lenient): Detects only extreme outliers`);
  console.log(`  - Sensitivity 0.5 (balanced): Default; catches clear anomalies`);
  console.log(`  - Sensitivity 1.0 (strict): Detects subtle deviations`);
  console.log(`\n  Typical action:`);
  console.log(`  - Score > 0.8: Investigate case for data quality or process issues`);
  console.log(`  - Score 0.5-0.8: Monitor; may be valid but unusual`);
  console.log(`  - Score < 0.5: Normal behavior`);
}

const logPath = process.argv[2] ?? './sample.xes';
const sensitivity = process.argv[3] ?? '0.5';
main(logPath, sensitivity).catch(err => {
  console.error('Anomaly detection failed:', err);
  process.exit(1);
});
