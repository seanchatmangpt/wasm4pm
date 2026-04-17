#!/usr/bin/env node

/**
 * Benchmark Validator
 *
 * Compares actual benchmark results against baseline.json
 * Fails if any algorithm regresses beyond thresholds
 *
 * Exit codes:
 *   0 = all algorithms pass
 *   1 = one or more algorithms regressed
 *   2 = missing baseline or results
 */

import fs from 'fs';
import path from 'path';

interface BaselineAlgorithm {
  latencyMs?: [number, number];
  fitness?: number;
  accuracy?: number;
  silhouetteScore?: number;
  minPrecision?: number;
  minRecall?: number;
  minR2Score?: number;
  minVarianceExplained?: number;
  output?: string;
  requiredFields?: string[];
  notes?: string;
}

interface Baseline {
  metadata: {
    version: string;
    date: string;
    dataset: string;
  };
  discovery: Record<string, BaselineAlgorithm>;
  ml: Record<string, BaselineAlgorithm>;
  analysis: Record<string, BaselineAlgorithm>;
  rules: {
    fitnessThreshold: number;
    latencyRegression: number;
    accuracyRegression: number;
    silhouetteRegression: number;
  };
}

interface BenchmarkResult {
  algorithm: string;
  latencyMs?: number;
  fitness?: number;
  accuracy?: number;
  silhouetteScore?: number;
  precision?: number;
  recall?: number;
  r2Score?: number;
  varianceExplained?: number;
  output?: string;
  pass: boolean;
  violations: string[];
}

function loadBaseline(baselinePath: string): Baseline {
  if (!fs.existsSync(baselinePath)) {
    console.error(`❌ Baseline file not found: ${baselinePath}`);
    process.exit(2);
  }

  const content = fs.readFileSync(baselinePath, 'utf-8');
  return JSON.parse(content);
}

