'use strict';
/**
 * Real-Data WASM Benchmark — Tier-2 (handle-based) algorithms.
 *
 * Benchmarks ~15 algorithms that require the WASM runtime via Node.js.
 * Each algorithm is called via the compiled wasm4pm WASM module against
 * real event logs: sepsis.xes, bpi2020_travel.xes, roadtraffic100traces.xes.
 *
 * Excluded (Tier-3 — stateful / model-input only):
 *   - generalization, align_etconformance_precision, petri_net_playout,
 *     monte_carlo_simulation  (require a pre-built Petri net handle)
 *   - streaming_log           (stateful push-event API)
 *   - smart_engine            (meta-orchestrator with full lifecycle setup)
 *
 * Usage:  node benchmarks/real_data_wasm_bench.js
 *         npm run bench:real
 */

const fs   = require('fs');
const path = require('path');

// ─── WASM module ─────────────────────────────────────────────────────────────
const WASM_PKG = path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js');
if (!fs.existsSync(WASM_PKG)) {
  console.error(
    `ERROR: WASM package not found at ${WASM_PKG}\n` +
    `Build it first:  cd wasm4pm && npm run build:nodejs`
  );
  process.exit(1);
}
const wasm = require(WASM_PKG);
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

// ─── Dataset loader ───────────────────────────────────────────────────────────
const XES_CANDIDATES = [
  { label: 'sepsis',      path: path.resolve(__dirname, '../bench_data/sepsis.xes') },
  { label: 'bpi2020',     path: path.resolve(__dirname, '../bench_data/bpi2020_travel.xes') },
  { label: 'roadtraffic', path: path.resolve(__dirname, '../bench_data/roadtraffic100traces.xes') },
];

function loadDatasets() {
  const datasets = [];
  for (const { label, path: p } of XES_CANDIDATES) {
    if (fs.existsSync(p)) {
      const xes   = fs.readFileSync(p, 'utf8');
      const cases = (xes.match(/<trace>/g) || []).length;
      const events = (xes.match(/<event>/g) || []).length;
      const handle = wasm.load_eventlog_from_xes(xes);
      datasets.push({ label, handle, cases, events, xes });
    }
  }
  if (datasets.length === 0) {
    console.warn('WARNING: No real XES files found — using synthetic fallback');
    const syntheticXes = buildSyntheticXes(100);
    const handle = wasm.load_eventlog_from_xes(syntheticXes);
    datasets.push({ label: 'synthetic', handle, cases: 100, events: 500, xes: syntheticXes });
  }
  return datasets;
}

function buildSyntheticXes(n) {
  const acts = ['A', 'B', 'C', 'D', 'E'];
  let xml = '<?xml version="1.0"?><log><global><string key="concept:name" value=""/></global>\n';
  for (let i = 0; i < n; i++) {
    xml += '<trace>';
    for (const a of acts) {
      xml += `<event><string key="concept:name" value="${a}"/></event>`;
    }
    xml += '</trace>\n';
  }
  xml += '</log>';
  return xml;
}

// ─── Benchmark runner ────────────────────────────────────────────────────────
const PAD = 48;
const ITERS = 50;

function bench(label, fn, warmup = 5) {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    try { fn(); } catch (_) {}
  }
  // Measure
  const times = [];
  for (let i = 0; i < ITERS; i++) {
    const t0 = performance.now();
    try { fn(); } catch (_) {}
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const p95    = times[Math.floor(times.length * 0.95)];
  console.log(
    `  ${label.padEnd(PAD)} median: ${median.toFixed(3).padStart(8)} ms   p95: ${p95.toFixed(3).padStart(8)} ms`
  );
  return median;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const datasets = loadDatasets();

for (const ds of datasets) {
  const { label, handle, cases, events } = ds;

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Dataset: ${label}  (${cases} cases, ${events} events)`);
  console.log(`${'─'.repeat(80)}`);

  // ── Discovery: DFG family ────────────────────────────────────────────────
  console.log('\n[Discovery — DFG family]');

  bench(`declare/${label}`, () =>
    parse(wasm.discover_declare(handle, 'concept:name'))
  );

  bench(`process_skeleton/${label}`, () =>
    parse(wasm.extract_process_skeleton(handle, 'concept:name', 1))
  );

  bench(`simd_streaming_dfg/${label}`, () =>
    parse(wasm.discover_dfg_simd_handle(handle, 'concept:name'))
  );

  bench(`hierarchical_dfg/${label}`, () =>
    parse(wasm.discover_dfg_hierarchical(handle, 'concept:name', 4))
  );

  // ── Discovery: Causal graph ──────────────────────────────────────────────
  console.log('\n[Discovery — Causal graph]');

  bench(`causal_graph_alpha/${label}`, () =>
    parse(wasm.discover_causal_alpha(handle, 'concept:name'))
  );

  bench(`causal_graph_heuristic/${label}`, () =>
    parse(wasm.discover_causal_heuristic(handle, 'concept:name', 0.5))
  );

  // ── ML Analysis ─────────────────────────────────────────────────────────
  console.log('\n[ML Analysis — 6 algorithms]');

  bench(`ml_classify/${label}`, () =>
    parse(wasm.discover_ml_classify(handle, 'concept:name'))
  );

  bench(`ml_cluster/${label}`, () =>
    parse(wasm.discover_ml_cluster(handle, 'concept:name'))
  );

  bench(`ml_forecast/${label}`, () =>
    parse(wasm.discover_ml_forecast(handle, 'concept:name'))
  );

  bench(`ml_anomaly_discover/${label}`, () =>
    parse(wasm.discover_ml_anomaly(handle, 'concept:name'))
  );

  bench(`ml_regress/${label}`, () =>
    parse(wasm.discover_ml_regress(handle, 'concept:name'))
  );

  bench(`ml_pca/${label}`, () =>
    parse(wasm.discover_ml_pca(handle, 'concept:name'))
  );

  // ── Analysis utilities ───────────────────────────────────────────────────
  console.log('\n[Analysis utilities]');

  bench(`performance_spectrum/${label}`, () =>
    parse(wasm.discover_performance_spectrum_wasm(
      handle, 'concept:name', 'time:timestamp', 'concept:name'
    ))
  );

  bench(`simd_token_replay/${label}`, () => {
    wasm.simd_token_replay(handle, 'concept:name');
  });
}

console.log(`\n${'═'.repeat(80)}`);
console.log('Done.');
