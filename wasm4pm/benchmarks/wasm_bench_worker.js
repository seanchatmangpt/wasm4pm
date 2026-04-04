/**
 * Worker thread for concurrent WASM benchmarking.
 * Each worker gets its own WASM instance (separate V8 isolate memory).
 * Receives an array of task descriptors; posts results back to main thread.
 */
'use strict';

const { workerData, parentPort } = require('worker_threads');
const { performance } = require('perf_hooks');

// Load the Node.js WASM build
let pm;
try {
  pm = require('../pkg-nodejs/wasm4pm.js');
} catch (_) {
  try {
    pm = require('../pkg/wasm4pm.js');
  } catch (e) {
    parentPort.postMessage({ error: `Cannot load WASM module: ${e.message}` });
    process.exit(1);
  }
}

// Initialise the WASM module
pm.init();

const ACTIVITY_KEY = 'concept:name';
const TIMESTAMP_KEY = 'time:timestamp';

// ── Synthetic log generation ──────────────────────────────────────────────────

/**
 * LCG pseudo-random generator (deterministic, same as Rust helpers.rs).
 */
function lcg(seed) {
  let s = BigInt(seed);
  return {
    next() {
      s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      return Number(s & 0x7fffffffffffffffn);
    },
    nextFloat() {
      return (this.next() >>> 11) / 2 ** 53;
    },
    nextMod(m) {
      return this.next() % m;
    },
  };
}

const ACTIVITIES = [
  'Register',
  'Validate',
  'Check_Completeness',
  'Check_Docs',
  'Assess_Risk',
  'Calculate_Fee',
  'Send_Invoice',
  'Wait_Payment',
  'Confirm_Payment',
  'Approve_Basic',
  'Approve_Senior',
  'Approve_Director',
  'Notify_Applicant',
  'Create_Record',
  'Archive',
  'Close',
  'Reject',
  'Escalate',
  'Return_Docs',
  'Reopen',
];

/**
 * Generate XES XML string for numCases cases with realistic variance.
 * Deterministic: same numCases always produces the same XML.
 */
function generateXES(numCases, numActivities = 12, avgEvents = 15, noiseFactor = 0.1) {
  const acts = ACTIVITIES.slice(0, numActivities);
  const rng = lcg(0xdeadbeefcafebabe);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<log xes.version="1.0" xes.features="nested-attributes">',
  ];

  for (let caseIdx = 0; caseIdx < numCases; caseIdx++) {
    lines.push('  <trace>');
    lines.push(`    <string key="concept:name" value="case_${caseIdx}"/>`);

    const lenFactor = 0.5 + rng.nextFloat();
    const numEvents = Math.max(2, Math.floor(avgEvents * lenFactor));

    for (let evtIdx = 0; evtIdx < numEvents; evtIdx++) {
      const baseIdx = evtIdx % acts.length;
      const actIdx = rng.nextFloat() < noiseFactor ? rng.nextMod(acts.length) : baseIdx;

      const hour = Math.floor(evtIdx / 60) % 24;
      const min = evtIdx % 60;
      const day = (caseIdx % 28) + 1;

      lines.push('    <event>');
      lines.push(`      <string key="concept:name" value="${acts[actIdx]}"/>`);
      lines.push(
        `      <date key="time:timestamp" value="2024-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000+00:00"/>`
      );
      lines.push('    </event>');
    }
    lines.push('  </trace>');
  }
  lines.push('</log>');
  return lines.join('\n');
}

// ── Algorithm dispatcher ──────────────────────────────────────────────────────

function callAlgorithm(name, handle, params) {
  switch (name) {
    case 'discover_dfg':
      return pm.discover_dfg(handle, params.activityKey || ACTIVITY_KEY);
    case 'discover_declare':
      return pm.discover_declare(handle, params.activityKey || ACTIVITY_KEY);
    case 'discover_heuristic_miner':
      return pm.discover_heuristic_miner(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.threshold ?? 0.5
      );
    case 'discover_alpha_plus_plus':
      return pm.discover_alpha_plus_plus(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.minSupport ?? 0.1
      );
    case 'discover_inductive_miner':
      return pm.discover_inductive_miner(handle, params.activityKey || ACTIVITY_KEY);
    case 'discover_hill_climbing':
      return pm.discover_hill_climbing(handle, params.activityKey || ACTIVITY_KEY);
    case 'extract_process_skeleton':
      return pm.extract_process_skeleton(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.minFreq ?? 2
      );
    case 'discover_astar':
      return pm.discover_astar(handle, params.activityKey || ACTIVITY_KEY, params.maxIter ?? 500);
    case 'discover_simulated_annealing':
      return pm.discover_simulated_annealing(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.temp ?? 100.0,
        params.cooling ?? 0.95
      );
    case 'discover_ant_colony':
      return pm.discover_ant_colony(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.ants ?? 20,
        params.iterations ?? 10
      );
    case 'discover_genetic_algorithm':
      return pm.discover_genetic_algorithm(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.popSize ?? 10,
        params.generations ?? 5
      );
    case 'discover_pso_algorithm':
      return pm.discover_pso_algorithm(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.swarm ?? 10,
        params.iterations ?? 10
      );
    case 'discover_ilp_petri_net':
      return pm.discover_ilp_petri_net(handle, params.activityKey || ACTIVITY_KEY);
    case 'analyze_trace_variants':
      return pm.analyze_trace_variants(handle, params.activityKey || ACTIVITY_KEY);
    case 'mine_sequential_patterns':
      return pm.mine_sequential_patterns(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.minSupport ?? 0.1,
        params.patternLen ?? 3
      );
    case 'detect_concept_drift':
      return pm.detect_concept_drift(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.windowSize ?? 50
      );
    case 'cluster_traces':
      return pm.cluster_traces(handle, params.activityKey || ACTIVITY_KEY, params.numClusters ?? 5);
    case 'analyze_variant_complexity':
      return pm.analyze_variant_complexity(handle, params.activityKey || ACTIVITY_KEY);
    case 'compute_activity_transition_matrix':
      return pm.compute_activity_transition_matrix(handle, params.activityKey || ACTIVITY_KEY);
    case 'detect_rework':
      return pm.detect_rework(handle, params.activityKey || ACTIVITY_KEY);
    case 'analyze_event_statistics':
      return pm.analyze_event_statistics(handle);
    default:
      throw new Error(`Unknown algorithm: ${name}`);
  }
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length * p) / 100)];
}

const { tasks, ciMode } = workerData;
const ITERATIONS = ciMode ? 3 : 7;
const results = [];

for (const task of tasks) {
  for (const size of task.sizes) {
    // Load log once per size
    const xes = generateXES(size, task.numActivities || 12);
    const handle = pm.load_eventlog_from_xes(xes);

    // Warmup
    try {
      callAlgorithm(task.algorithm, handle, task.params || {});
    } catch (_) {}

    // Timed runs
    const timings = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      try {
        callAlgorithm(task.algorithm, handle, task.params || {});
      } catch (_) {}
      timings.push(performance.now() - t0);
    }

    results.push({
      algorithm: task.algorithm,
      size,
      medianMs: median(timings),
      minMs: Math.min(...timings),
      maxMs: Math.max(...timings),
      p95Ms: percentile(timings, 95),
      iterations: ITERATIONS,
    });

    pm.clear_all_objects();
  }
}

parentPort.postMessage(results);
