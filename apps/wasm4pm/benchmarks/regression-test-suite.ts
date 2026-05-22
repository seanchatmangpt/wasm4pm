/**
 * Regression Testing Suite for wasm4pm
 *
 * Monitors performance of core algorithms across versions.
 * Integrates with CI/CD for automated regression detection.
 *
 * Usage:
 *   npx ts-node regression-test-suite.ts --baseline main-latest.json --current results.json
 *
 * Exit codes:
 *   0 = All tests passed, no regressions
 *   1 = Regressions detected, requires justification
 *   2 = Warnings (within tolerance), allowed to proceed
 *   3 = Setup/configuration error
 */

import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  algorithm: string;
  size: number;
  backend: string;
  median_ms: number;
  p95_ms: number;
  p99_ms?: number;
  throughput_ops_per_sec?: number;
}

interface RegressionConfig {
  algorithm: string;
  threshold_pct: number;
  severity: 'critical' | 'high' | 'medium';
}

interface RegressionReport {
  timestamp: string;
  git_hash: string;
  baseline_version: string;
  current_version: string;
  regressions: RegressionFinding[];
  warnings: RegressionFinding[];
  improvements: RegressionFinding[];
  exit_code: 0 | 1 | 2 | 3;
  summary: string;
}

interface RegressionFinding {
  algorithm: string;
  size: number;
  baseline_ms: number;
  current_ms: number;
  delta_pct: number;
  threshold_pct: number;
  severity: string;
}

const REGRESSION_CONFIG: RegressionConfig[] = [
  // Tier 1: Fast algorithms (5% threshold)
  { algorithm: 'discovery_dfg', threshold_pct: 5, severity: 'critical' },
  { algorithm: 'discovery_dfg_simd', threshold_pct: 5, severity: 'critical' },
  { algorithm: 'discovery_process_skeleton', threshold_pct: 5, severity: 'critical' },

  // Tier 2: Balanced algorithms (8% threshold)
  { algorithm: 'discovery_alpha_plus_plus', threshold_pct: 8, severity: 'high' },
  { algorithm: 'discovery_heuristic_miner', threshold_pct: 8, severity: 'high' },
  { algorithm: 'discovery_inductive_miner', threshold_pct: 8, severity: 'high' },

  // Tier 3: Quality algorithms (10% threshold)
  { algorithm: 'discovery_genetic_algorithm', threshold_pct: 10, severity: 'medium' },
  { algorithm: 'discovery_ilp', threshold_pct: 12, severity: 'medium' },

  // Analysis and utilities (5% threshold)
  { algorithm: 'analysis_event_statistics', threshold_pct: 5, severity: 'high' },
  { algorithm: 'conformance_token_replay', threshold_pct: 5, severity: 'critical' },
];

function loadBenchmarks(filePath: string): BenchmarkResult[] {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(data.benchmarks)) {
      return data.benchmarks;
    } else if (data.benchmarks && typeof data.benchmarks === 'object') {
      // Flatten nested structure if needed
      const results: BenchmarkResult[] = [];
      for (const group of Object.values(data.benchmarks)) {
        if (Array.isArray((group as any).results)) {
          results.push(...(group as any).results);
        }
      }
      return results;
    }
    throw new Error('Unexpected benchmark structure');
  } catch (err) {
    console.error(`Failed to load benchmarks from ${filePath}:`, err);
    throw err;
  }
}

