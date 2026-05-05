/**
 * Example — Trace classification with @wasm4pm/ml
 *
 * Demonstrates:
 *   1. Loading an XES log via @wasm4pm/kernel.
 *   2. Building a feature matrix.
 *   3. Running classification with `naive_bayes`.
 *   4. Interpreting predictions and confidence.
 *
 * Run:
 *   tsx examples/ml-classify.ts ./sample.xes
 *
 * Docs:
 *   docs/ml-algorithms.md
 *   docs/tutorials/ml-quickstart.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from '@wasm4pm/kernel';
import {
  buildFeatureMatrix,
  classifyTraces,
  type ClassificationResult,
} from '@wasm4pm/ml';

async function main(logPath: string): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();

  // 1. Load the log via the kernel (returns a string handle).
  const handle = await registry.run('load_eventlog_from_xes', null, { xes });

  // 2. Build the numeric feature matrix.
  //    `targets` are durations; `labels` are outcome activity names.
  const matrix = await buildFeatureMatrix(handle, {
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  console.log(`features built: ${matrix.data.length} traces × ${matrix.featureNames.length} features`);
  console.log(`label classes : ${[...new Set(matrix.labels)].join(', ')}`);

  // 3. Train + classify with naive Bayes (fastest baseline).
  const result: ClassificationResult = await classifyTraces(matrix, {
    method: 'naive_bayes',
    holdoutFraction: 0.2,
  });

  // 4. Print the first 5 predictions.
  console.log(`\nmethod         : ${result.method}`);
  console.log(`predictions    : ${result.predictions.length}`);
  console.log('top-5 predictions:');
  for (const p of result.predictions.slice(0, 5)) {
    const conf = (p.confidence * 100).toFixed(1);
    console.log(`  ${p.caseId.padEnd(20)} → ${p.predicted.padEnd(15)} (${conf}%)`);
  }

  console.log('\nmodelInfo:');
  console.dir(result.modelInfo, { depth: 4 });
}

const logPath = process.argv[2] ?? './sample.xes';
main(logPath).catch((err) => {
  console.error('classification failed:', err);
  process.exit(1);
});
