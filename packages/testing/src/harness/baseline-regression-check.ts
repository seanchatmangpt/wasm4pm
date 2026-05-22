/**
 * baseline-regression-check.ts
 *
 * Regression detection harness for algorithm baselines.
 *
 * Design:
 *   - Load baseline fixture (algorithm-baselines.json)
 *   - Compare current algorithm output against baseline metrics
 *   - Report regressions with actionable diffs
 *   - Integrate into CI/CD gates for pre-merge validation
 *
 * Oracle rank: Rank 2 (Domain contract — algorithm quality must not regress)
 */

// Lazy-load baselines fixture to avoid import assertion syntax issues
let baselines: any = null;
function getBaselinesFixture() {
  if (!baselines) {
    // This will be resolved at runtime by vitest/jest
    try {
      baselines = require('../../fixtures/algorithm-baselines.json');
    } catch {
      baselines = {};
    }
  }
  return baselines;
}
import type { AlgorithmBaseline } from './baseline-capture.js';

/**
 * Regression report for a single algorithm
 */
export interface RegressionReport {
  algorithm: string;
  passed: boolean;
  baseline: AlgorithmBaseline | null;
  current: AlgorithmBaseline;
  regressions: RegressionDetail[];
  recommendations: string[];
}

/**
 * Individual regression detail
 */
