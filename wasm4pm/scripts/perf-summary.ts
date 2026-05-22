#!/usr/bin/env node
/**
 * perf-summary.ts
 * Performance baseline summary and analysis tool
 *
 * Reads .wasm4pm/perf-baseline.json and generates:
 * - Formatted markdown table of results
 * - Algorithm performance rankings
 * - Latency color-coding (green/yellow/red)
 * - Regression detection vs previous baseline
 * - Optimization candidates (slow algorithms)
 *
 * Usage:
 *   npx ts-node scripts/perf-summary.ts
 *   npx ts-node scripts/perf-summary.ts --file path/to/baseline.json
 *   npx ts-node scripts/perf-summary.ts --compare baseline1.json baseline2.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface Measurement {
  algorithm: string;
  dataSize: 'small' | 'medium' | 'large';
  eventCount: number;
  runs: Array<{
    latencyMs: number;
    memoryMB: number;
  }>;
  error?: string;
}

interface BaselineData {
  timestamp: string;
  profile: string;
  measurements: Measurement[];
}

function colorize(text: string, color: 'red' | 'yellow' | 'green'): string {
  const colors: Record<string, string> = {
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    reset: '\x1b[0m',
  };
  return `${colors[color]}${text}${colors.reset}`;
}

function getLatencyColor(
  latencyMs: number,
  dataSize: 'small' | 'medium' | 'large'
): 'green' | 'yellow' | 'red' {
  if (dataSize === 'small') {
    if (latencyMs < 100) return 'green';
    if (latencyMs < 1000) return 'yellow';
    return 'red';
  } else if (dataSize === 'medium') {
    if (latencyMs < 500) return 'green';
    if (latencyMs < 5000) return 'yellow';
    return 'red';
  } else {
    // large
    if (latencyMs < 2000) return 'green';
    if (latencyMs < 20000) return 'yellow';
    return 'red';
  }
}

function calculateStats(values: number[]): {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
} {
  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    stdDev,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function generateTable(baseline: BaselineData): string {
  const measurements = baseline.measurements.filter((m) => !m.error);

  // Group by algorithm and data size
  const grouped = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const key = m.algorithm;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  let table = '# Performance Baseline Report\n\n';
  table += `**Profile:** ${baseline.profile}\n`;
  table += `**Timestamp:** ${baseline.timestamp}\n\n`;

  table += '## Performance Summary\n\n';
  table += '| Algorithm | Data Size | Latency (ms) | Memory (MB) | Throughput (evt/s) | Status |\n';
  table += '|-----------|-----------|---------|----------|-----------|--------|\n';

  let totalAlgos = 0;
  let fastCount = 0;

  for (const [algo, ms] of grouped) {
    for (const measurement of ms.sort((a, b) => a.eventCount - b.eventCount)) {
      const latencies = measurement.runs.map((r) => r.latencyMs);
      const memories = measurement.runs.map((r) => r.memoryMB);

      const latencyStats = calculateStats(latencies);
      const memoryStats = calculateStats(memories);
      const throughput = measurement.eventCount / (latencyStats.mean / 1000);

      const color = getLatencyColor(latencyStats.mean, measurement.dataSize);
      const statusEmoji = color === 'green' ? '🟢' : color === 'yellow' ? '🟡' : '🔴';

      const latencyStr = `${latencyStats.mean.toFixed(1)}±${latencyStats.stdDev.toFixed(1)}`;
      const memoryStr = `${memoryStats.mean.toFixed(2)}±${memoryStats.stdDev.toFixed(2)}`;
      const throughputStr = throughput.toFixed(0);

      table += `| ${algo} | ${measurement.dataSize} | ${latencyStr} | ${memoryStr} | ${throughputStr} | ${statusEmoji} |\n`;

      totalAlgos++;
      if (color === 'green') fastCount++;
    }
  }

  // Summary statistics
  table += `\n## Summary\n\n`;
  table += `- **Total measurements:** ${totalAlgos}\n`;
  table += `- **Fast (green):** ${fastCount} (${((fastCount / totalAlgos) * 100).toFixed(0)}%)\n`;
  table += `- **Medium (yellow):** ${totalAlgos - fastCount - (measurements.length - fastCount)}\n`;
  table += `- **Slow (red):** ${measurements.length - fastCount}\n`;

  // Slow algorithms
  const slowAlgos = measurements
    .filter((m) => {
      const latencies = m.runs.map((r) => r.latencyMs);
      const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      return getLatencyColor(mean, m.dataSize) === 'red';
    })
    .sort((a, b) => {
      const aMean = a.runs.reduce((x, y) => x + y.latencyMs, 0) / a.runs.length;
      const bMean = b.runs.reduce((x, y) => x + y.latencyMs, 0) / b.runs.length;
      return bMean - aMean;
    });

  if (slowAlgos.length > 0) {
    table += `\n## Optimization Candidates\n\n`;
    table += `Algorithms that exceed latency thresholds:\n\n`;

    for (const algo of slowAlgos) {
      const latencies = algo.runs.map((r) => r.latencyMs);
      const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      table += `- **${algo.algorithm}** (${algo.dataSize}): ${mean.toFixed(1)}ms\n`;
    }
  }

  return table;
}

function compareBaselines(baseline1: BaselineData, baseline2: BaselineData): string {
  let report = '# Performance Regression Report\n\n';
  report += `**Baseline 1:** ${baseline1.timestamp} (${baseline1.profile})\n`;
  report += `**Baseline 2:** ${baseline2.timestamp} (${baseline2.profile})\n\n`;

  const m1 = new Map<string, Measurement>();
  const m2 = new Map<string, Measurement>();

  for (const m of baseline1.measurements) {
    m1.set(`${m.algorithm}:${m.dataSize}`, m);
  }

  for (const m of baseline2.measurements) {
    m2.set(`${m.algorithm}:${m.dataSize}`, m);
  }

  report += '| Algorithm | Data Size | Baseline 1 | Baseline 2 | Change | Status |\n';
  report += '|-----------|-----------|----------|----------|--------|--------|\n';

  let regressions = 0;
  let improvements = 0;
  let unchanged = 0;

  for (const [key, m1Data] of m1) {
    const m2Data = m2.get(key);
    if (!m2Data) continue;

    const lat1 = m1Data.runs.reduce((a, b) => a + b.latencyMs, 0) / m1Data.runs.length;
    const lat2 = m2Data.runs.reduce((a, b) => a + b.latencyMs, 0) / m2Data.runs.length;
    const pct = ((lat2 - lat1) / lat1) * 100;

    let statusEmoji = '➡️';
    if (pct < -5) {
      statusEmoji = '🟢';
      improvements++;
    } else if (pct > 5) {
      statusEmoji = '🔴';
      regressions++;
    } else {
      unchanged++;
    }

    const changeStr = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
    report += `| ${m1Data.algorithm} | ${m1Data.dataSize} | ${lat1.toFixed(1)}ms | ${lat2.toFixed(1)}ms | ${changeStr} | ${statusEmoji} |\n`;
  }

  report += `\n## Summary\n\n`;
  report += `- **Regressions:** ${regressions}\n`;
  report += `- **Improvements:** ${improvements}\n`;
  report += `- **Unchanged:** ${unchanged}\n`;

  if (regressions > 0) {
    report += `\n${colorize('⚠️  Performance regressions detected!', 'red')}\n`;
  } else if (improvements > 0) {
    report += `\n${colorize('✓ Performance improved!', 'green')}\n`;
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let baselineFile = path.join(process.cwd(), '.wasm4pm/perf-baseline.json');
  let compareFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') {
      baselineFile = args[++i];
    } else if (args[i] === '--compare') {
      compareFile = args[++i];
    }
  }

  if (!fs.existsSync(baselineFile)) {
    console.error(`Baseline file not found: ${baselineFile}`);
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf-8')) as BaselineData;

  if (compareFile) {
    if (!fs.existsSync(compareFile)) {
      console.error(`Comparison file not found: ${compareFile}`);
      process.exit(1);
    }
    const compareBaseline = JSON.parse(fs.readFileSync(compareFile, 'utf-8')) as BaselineData;
    console.log(compareBaselines(baseline, compareBaseline));
  } else {
    console.log(generateTable(baseline));
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