function compareResults(
  baseline: BenchmarkResult[],
  current: BenchmarkResult[]
): RegressionReport {
  const now = new Date().toISOString();
  const regressions: RegressionFinding[] = [];
  const warnings: RegressionFinding[] = [];
  const improvements: RegressionFinding[] = [];

  for (const config of REGRESSION_CONFIG) {
    const baselineResults = baseline.filter(
      (r) =>
        r.backend === 'native' &&
        r.group &&
        r.group.includes(config.algorithm)
    );

    for (const baselineResult of baselineResults) {
      const currentResult = current.find(
        (r) =>
          r.backend === baselineResult.backend &&
          r.group === baselineResult.group &&
          r.algorithm === baselineResult.algorithm &&
          r.size === baselineResult.size
      );

      if (!currentResult) {
        console.warn(
          `[WARN] Missing benchmark: ${baselineResult.group}/${baselineResult.size}`
        );
        continue;
      }

      const baseline_ms = baselineResult.median_ms;
      const current_ms = currentResult.median_ms;
      const delta_ms = current_ms - baseline_ms;
      const delta_pct = (delta_ms / baseline_ms) * 100;

      if (delta_pct > config.threshold_pct) {
        regressions.push({
          algorithm: config.algorithm,
          size: baselineResult.size,
          baseline_ms,
          current_ms,
          delta_pct: Math.round(delta_pct * 10) / 10,
          threshold_pct: config.threshold_pct,
          severity: config.severity,
        });
      } else if (delta_pct > config.threshold_pct * 0.6) {
        // Warning threshold at 60% of limit
        warnings.push({
          algorithm: config.algorithm,
          size: baselineResult.size,
          baseline_ms,
          current_ms,
          delta_pct: Math.round(delta_pct * 10) / 10,
          threshold_pct: config.threshold_pct,
          severity: 'warning',
        });
      } else if (delta_pct < -5) {
        // Improvements (>5% faster)
        improvements.push({
          algorithm: config.algorithm,
          size: baselineResult.size,
          baseline_ms,
          current_ms,
          delta_pct: Math.round(delta_pct * 10) / 10,
          threshold_pct: config.threshold_pct,
          severity: 'improvement',
        });
      }
    }
  }

  const exitCode: 0 | 1 | 2 | 3 = regressions.length > 0 ? 1 : warnings.length > 0 ? 2 : 0;

  const summary = formatSummary(regressions, warnings, improvements);

  return {
    timestamp: now,
    git_hash: process.env.GIT_HASH || 'unknown',
    baseline_version: process.env.BASELINE_VERSION || 'main-latest',
    current_version: process.env.CURRENT_VERSION || 'unknown',
    regressions,
    warnings,
    improvements,
    exit_code: exitCode,
    summary,
  };
}

function formatSummary(
  regressions: RegressionFinding[],
  warnings: RegressionFinding[],
  improvements: RegressionFinding[]
): string {
  const lines: string[] = [];

  lines.push('## Regression Test Summary\n');

  if (regressions.length === 0 && warnings.length === 0 && improvements.length === 0) {
    lines.push('✅ **All benchmarks passed.** No regressions detected.\n');
  } else {
    if (regressions.length > 0) {
      lines.push(`❌ **REGRESSIONS DETECTED: ${regressions.length}**\n`);
      lines.push('| Algorithm | Size | Baseline (ms) | Current (ms) | Delta | Threshold |');
      lines.push('|-----------|------|---------------|--------------|-------|-----------|');
      for (const r of regressions) {
        lines.push(
          `| ${r.algorithm} | ${r.size} | ${r.baseline_ms.toFixed(2)} | ${r.current_ms.toFixed(2)} | ${r.delta_pct.toFixed(1)}% | ${r.threshold_pct}% |`
        );
      }
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(`⚠️ **Warnings: ${warnings.length}** (within tolerance)\n`);
      lines.push('| Algorithm | Size | Delta | Threshold |');
      lines.push('|-----------|------|-------|-----------|');
      for (const w of warnings) {
        lines.push(`| ${w.algorithm} | ${w.size} | ${w.delta_pct.toFixed(1)}% | ${w.threshold_pct}% |`);
      }
      lines.push('');
    }

    if (improvements.length > 0) {
      lines.push(`✨ **Improvements: ${improvements.length}**\n`);
      for (const imp of improvements.slice(0, 3)) {
        lines.push(`- ${imp.algorithm} (${imp.size}): ${imp.delta_pct.toFixed(1)}% faster`);
      }
      if (improvements.length > 3) {
        lines.push(`- ... and ${improvements.length - 3} more`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function writeReport(report: RegressionReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`Report written to: ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf('--baseline');
  const currentIdx = args.indexOf('--current');
  const outputIdx = args.indexOf('--output');

  if (baselineIdx === -1 || currentIdx === -1) {
    console.error('Usage: ts-node regression-test-suite.ts --baseline <file> --current <file> [--output <file>]');
    process.exit(3);
  }

  const baselinePath = args[baselineIdx + 1];
  const currentPath = args[currentIdx + 1];
  const outputPath = args[outputIdx + 1] || '.wasm4pm/benchmarks/regression-report.json';

  console.log(`Loading baseline from: ${baselinePath}`);
  console.log(`Loading current results from: ${currentPath}`);

  try {
    const baseline = loadBenchmarks(baselinePath);
    const current = loadBenchmarks(currentPath);

    console.log(`Baseline benchmarks: ${baseline.length}`);
    console.log(`Current benchmarks: ${current.length}`);

    const report = compareResults(baseline, current);

    console.log(`\n${report.summary}`);

    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }

    writeReport(report, outputPath);

    process.exit(report.exit_code);
  } catch (err) {
    console.error('Regression test failed:', err);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(3);
});
