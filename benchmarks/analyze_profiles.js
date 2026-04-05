#!/usr/bin/env node
/**
 * Analyze benchmarks by execution profile
 * Maps algorithms to 5 execution profiles:
 * - fast: DFG, Declare, Hill Climbing (speed-optimized, minimal quality)
 * - balanced: Alpha++, Heuristic, Inductive (good balance)
 * - quality: Genetic, PSO, ILP, A*, ACO, SA (best quality, slower)
 * - analytics: Event stats, trace variants, complexity analysis
 * - research: Specialized algorithms for benchmarking/testing
 */

const fs = require('fs');
const path = require('path');

function loadResults(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  const stddev = Math.sqrt(variance);
  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean.toFixed(3),
    median: sorted[Math.floor(sorted.length / 2)].toFixed(3),
    p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(3),
    stddev: stddev.toFixed(3),
  };
}

function algorithmToProfile(algo) {
  const a = algo.toLowerCase();

  // Fast profile: <5ms per 100 events
  if (a.includes('dfg') || a.includes('declare') || a.includes('skeleton') ||
      a.includes('event_statistics') || a.includes('rework')) {
    return 'fast';
  }

  // Balanced profile: 5-30ms per 100 events
  if (a.includes('heuristic') || a.includes('alpha') || a.includes('inductive') ||
      a.includes('hill_climbing')) {
    return 'balanced';
  }

  // Quality profile: 30ms+ per 100 events, best result quality
  if (a.includes('genetic') || a.includes('pso') || a.includes('ilp') ||
      a.includes('astar') || a.includes('ant_colony') || a.includes('simulated')) {
    return 'quality';
  }

  // Analytics profile: specialized analysis functions
  if (a.includes('analyze') || a.includes('variant') || a.includes('matrix') ||
      a.includes('drift') || a.includes('cluster') || a.includes('pattern')) {
    return 'analytics';
  }

  return 'research';  // Catch-all
}

function analyzeByProfile(results) {
  const profiles = {
    fast: [],
    balanced: [],
    quality: [],
    analytics: [],
    research: [],
  };

  for (const r of results) {
    const profile = algorithmToProfile(r.algorithm);
    profiles[profile].push(r);
  }

  const analysis = {};
  for (const [profile, items] of Object.entries(profiles)) {
    if (items.length === 0) continue;

    const times = items.map(r => r.medianMs);
    const bySizePerf = {};

    for (const r of items) {
      if (!bySizePerf[r.size]) {
        bySizePerf[r.size] = [];
      }
      bySizePerf[r.size].push(r.medianMs);
    }

    analysis[profile] = {
      count: items.length,
      algorithms: [...new Set(items.map(r => r.algorithm))],
      stats: stats(times),
      bySize: Object.fromEntries(
        Object.entries(bySizePerf).map(([size, times]) => [
          size,
          stats(times)
        ])
      ),
      meets_targets: {
        small_100: Math.max(...items.filter(r => r.size === 100).map(r => r.medianMs)) < 1000,
        medium_1k: Math.max(...items.filter(r => r.size === 1000).map(r => r.medianMs)) < 10000,
        medium_10k: Math.max(...items.filter(r => r.size === 10000).map(r => r.medianMs)) < 10000,
      }
    };
  }

  return { profiles, analysis };
}

function validateMemoryBounded(results) {
  // For each algorithm, check if memory growth is bounded (not exponential)
  const algoGroups = {};

  for (const r of results) {
    if (!algoGroups[r.algorithm]) {
      algoGroups[r.algorithm] = [];
    }
    algoGroups[r.algorithm].push({ size: r.size, time: r.medianMs });
  }

  const memoryAnalysis = {};
  for (const [algo, data] of Object.entries(algoGroups)) {
    const sorted = data.sort((a, b) => a.size - b.size);
    if (sorted.length < 2) continue;

    // Check growth rate: time(n) / n should be roughly constant for linear
    const normalized = sorted.map(d => ({
      size: d.size,
      time: d.time,
      ratio: d.time / d.size,
    }));

    const ratios = normalized.map(n => n.ratio);
    const avgRatio = ratios.reduce((a, b) => a + b) / ratios.length;
    const maxDeviation = Math.max(...ratios.map(r => Math.abs(r - avgRatio) / avgRatio));

    memoryAnalysis[algo] = {
      dataPoints: normalized,
      avgRatioPerEvent: avgRatio.toFixed(6),
      maxDeviation: (maxDeviation * 100).toFixed(1),
      isBounded: maxDeviation < 0.5,  // <50% deviation = bounded
    };
  }

  return memoryAnalysis;
}

function generateCSVSummary(analysis, outputPath) {
  const rows = ['Profile,Count,Algorithms,Min(ms),Mean(ms),Median(ms),Max(ms),p95(ms),StdDev(ms)'];

  for (const [profile, data] of Object.entries(analysis)) {
    if (!data.stats) continue;
    rows.push([
      profile,
      data.count,
      data.algorithms.length,
      data.stats.min.toFixed(3),
      data.stats.mean,
      data.stats.median,
      data.stats.max.toFixed(3),
      data.stats.p95,
      data.stats.stddev,
    ].join(','));
  }

  fs.writeFileSync(outputPath, rows.join('\n') + '\n');
  console.log(`CSV summary written to: ${outputPath}`);
}

