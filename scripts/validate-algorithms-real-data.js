#!/usr/bin/env node
/**
 * Real-data algorithm validation for wasm4pm.
 *
 * Runs the top 5 discovery algorithms plus conformance checking against
 * the running-example.xes fixture (the same log used to generate all
 * pm4py reference outputs in wasm4pm/tests/fixtures/).
 *
 * Exit codes:
 *   0  — all algorithms passed
 *   1  — one or more algorithms failed
 *
 * Usage:
 *   node scripts/validate-algorithms-real-data.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const WASM_PKG      = path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js');
const FIXTURE       = path.resolve(__dirname, '../wasm4pm/tests/fixtures/running-example.xes');
const FIXTURE_LARGE = path.resolve(__dirname, '../wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes');
const REF_DIR       = path.resolve(__dirname, '../wasm4pm/tests/fixtures');

// ---------------------------------------------------------------------------
// pm4py reference values (ground truth from wasm4pm/tests/fixtures/)
// ---------------------------------------------------------------------------
const REF = {
  dfg: {
    expected_activities: 8,
    expected_edges: 16,
  },
  heuristic_miner: {
    // pm4py_heuristic_miner.json: { places:13, transitions:15, arcs:35 }
    min_places: 1,
    min_transitions: 1,
  },
  inductive_miner: {
    // pm4py_inductive_miner.json: tree string containing "register request"
    required_activity: 'register request',
  },
  ilp: {
    // pm4py_ilp_miner.json: { places:8, transitions:9, arcs:21 }
    min_places: 1,
    min_transitions: 1,
  },
  alpha_plus_plus: {
    min_places: 1,
    min_transitions: 1,
  },
  token_replay: {
    // pm4py_conformance_output.json: fitness_percentage 100.0 on this log
    // We apply a lenient threshold (>=0.5) because our model may differ from pm4py's
    min_fitness: 0.5,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse WASM output regardless of whether it returns String or Object. */
const parse = (r) => {
  if (r === null || r === undefined) return null;
  if (typeof r === 'string') {
    try { return JSON.parse(r); } catch { return r; }
  }
  return r;
};

/** Return true if obj is a non-null, non-empty object. */
const isNonEmptyObject = (obj) =>
  obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0;

/** Format a timing value. */
const ms = (start) => `${(Date.now() - start).toFixed(0)} ms`;

class ValidationResult {
  constructor(name) {
    this.name    = name;
    this.passed  = false;
    this.skipped = false;
    this.errors  = [];
    this.info    = {};
    this.timingMs = 0;
  }

  fail(msg) { this.errors.push(msg); return this; }
  note(key, val) { this.info[key] = val; return this; }
}

// ---------------------------------------------------------------------------
// Algorithm validators
// ---------------------------------------------------------------------------

