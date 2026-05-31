#!/usr/bin/env node
/**
 * bench.js — Real algorithm performance measurement
 *
 * Uses process.hrtime.bigint() for nanosecond-precision timing.
 * Loads the smallest available XES file, runs dfg, heuristic_miner,
 * and alpha_plus_plus, then prints elapsed ms per algorithm.
 *
 * Usage:
 *   node scripts/bench.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── WASM ──────────────────────────────────────────────────────────────────────
const WASM_PKG = path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js');
if (!fs.existsSync(WASM_PKG)) {
  console.error(`ERROR: WASM not found at ${WASM_PKG}`);
  console.error('Build first: cd wasm4pm && npm run build:nodejs');
  process.exit(1);
}
const wasm  = require(WASM_PKG);
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

// ── Load smallest XES ─────────────────────────────────────────────────────────
const XES_PATH = path.resolve(__dirname, '../bench_data/roadtraffic100traces.xes');
if (!fs.existsSync(XES_PATH)) {
  console.error(`ERROR: XES not found at ${XES_PATH}`);
  process.exit(1);
}
const xesContent = fs.readFileSync(XES_PATH, 'utf8');
const traceCount = (xesContent.match(/<trace>/g) || []).length;
const eventCount = (xesContent.match(/<event>/g) || []).length;

console.log(`\nbench.js — process.hrtime.bigint() precision`);
console.log(`${'─'.repeat(60)}`);
console.log(`File    : roadtraffic100traces.xes`);
console.log(`Traces  : ${traceCount}   Events: ${eventCount}`);
console.log(`${'─'.repeat(60)}\n`);

// ── Load handle once ──────────────────────────────────────────────────────────
const handle = wasm.load_eventlog_from_xes(xesContent);

// ── Algorithms ────────────────────────────────────────────────────────────────
const ALGORITHMS = [
  {
    name: 'dfg',
    documentedSpeedTier: 5,
    run: () => wasm.discover_dfg(handle, 'concept:name'),
  },
  {
    name: 'heuristic_miner',
    documentedSpeedTier: 25,
    // dependency_threshold 0.3 is safe for real logs (0.8 filters everything)
    run: () => wasm.discover_heuristic_miner(handle, 'concept:name', 0.3),
  },
  {
    name: 'alpha_plus_plus',
    documentedSpeedTier: 20,
    run: () => wasm.discover_alpha_plus_plus(handle, 'concept:name', 0.0, 0.8),
  },
];

const RUNS = 10;

// ── Timing helper using process.hrtime.bigint() ───────────────────────────────
function timeItNs(fn) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0)); // nanoseconds
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((s, v) => s + v, 0);
  const toMs = ns => +(ns / 1e6).toFixed(3);
  return {
    mean_ms: toMs(sum / RUNS),
    min_ms:  toMs(samples[0]),
    max_ms:  toMs(samples[samples.length - 1]),
    p50_ms:  toMs(samples[Math.floor(RUNS * 0.5)]),
    p95_ms:  toMs(samples[Math.floor(RUNS * 0.95)]),
  };
}

// ── Run benchmarks ────────────────────────────────────────────────────────────
const results = {};

for (const algo of ALGORITHMS) {
  // warm-up
  let lastResult;
  try {
    lastResult = algo.run();
  } catch (e) {
    console.log(`  ${algo.name.padEnd(20)} SKIP — warm-up error: ${e.message}`);
    results[algo.name] = { error: e.message, documentedSpeedTier: algo.documentedSpeedTier };
    continue;
  }

  let timings;
  try {
    timings = timeItNs(() => { lastResult = algo.run(); });
  } catch (e) {
    console.log(`  ${algo.name.padEnd(20)} FAIL — ${e.message}`);
    results[algo.name] = { error: e.message, documentedSpeedTier: algo.documentedSpeedTier };
    continue;
  }

  console.log(
    `  ${algo.name.padEnd(20)}` +
    `  mean=${String(timings.mean_ms).padStart(7)} ms` +
    `  p95=${String(timings.p95_ms).padStart(7)} ms` +
    `  [speedTier=${algo.documentedSpeedTier}]`
  );

  results[algo.name] = {
    ...timings,
    documentedSpeedTier: algo.documentedSpeedTier,
  };
}

// ── Rank by actual mean_ms (ascending = fastest) ─────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log('Actual rank (fastest → slowest by mean_ms):');
const ranked = Object.entries(results)
  .filter(([, v]) => !v.error)
  .sort(([, a], [, b]) => a.mean_ms - b.mean_ms);

ranked.forEach(([name, v], i) => {
  const docRank = [...ALGORITHMS]
    .sort((a, b) => a.documentedSpeedTier - b.documentedSpeedTier)
    .findIndex(a => a.name === name) + 1;
  const actualRank = i + 1;
  const mismatch = docRank !== actualRank ? ` ⚠ doc rank=${docRank}` : '';
  console.log(`  ${actualRank}. ${name.padEnd(20)} ${v.mean_ms} ms${mismatch}`);
});

// ── Save perf-baseline.json ───────────────────────────────────────────────────
const baseline = {
  generated_at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node_version: process.version,
  dataset: 'roadtraffic100traces.xes',
  traces: traceCount,
  events: eventCount,
  runs_per_algorithm: RUNS,
  timing_method: 'process.hrtime.bigint()',
  results,
};

const outPath = path.resolve(__dirname, 'perf-baseline.json');
fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2));
console.log(`\nSaved: scripts/perf-baseline.json`);