function generateJSONSummary(results, analysis, outputPath) {
  const summary = {
    timestamp: new Date().toISOString(),
    version: 'v26.4.5',
    totalMeasurements: results.length,
    totalAlgorithms: new Set(results.map(r => r.algorithm)).size,
    executionProfiles: analysis,
  };

  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`JSON summary written to: ${outputPath}`);
}

function generateTextReport(results, { profiles, analysis }, memoryAnalysis, outputPath) {
  let report = '';

  report += '════════════════════════════════════════════════════════════════════════\n';
  report += '  WASM4PM v26.4.5 PERFORMANCE ANALYSIS - EXECUTION PROFILES\n';
  report += '════════════════════════════════════════════════════════════════════════\n\n';

  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Total Measurements: ${results.length}\n`;
  report += `Total Algorithms: ${new Set(results.map(r => r.algorithm)).size}\n\n`;

  // Profile summaries
  for (const [profile, data] of Object.entries(analysis)) {
    if (!data.stats) continue;

    report += `\n${profile.toUpperCase()} PROFILE\n`;
    report += '─'.repeat(70) + '\n';
    report += `Algorithms: ${data.algorithms.join(', ')}\n`;
    report += `Measurements: ${data.count}\n`;
    report += `  Min:    ${data.stats.min.toFixed(3)} ms\n`;
    report += `  Mean:   ${data.stats.mean} ms\n`;
    report += `  Median: ${data.stats.median} ms\n`;
    report += `  Max:    ${data.stats.max.toFixed(3)} ms\n`;
    report += `  p95:    ${data.stats.p95} ms\n`;
    report += `  StdDev: ${data.stats.stddev} ms\n`;

    report += '\nPerformance by Input Size:\n';
    for (const [size, sizeStats] of Object.entries(data.bySize)) {
      report += `  ${size.padStart(6)} cases: ${sizeStats.median.padStart(8)} ms (${sizeStats.min}-${sizeStats.max})\n`;
    }

    report += '\nTarget Compliance:\n';
    report += `  100 cases (<1s):    ${data.meets_targets.small_100 ? '✅ PASS' : '❌ FAIL'}\n`;
    report += `  1K cases (<10s):    ${data.meets_targets.medium_1k ? '✅ PASS' : '❌ FAIL'}\n`;
    report += `  10K cases (<10s):   ${data.meets_targets.medium_10k ? '✅ PASS' : '❌ FAIL'}\n`;
  }

  // Memory analysis
  report += '\n\nMEMORY SCALING ANALYSIS\n';
  report += '─'.repeat(70) + '\n';
  report += 'Algorithm scaling characteristics (time/size ratio should be constant):\n\n';

  for (const [algo, memData] of Object.entries(memoryAnalysis)) {
    report += `${algo}\n`;
    report += `  Bounded: ${memData.isBounded ? '✅ YES' : '❌ NO'}\n`;
    report += `  Avg ratio (ms/event): ${memData.avgRatioPerEvent}\n`;
    report += `  Max deviation: ${memData.maxDeviation}%\n`;
    report += '  Size progression:\n';
    for (const point of memData.dataPoints) {
      report += `    ${String(point.size).padStart(6)} cases: ${point.time.toFixed(3)} ms (${point.ratio.toFixed(6)} ms/event)\n`;
    }
    report += '\n';
  }

  // Recommendations
  report += '\nRECOMMENDATIONS\n';
  report += '─'.repeat(70) + '\n';
  report += '1. Use FAST profile for real-time, interactive analysis\n';
  report += '2. Use BALANCED profile for most production use cases\n';
  report += '3. Use QUALITY profile for offline, best-effort analysis\n';
  report += '4. Use ANALYTICS profile for log inspection and statistics\n';
  report += '5. Monitor memory usage for large logs (>100K events)\n';
  report += '6. Consider streaming/chunking for very large logs\n';

  fs.writeFileSync(outputPath, report);
  console.log(`Text report written to: ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node analyze_profiles.js <results.json>');
    process.exit(1);
  }

  const resultsPath = args[0];
  if (!fs.existsSync(resultsPath)) {
    console.error(`Results file not found: ${resultsPath}`);
    process.exit(1);
  }

  console.log(`Analyzing: ${resultsPath}`);
  const data = loadResults(resultsPath);
  const results = data.results || data;

  // Analyze by profile
  const profileAnalysis = analyzeByProfile(results);
  const memoryAnalysis = validateMemoryBounded(results);

  // Generate outputs
  const baseName = resultsPath.replace(/\.json$/, '');
  generateCSVSummary(profileAnalysis.analysis, `${baseName}_profiles.csv`);
  generateJSONSummary(results, profileAnalysis.analysis, `${baseName}_profiles.json`);
  generateTextReport(results, profileAnalysis, memoryAnalysis, `${baseName}_profiles.txt`);

  console.log('\n✅ Profile analysis complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