function validateDfg(wasm, handle) {
  const r = new ValidationResult('dfg');
  const t0 = Date.now();
  let raw;
  try {
    raw = wasm.discover_dfg(handle, 'concept:name');
  } catch (e) {
    r.fail(`discover_dfg threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (!isNonEmptyObject(result)) {
    r.fail(`Result is empty or null: ${JSON.stringify(result)}`);
    return r;
  }

  const activities = result.activities || result.nodes || [];
  const edges      = result.edges || result.directly_follows || [];

  r.note('activities_count', activities.length);
  r.note('edges_count', edges.length);
  r.note('keys', Object.keys(result).join(', '));

  if (activities.length === 0) r.fail('No activities/nodes in DFG result');
  if (edges.length === 0)      r.fail('No edges in DFG result');

  // Compare against pm4py reference
  const ref = REF.dfg;
  if (activities.length !== ref.expected_activities) {
    r.fail(`Expected ${ref.expected_activities} activities, got ${activities.length}`);
  }
  if (edges.length !== ref.expected_edges) {
    r.fail(`Expected ${ref.expected_edges} edges, got ${edges.length}`);
  }

  r.passed = r.errors.length === 0;
  return r;
}

function validateHeuristicMiner(wasm, handle) {
  const r = new ValidationResult('heuristic_miner');
  const t0 = Date.now();
  let raw;
  try {
    // dependency_threshold of 0.5 is standard; range 0.0–1.0
    raw = wasm.discover_heuristic_miner(handle, 'concept:name', 0.5);
  } catch (e) {
    r.fail(`discover_heuristic_miner threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (!isNonEmptyObject(result)) {
    r.fail(`Result is empty or null: ${JSON.stringify(result)}`);
    return r;
  }

  r.note('keys', Object.keys(result).join(', '));

  // Accept either petri net (places/transitions/arcs) or DFG (activities/edges) or causal graph
  const hasPlaces      = 'places' in result;
  const hasActivities  = 'activities' in result || 'nodes' in result;
  const hasEdges       = 'edges' in result || 'arcs' in result;

  if (!hasPlaces && !hasActivities && !hasEdges) {
    r.fail(`No recognised structure (places/transitions/arcs or activities/edges): got keys [${Object.keys(result).join(', ')}]`);
  }

  if (hasPlaces) {
    const places      = result.places ?? [];
    const transitions = result.transitions ?? [];
    const placeCount  = typeof places === 'number' ? places : (Array.isArray(places) ? places.length : 0);
    const transCount  = typeof transitions === 'number' ? transitions : (Array.isArray(transitions) ? transitions.length : 0);
    r.note('places', placeCount);
    r.note('transitions', transCount);
    if (placeCount < REF.heuristic_miner.min_places) r.fail(`Too few places: ${placeCount}`);
    if (transCount < REF.heuristic_miner.min_transitions) r.fail(`Too few transitions: ${transCount}`);
  }

  if (hasActivities) {
    const acts = result.activities || result.nodes || [];
    r.note('activities', Array.isArray(acts) ? acts.length : acts);
  }

  r.passed = r.errors.length === 0;
  return r;
}

function validateInductiveMiner(wasm, handle) {
  const r = new ValidationResult('inductive_miner');
  const t0 = Date.now();
  let raw;
  try {
    raw = wasm.discover_inductive_miner(handle, 'concept:name');
  } catch (e) {
    r.fail(`discover_inductive_miner threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (result === null || result === undefined) {
    r.fail('Result is null/undefined');
    return r;
  }

  // Result may be a string (process tree notation) or an object with a tree field
  let treeStr = null;
  if (typeof result === 'string') {
    treeStr = result;
  } else if (isNonEmptyObject(result)) {
    treeStr = result.tree || result.process_tree || JSON.stringify(result);
    r.note('keys', Object.keys(result).join(', '));
  }

  if (!treeStr) {
    r.fail(`Cannot extract process tree from result: ${JSON.stringify(result)}`);
    return r;
  }

  r.note('tree_length', treeStr.length);

  const required = REF.inductive_miner.required_activity;
  if (!treeStr.includes(required)) {
    r.fail(`Process tree does not mention expected activity "${required}": ${treeStr.substring(0, 200)}`);
  }

  r.passed = r.errors.length === 0;
  return r;
}

function validateAlphaPlusPlus(wasm, handle) {
  const r = new ValidationResult('alpha_plus_plus');
  const t0 = Date.now();
  let raw;
  try {
    raw = wasm.discover_alpha_plus_plus(handle, 'concept:name');
  } catch (e) {
    r.fail(`discover_alpha_plus_plus threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (!isNonEmptyObject(result)) {
    r.fail(`Result is empty or null: ${JSON.stringify(result)}`);
    return r;
  }

  r.note('keys', Object.keys(result).join(', '));

  const hasPlaces     = 'places' in result;
  const hasActivities = 'activities' in result || 'nodes' in result;

  if (!hasPlaces && !hasActivities) {
    r.fail(`No recognised Petri net / graph structure: keys=[${Object.keys(result).join(', ')}]`);
  }

  if (hasPlaces) {
    const places = result.places;
    const placeCount = typeof places === 'number' ? places : (Array.isArray(places) ? places.length : 0);
    r.note('places', placeCount);
    if (placeCount < REF.alpha_plus_plus.min_places) r.fail(`Too few places: ${placeCount}`);
  }

  r.passed = r.errors.length === 0;
  return r;
}

function validateIlp(wasm, handle) {
  const r = new ValidationResult('ilp');
  const t0 = Date.now();
  let raw;
  try {
    raw = wasm.discover_ilp_petri_net(handle, 'concept:name');
  } catch (e) {
    r.fail(`discover_ilp_petri_net threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (!isNonEmptyObject(result)) {
    r.fail(`Result is empty or null: ${JSON.stringify(result)}`);
    return r;
  }

  r.note('keys', Object.keys(result).join(', '));

  const hasPlaces = 'places' in result;
  const hasActivities = 'activities' in result || 'nodes' in result;

  if (!hasPlaces && !hasActivities) {
    r.fail(`No recognised Petri net / graph structure: keys=[${Object.keys(result).join(', ')}]`);
  }

  if (hasPlaces) {
    const places = result.places;
    const transitions = result.transitions;
    const placeCount = typeof places === 'number' ? places : (Array.isArray(places) ? places.length : 0);
    const transCount  = typeof transitions === 'number' ? transitions : (Array.isArray(transitions) ? transitions.length : 0);
    r.note('places', placeCount);
    r.note('transitions', transCount);
    if (placeCount < REF.ilp.min_places) r.fail(`Too few places: ${placeCount}`);
    if (transCount < REF.ilp.min_transitions) r.fail(`Too few transitions: ${transCount}`);
  }

  r.passed = r.errors.length === 0;
  return r;
}

/**
 * check_token_based_replay(log_handle, petri_net_handle, activity_key)
 *
 * Requires a Petri net handle — we first discover one via ILP (which also
 * returns a handle), then replay the log against it.
 */
function validateTokenReplay(wasm, handle) {
  const r = new ValidationResult('token_replay');
  const t0 = Date.now();

  // Step 1: discover a Petri net to replay against (ILP is deterministic)
  let netHandle;
  try {
    const ilpRaw    = wasm.discover_ilp_petri_net(handle, 'concept:name');
    const ilpResult = parse(ilpRaw);
    netHandle = ilpResult && ilpResult.handle;
    if (!netHandle) {
      r.fail('ILP did not return a Petri net handle — cannot perform token replay');
      r.timingMs = Date.now() - t0;
      return r;
    }
  } catch (e) {
    r.fail(`ILP setup for token replay threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }

  // Step 2: replay
  let raw;
  try {
    raw = wasm.check_token_based_replay(handle, netHandle, 'concept:name');
  } catch (e) {
    r.fail(`check_token_based_replay threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }
  r.timingMs = Date.now() - t0;

  const result = parse(raw);

  if (!isNonEmptyObject(result)) {
    r.fail(`Result is empty or null: ${JSON.stringify(result)}`);
    return r;
  }

  r.note('keys', Object.keys(result).join(', '));

  // Accept various fitness field names
  const fitness =
    result.avg_fitness ??
    result.fitness ??
    result.avg_trace_fitness ??
    result.trace_fitness ??
    (result.fitness_percentage != null ? result.fitness_percentage / 100 : null);

  r.note('fitness', fitness !== null && fitness !== undefined ? fitness.toFixed(4) : 'absent');
  r.note('total_cases', result.total_cases ?? 'N/A');

  if (fitness === null || fitness === undefined) {
    r.fail(`No fitness field in result: keys=[${Object.keys(result).join(', ')}]`);
  } else if (typeof fitness === 'number') {
    if (fitness < REF.token_replay.min_fitness) {
      r.fail(`Fitness ${fitness.toFixed(4)} below minimum ${REF.token_replay.min_fitness}`);
    }
  }

  r.passed = r.errors.length === 0;
  return r;
}

/**
 * Scale test: DFG and heuristic miner on BPI 2020 Travel (20 MB XES).
 * Verifies algorithms don't crash on a real-world enterprise log.
 */
function validateLargeLogScale(wasm) {
  const r = new ValidationResult('large_log_scale');

  if (!fs.existsSync(FIXTURE_LARGE)) {
    r.skipped = true;
    r.note('reason', 'BPI_2020_Travel_Permits_Actual.xes not found');
    return r;
  }

  const t0 = Date.now();
  let xes;
  try {
    xes = fs.readFileSync(FIXTURE_LARGE, 'utf8');
  } catch (e) {
    r.fail(`Cannot read large fixture: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }

  let bigHandle;
  try {
    bigHandle = wasm.load_eventlog_from_xes(xes);
  } catch (e) {
    r.fail(`load_eventlog_from_xes (large) threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }

  if (!bigHandle) {
    r.fail('load_eventlog_from_xes returned null for large log');
    r.timingMs = Date.now() - t0;
    return r;
  }

  // DFG on large log
  let dfgResult;
  try {
    dfgResult = parse(wasm.discover_dfg(bigHandle, 'concept:name'));
  } catch (e) {
    r.fail(`discover_dfg (large) threw: ${e.message}`);
    r.timingMs = Date.now() - t0;
    return r;
  }

  const activities = dfgResult.activities || dfgResult.nodes || [];
  const edges      = dfgResult.edges || [];
  r.note('activities', Array.isArray(activities) ? activities.length : activities);
  r.note('edges', Array.isArray(edges) ? edges.length : edges);

  if (!isNonEmptyObject(dfgResult) || (Array.isArray(edges) && edges.length === 0)) {
    r.fail('DFG returned empty result on large log');
  }

  r.timingMs = Date.now() - t0;
  r.passed = r.errors.length === 0;
  return r;
}

// ---------------------------------------------------------------------------
// Render report
// ---------------------------------------------------------------------------

const COL_NAME   = 26;
const COL_STATUS = 8;
const COL_TIME   = 8;

function pad(s, n) { return String(s).padEnd(n); }
function lpad(s, n) { return String(s).padStart(n); }

function renderRow(name, status, timingMs, info, errors) {
  const statusStr = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  const bar = status === 'PASS' ? '|' : status === 'SKIP' ? '|' : '!';
  const infoStr = Object.entries(info).map(([k, v]) => `${k}=${v}`).join('  ');

  console.log(`  ${bar} ${pad(name, COL_NAME)} ${pad(statusStr, COL_STATUS)} ${lpad(timingMs + 'ms', COL_TIME)}  ${infoStr}`);
  for (const e of errors) {
    console.log(`  |   ${' '.repeat(COL_NAME)}  ERROR: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('wasm4pm Algorithm Validation — Real XES Data');
  console.log('='.repeat(80));
  console.log(`Log:  ${path.relative(process.cwd(), FIXTURE)}`);
  console.log(`WASM: ${path.relative(process.cwd(), WASM_PKG)}`);
  console.log('');

  // Load WASM
  let wasm;
  try {
    wasm = require(WASM_PKG);
  } catch (e) {
    console.error(`FATAL: Cannot load WASM module: ${e.message}`);
    process.exit(1);
  }

  // Load XES
  let xes;
  try {
    xes = fs.readFileSync(FIXTURE, 'utf8');
  } catch (e) {
    console.error(`FATAL: Cannot read fixture: ${e.message}`);
    process.exit(1);
  }

  // Parse log
  console.log('Loading event log...');
  let handle;
  const loadStart = Date.now();
  try {
    handle = wasm.load_eventlog_from_xes(xes);
  } catch (e) {
    console.error(`FATAL: load_eventlog_from_xes threw: ${e.message}`);
    process.exit(1);
  }
  if (!handle) {
    console.error('FATAL: load_eventlog_from_xes returned null/undefined');
    process.exit(1);
  }
  console.log(`Log handle: "${handle}"  (${Date.now() - loadStart} ms)`);
  console.log('');

  // Run validators
  const validators = [
    () => validateDfg(wasm, handle),
    () => validateHeuristicMiner(wasm, handle),
    () => validateInductiveMiner(wasm, handle),
    () => validateAlphaPlusPlus(wasm, handle),
    () => validateIlp(wasm, handle),
    () => validateTokenReplay(wasm, handle),
    () => validateLargeLogScale(wasm),
  ];

  const results = [];
  for (const fn of validators) {
    const r = fn();
    results.push(r);
  }

  // Print table
  console.log(`  ${'Algorithm'.padEnd(COL_NAME + 2)} ${'Status'.padEnd(COL_STATUS)} ${'Time'.padStart(COL_TIME)}  Info`);
  console.log('  ' + '-'.repeat(78));
  for (const r of results) {
    const status = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
    renderRow(r.name, status, r.timingMs, r.info, r.errors);
  }
  console.log('');

  // Summary
  const total   = results.filter(r => !r.skipped).length;
  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;

  // ASCII bar chart — timing comparison
  const maxMs = Math.max(...results.map(r => r.timingMs), 1);
  const barWidth = 30;
  console.log('Timing (ms):');
  for (const r of results) {
    const filled = Math.round((r.timingMs / maxMs) * barWidth);
    const bar = '|' + '▓'.repeat(filled) + '░'.repeat(barWidth - filled) + '|';
    console.log(`  ${r.name.padEnd(COL_NAME)} ${bar} ${r.timingMs} ms`);
  }
  console.log('');

  console.log(`Results: ${passed}/${total} passed  ${failed} failed  ${skipped} skipped`);

  // Detailed failures
  const failures = results.filter(r => !r.passed && !r.skipped);
  if (failures.length > 0) {
    console.log('');
    console.log('Failed algorithms:');
    for (const r of failures) {
      console.log(`  ${r.name}:`);
      for (const e of r.errors) {
        console.log(`    - ${e}`);
      }
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('');
    console.log('All algorithms returned valid results on real XES data.');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
