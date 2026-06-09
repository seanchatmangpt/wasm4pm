/**
 * Example — Dimensionality reduction with PCA
 *
 * Demonstrates:
 *   1. Building feature matrix from event log
 *   2. Running PCA to reduce dimensionality
 *   3. Analyzing explained variance
 *   4. Visualizing principal components
 *
 * Run:
 *   tsx examples/ml-pca.ts ./sample.xes
 *   tsx examples/ml-pca.ts ./sample.xes 3  # reduce to 3 components
 *
 * Docs:
 *   docs/ml-algorithms.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from 'wasm4pm';
import {
  buildFeatureMatrix,
  reduceFeaturesPCA,
  type PCAResult,
} from '@wasm4pm/ml';

async function main(logPath: string, nComponents: string = '3'): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();

  // 1. Load the log
  const handle = await kernel.run('load_eventlog_from_xes', null, { xes });

  // 2. Build feature matrix
  const matrix = await buildFeatureMatrix(handle as any, {
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  console.log(`Original feature space: ${matrix.data.length} traces × ${matrix.featureNames.length} features`);
  console.log(`Feature names: ${matrix.featureNames.slice(0, 5).join(', ')}${matrix.featureNames.length > 5 ? ', ...' : ''}`);

  // 3. Run PCA
  const n = Math.max(1, Math.min(Math.floor(matrix.featureNames.length / 2), parseInt(nComponents, 10)));
  const pcaResult: PCAResult = await reduceFeaturesPCA(matrix.data as any, {
    nComponents: n,
  });

  console.log(`\nPCA Results (${n} components):`);

  // 4. Explained variance analysis
  console.log(`\nExplained Variance Ratio:`);
  const cumulativeVariance: number[] = [];
  let cumsum = 0;
  pcaResult.explainedVariance.forEach((variance, idx) => {
    cumsum += variance;
    cumulativeVariance.push(cumsum);
    const pct = (variance * 100).toFixed(1);
    const cumPct = (cumsum * 100).toFixed(1);
    console.log(
      `  PC${idx + 1}: ${pct.padStart(5)}% (cumulative: ${cumPct.padStart(5)}%)`
    );
  });

  // 5. Loadings (feature contributions to principal components)
  console.log(`\nPrincipal Component Loadings (top features per component):`);
  pcaResult.components.forEach((component, idx) => {
    const loadings = component
      .map((value, featureIdx) => ({
        feature: pcaResult.featureNames[featureIdx],
        loading: Math.abs(value),
        direction: value > 0 ? '+' : '-',
      }))
      .sort((a, b) => b.loading - a.loading)
      .slice(0, 3);

    console.log(`\n  PC${idx + 1}:`);
    loadings.forEach(({ feature, direction, loading }) => {
      const bar = '█'.repeat(Math.round(loading * 20));
      console.log(`    ${direction}${feature.padEnd(20)} ${bar} ${loading.toFixed(3)}`);
    });
  });

  // 6. Data transformation summary
  console.log(`\nTransformed Data Shape:`);
  console.log(`  Original: ${matrix.data.length} × ${matrix.featureNames.length}`);
  console.log(`  Reduced:  ${pcaResult.transformedData.length} × ${n}`);
  const reductionRatio = (1 - n / matrix.featureNames.length) * 100;
  console.log(`  Dimensionality reduced by ${reductionRatio.toFixed(1)}%`);

  // 7. Interpretation guide
  console.log(`\nInterpretation:`);
  console.log(`  - Use first 2-3 PCs if cumulative variance > 70%`);
  console.log(`  - Each PC represents a linear combination of original features`);
  console.log(`  - Loadings show which original features drive each PC`);
  console.log(`  - Reduced data useful for visualization, clustering, downstream ML`);
}

const logPath = process.argv[2] ?? './sample.xes';
const nComponents = process.argv[3] ?? '3';
main(logPath, nComponents).catch(err => {
  console.error('PCA failed:', err);
  process.exit(1);
});