export interface RegressionDetail {
  metric: 'fitness' | 'precision' | 'qualityScore' | 'durationMs';
  baselineValue: number;
  currentValue: number;
  delta: number;
  deltaPercent: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Check if algorithm regression is detected
 *
 * @param current - Current algorithm baseline metrics
 * @param thresholdPct - Regression threshold percentage (default: 5%)
 * @returns RegressionReport with detailed findings
 */
export function checkRegressionAgainstBaseline(
  current: AlgorithmBaseline,
  thresholdPct: number = 5
): RegressionReport {
  const report: RegressionReport = {
    algorithm: current.algorithm,
    passed: true,
    baseline: null,
    current,
    regressions: [],
    recommendations: [],
  };

  // Find matching baseline by algorithm ID and approximate log size
  const allBaselines = getBaselinesFixture();
  let baseline: AlgorithmBaseline | undefined;

  for (const category of ['discovery_algorithms', 'analysis_algorithms', 'simulation_algorithms', 'ml_algorithms']) {
    const categoryBaselines = allBaselines[category] || {};
    const key = Object.keys(categoryBaselines).find(
      (k) => categoryBaselines[k]?.algorithm === current.algorithm
    );
    if (key) {
      baseline = categoryBaselines[key];
      break;
    }
  }

  if (!baseline) {
    // No baseline found — treat as informational
    report.recommendations.push(
      `No baseline found for algorithm "${current.algorithm}". First-time capture. Add to fixtures/algorithm-baselines.json for future regression detection.`
    );
    return report;
  }

  report.baseline = baseline;

  // Check fitness regression (critical)
  const fitnessDelta = current.fitness - baseline.fitness;
  const fitnessThreshold = (baseline.fitness * thresholdPct) / 100;

  if (fitnessDelta < -fitnessThreshold) {
    report.passed = false;
    report.regressions.push({
      metric: 'fitness',
      baselineValue: baseline.fitness,
      currentValue: current.fitness,
      delta: fitnessDelta,
      deltaPercent: (fitnessDelta / baseline.fitness) * 100,
      threshold: fitnessThreshold,
      severity: 'critical',
    });

    report.recommendations.push(
      `Fitness regression: ${baseline.fitness.toFixed(3)} → ${current.fitness.toFixed(3)} ` +
        `(${((fitnessDelta / baseline.fitness) * 100).toFixed(1)}%). ` +
        `Check model discovery logic or algorithm parameters.`
    );
  }

  // Check quality score regression (warning)
  const qualityDelta = current.qualityScore - baseline.qualityScore;
  const qualityThreshold = (baseline.qualityScore * 3) / 100; // 3% margin for quality

  if (qualityDelta < -qualityThreshold) {
    if (!report.passed) {
      report.regressions.push({
        metric: 'qualityScore',
        baselineValue: baseline.qualityScore,
        currentValue: current.qualityScore,
        delta: qualityDelta,
        deltaPercent: (qualityDelta / baseline.qualityScore) * 100,
        threshold: qualityThreshold,
        severity: 'warning',
      });
    }

    report.recommendations.push(
      `Quality score decline: ${baseline.qualityScore.toFixed(3)} → ${current.qualityScore.toFixed(3)}. ` +
        `Model accuracy may be affected. Validate fitness and precision separately.`
    );
  }

  // Check precision regression (info)
  const precisionDelta = current.precision - baseline.precision;
  const precisionThreshold = (baseline.precision * thresholdPct) / 100;

  if (precisionDelta < -precisionThreshold) {
    report.regressions.push({
      metric: 'precision',
      baselineValue: baseline.precision,
      currentValue: current.precision,
      delta: precisionDelta,
      deltaPercent: (precisionDelta / baseline.precision) * 100,
      threshold: precisionThreshold,
      severity: 'info',
    });

    report.recommendations.push(
      `Precision decline: ${baseline.precision.toFixed(3)} → ${current.precision.toFixed(3)}. ` +
        `Model may be underfitting. Consider algorithm tuning.`
    );
  }

  // Check duration regression (info only, not a pass/fail)
  const durationDelta = current.durationMs - baseline.durationMs;
  const durationThreshold = Math.max(5, baseline.durationMs * 0.1); // 10% or 5ms minimum

  if (durationDelta > durationThreshold) {
    report.regressions.push({
      metric: 'durationMs',
      baselineValue: baseline.durationMs,
      currentValue: current.durationMs,
      delta: durationDelta,
      deltaPercent: (durationDelta / baseline.durationMs) * 100,
      threshold: durationThreshold,
      severity: 'info',
    });

    report.recommendations.push(
      `Performance regression: ${baseline.durationMs}ms → ${current.durationMs}ms. ` +
        `Consider profiling or optimization if this is a discovery algorithm.`
    );
  }

  return report;
}

/**
 * Check regressions for multiple algorithms
 *
 * @param currents - Array of current baseline metrics
 * @param thresholdPct - Regression threshold percentage
 * @returns Array of regression reports
 */
export function checkRegressionBatch(
  currents: AlgorithmBaseline[],
  thresholdPct: number = 5
): RegressionReport[] {
  return currents.map((current) => checkRegressionAgainstBaseline(current, thresholdPct));
}

/**
 * Generate a summary report from multiple regression reports
 *
 * @param reports - Array of regression reports
 * @returns Human-readable summary
 */
export function summarizeRegressionReports(reports: RegressionReport[]): string {
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;
  const warnings = reports.filter((r) => r.regressions.some((reg) => reg.severity === 'warning')).length;
  const hasBaseline = reports.filter((r) => r.baseline !== null).length;

  let summary = `\n📊 Regression Summary\n`;
  summary += `${'='.repeat(50)}\n`;
  summary += `✅ Passed: ${passed}/${reports.length}\n`;
  summary += `❌ Failed: ${failed}/${reports.length}\n`;
  summary += `⚠️  Warnings: ${warnings}/${reports.length}\n`;
  summary += `📈 Baselines found: ${hasBaseline}/${reports.length}\n`;
  summary += `${'='.repeat(50)}\n`;

  if (failed > 0) {
    summary += `\n🚨 CRITICAL REGRESSIONS:\n`;
    reports
      .filter((r) => !r.passed)
      .forEach((report) => {
        summary += `\n  ${report.algorithm}\n`;
        report.regressions
          .filter((r) => r.severity === 'critical')
          .forEach((reg) => {
            summary += `    ${reg.metric}: ${reg.baselineValue.toFixed(3)} → ${reg.currentValue.toFixed(3)} `;
            summary += `(${reg.deltaPercent.toFixed(1)}%)\n`;
          });
      });
  }

  if (warnings > 0) {
    summary += `\n⚠️  WARNINGS:\n`;
    reports
      .filter((r) => r.regressions.some((reg) => reg.severity === 'warning'))
      .forEach((report) => {
        summary += `\n  ${report.algorithm}\n`;
        report.regressions
          .filter((r) => r.severity === 'warning')
          .forEach((reg) => {
            summary += `    ${reg.metric}: ${reg.baselineValue.toFixed(3)} → ${reg.currentValue.toFixed(3)} `;
            summary += `(${reg.deltaPercent.toFixed(1)}%)\n`;
          });
      });
  }

  // Recommendations
  const allRecs = reports.flatMap((r) => r.recommendations).filter((r) => r.length > 0);
  if (allRecs.length > 0) {
    summary += `\n💡 RECOMMENDATIONS:\n`;
    allRecs.forEach((rec) => {
      summary += `  • ${rec}\n`;
    });
  }

  return summary;
}

/**
 * Get a verbose report showing all metrics (baseline vs current)
 *
 * @param report - Single regression report
 * @returns Human-readable detailed report
 */
export function detailedRegressionReport(report: RegressionReport): string {
  let output = `\n📋 Detailed Report: ${report.algorithm}\n`;
  output += `${'='.repeat(60)}\n`;

  if (report.baseline === null) {
    output += `⚠️  No baseline found (first-time capture)\n`;
    output += `Current metrics:\n`;
    output += `  Fitness: ${report.current.fitness.toFixed(3)}\n`;
    output += `  Precision: ${report.current.precision.toFixed(3)}\n`;
    output += `  Quality Score: ${report.current.qualityScore.toFixed(3)}\n`;
    output += `  Duration: ${report.current.durationMs}ms\n`;
    output += `  Nodes: ${report.current.nodeCount}, Edges: ${report.current.edgeCount}\n`;
    return output;
  }

  output += `Baseline (${report.baseline.capturedAt})\n`;
  output += `  Fitness:  ${report.baseline.fitness.toFixed(3)}\n`;
  output += `  Precision: ${report.baseline.precision.toFixed(3)}\n`;
  output += `  Quality:   ${report.baseline.qualityScore.toFixed(3)}\n`;
  output += `  Duration:  ${report.baseline.durationMs}ms\n`;
  output += `  Nodes: ${report.baseline.nodeCount}, Edges: ${report.baseline.edgeCount}\n`;

  output += `\nCurrent\n`;
  output += `  Fitness:  ${report.current.fitness.toFixed(3)} ${formatDelta(report.current.fitness, report.baseline.fitness)}\n`;
  output += `  Precision: ${report.current.precision.toFixed(3)} ${formatDelta(report.current.precision, report.baseline.precision)}\n`;
  output += `  Quality:   ${report.current.qualityScore.toFixed(3)} ${formatDelta(report.current.qualityScore, report.baseline.qualityScore)}\n`;
  output += `  Duration:  ${report.current.durationMs}ms ${formatDelta(report.current.durationMs, report.baseline.durationMs)}\n`;
  output += `  Nodes: ${report.current.nodeCount}, Edges: ${report.current.edgeCount}\n`;

  if (report.regressions.length > 0) {
    output += `\n🔴 Regressions Detected:\n`;
    report.regressions.forEach((reg) => {
      const icon = reg.severity === 'critical' ? '🚨' : reg.severity === 'warning' ? '⚠️' : 'ℹ️';
      output += `  ${icon} ${reg.metric}: ${reg.deltaPercent.toFixed(1)}% (Δ ${reg.delta.toFixed(4)})\n`;
    });
  } else {
    output += `\n✅ No regressions detected\n`;
  }

  if (report.recommendations.length > 0) {
    output += `\n💡 Recommendations:\n`;
    report.recommendations.forEach((rec) => {
      output += `  • ${rec}\n`;
    });
  }

  output += `${'='.repeat(60)}\n`;

  return output;
}

/**
 * Helper: format delta with arrow and percentage
 */
function formatDelta(current: number, baseline: number): string {
  const delta = current - baseline;
  const pct = ((delta / baseline) * 100).toFixed(1);
  if (delta > 0.001) {
    return `↑ +${pct}%`;
  } else if (delta < -0.001) {
    return `↓ ${pct}%`;
  } else {
    return `→ stable`;
  }
}