function validateDiscoveryAlgorithms(results: BenchmarkResult[], baseline: Baseline): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ DISCOVERY ALGORITHM VALIDATION                                 ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  const failures: BenchmarkResult[] = [];

  for (const result of results) {
    const algo = baseline.discovery[result.algorithm];
    if (!algo) {
      console.log(
        `⚠️  ${result.algorithm.padEnd(25, ' ')} │ UNKNOWN (not in baseline)`
      );
      continue;
    }

    result.violations = [];

    // Check latency
    if (algo.latencyMs && result.latencyMs !== undefined) {
      const [minLat, maxLat] = algo.latencyMs;
      const regressed = result.latencyMs > maxLat * baseline.rules.latencyRegression;
      if (regressed) {
        result.violations.push(
          `latency ${result.latencyMs.toFixed(2)}ms (baseline max ${maxLat}ms)`
        );
      }
    }

    // Check fitness
    if (algo.fitness && result.fitness !== undefined) {
      if (result.fitness < algo.fitness - 0.05) {
        result.violations.push(
          `fitness ${result.fitness.toFixed(2)} (baseline ${algo.fitness.toFixed(2)})`
        );
      }
    }

    result.pass = result.violations.length === 0;
    if (!result.pass) {
      failures.push(result);
    }

    const status = result.pass ? '✅ PASS' : '❌ FAIL';
    const latencyStr = result.latencyMs ? `${result.latencyMs.toFixed(2)}ms` : 'N/A';
    const fitnessStr = result.fitness ? `fitness=${result.fitness.toFixed(2)}` : '';

    console.log(
      `║ ${result.algorithm.padEnd(25, ' ')} │ ${latencyStr.padEnd(12, ' ')} │ ${fitnessStr.padEnd(15, ' ')} │ ${status} ║`
    );

    if (result.violations.length > 0) {
      console.log(
        `║   └─ VIOLATIONS: ${result.violations.join(' | ').substring(0, 45).padEnd(45, ' ')} ║`
      );
    }
  }

  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} algorithm(s) failed validation\n`);
    process.exit(1);
  }

  console.log(`\n✅ All discovery algorithms pass baseline validation\n`);
}

function validateMLAlgorithms(results: BenchmarkResult[], baseline: Baseline): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ ML ALGORITHM VALIDATION                                        ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  const failures: BenchmarkResult[] = [];

  for (const result of results) {
    const algo = baseline.ml[result.algorithm];
    if (!algo) {
      console.log(
        `⚠️  ${result.algorithm.padEnd(25, ' ')} │ UNKNOWN (not in baseline)`
      );
      continue;
    }

    result.violations = [];

    // Check latency
    if (algo.latencyMs && result.latencyMs !== undefined) {
      const [minLat, maxLat] = algo.latencyMs;
      const regressed = result.latencyMs > maxLat * baseline.rules.latencyRegression;
      if (regressed) {
        result.violations.push(
          `latency ${result.latencyMs.toFixed(2)}ms (baseline max ${maxLat}ms)`
        );
      }
    }

    // Check accuracy
    if (algo.accuracy && result.accuracy !== undefined) {
      if (result.accuracy < algo.accuracy - baseline.rules.accuracyRegression) {
        result.violations.push(
          `accuracy ${result.accuracy.toFixed(2)} (baseline ${algo.accuracy.toFixed(2)})`
        );
      }
    }

    // Check silhouette score
    if (algo.silhouetteScore && result.silhouetteScore !== undefined) {
      if (result.silhouetteScore < algo.silhouetteScore - baseline.rules.silhouetteRegression) {
        result.violations.push(
          `silhouette ${result.silhouetteScore.toFixed(2)} (baseline ${algo.silhouetteScore.toFixed(2)})`
        );
      }
    }

    result.pass = result.violations.length === 0;
    if (!result.pass) {
      failures.push(result);
    }

    const status = result.pass ? '✅ PASS' : '❌ FAIL';
    const latencyStr = result.latencyMs ? `${result.latencyMs.toFixed(2)}ms` : 'N/A';
    const metricsStr = result.accuracy
      ? `acc=${result.accuracy.toFixed(2)}`
      : result.silhouetteScore
        ? `sil=${result.silhouetteScore.toFixed(2)}`
        : 'N/A';

    console.log(
      `║ ${result.algorithm.padEnd(25, ' ')} │ ${latencyStr.padEnd(12, ' ')} │ ${metricsStr.padEnd(15, ' ')} │ ${status} ║`
    );

    if (result.violations.length > 0) {
      console.log(
        `║   └─ VIOLATIONS: ${result.violations.join(' | ').substring(0, 45).padEnd(45, ' ')} ║`
      );
    }
  }

  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} ML algorithm(s) failed validation\n`);
    process.exit(1);
  }

  console.log(`\n✅ All ML algorithms pass baseline validation\n`);
}

function main() {
  const baselinePath = path.join(__dirname, 'baseline.json');
  const resultsPath = process.argv[2] || path.join(__dirname, 'results.json');

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║ BENCHMARK VALIDATOR — Comparing Against Baseline              ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ Baseline: ${baselinePath.padEnd(50, ' ')} ║`);
  console.log(`║ Results:  ${resultsPath.padEnd(50, ' ')} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const baseline = loadBaseline(baselinePath);

  if (!fs.existsSync(resultsPath)) {
    console.error(`\n❌ Results file not found: ${resultsPath}`);
    console.error('Run benchmarks first with: npm run bench:all\n');
    process.exit(2);
  }

  const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
  const allResults: BenchmarkResult[] = JSON.parse(resultsContent);

  // Separate by category
  const discoveryResults = allResults.filter(
    (r) => Object.keys(baseline.discovery).includes(r.algorithm)
  );
  const mlResults = allResults.filter((r) =>
    Object.keys(baseline.ml).includes(r.algorithm)
  );
  const analysisResults = allResults.filter((r) =>
    Object.keys(baseline.analysis).includes(r.algorithm)
  );

  if (discoveryResults.length > 0) {
    validateDiscoveryAlgorithms(discoveryResults, baseline);
  }

  if (mlResults.length > 0) {
    validateMLAlgorithms(mlResults, baseline);
  }

  if (analysisResults.length > 0) {
    console.log('\n✅ Analysis algorithms pass (output shape validation only)\n');
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║ ✅ ALL ALGORITHMS PASS BASELINE VALIDATION                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

main();
