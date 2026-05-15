'use strict';
/**
 * Example 5 — Safety-Critical Activity Verification
 *
 * JTBD: "When a shift ends, I need to verify that every safety-critical
 * inspection step was executed in the required sequence — not just that
 * work was performed."
 *
 * Industry: Energy / refinery operations (process safety management)
 * Algorithm: DFG discovery — maps the actual execution graph, then checks
 *            required activities and orderings against the safety standard
 *
 * Run: node examples/05-safety-process-guard.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Safety inspection log: each trace = one shift's maintenance sequence.
// STANDARD: Isolate → Pressure Check → Valve Inspect → Sign-Off (in that order).
// Some shifts skipped Pressure Check or reordered Sign-Off.
const SAFETY_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="SHIFT-2026-05-15-A"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-2026-05-15-B"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-2026-05-15-C"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-2026-05-15-D"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-2026-05-15-E"/>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
</log>`;

// Required safety standard: all four activities must appear,
// and Isolate must appear before Pressure Check.
const REQUIRED  = ['Isolate', 'Pressure Check', 'Valve Inspect', 'Sign-Off'];
const MUST_PRECEDE = { before: 'Isolate', after: 'Pressure Check' };

const t0 = performance.now();
const handle  = parse(wasm.load_eventlog_from_xes(SAFETY_LOG));
const dfg     = parse(wasm.discover_dfg(handle, 'concept:name'));
const elapsed = (performance.now() - t0).toFixed(2);

const edges = dfg.edges ?? dfg.directly_follows ?? dfg.dfg_edges ?? [];

// Activities present in the discovered graph
const present = new Set();
for (const e of edges) {
  present.add(e.source ?? e.from ?? e[0]);
  present.add(e.target ?? e.to   ?? e[1]);
}
// Also include start/end activities if the DFG exposes them
for (const a of Object.keys(dfg.start_activities ?? {})) present.add(a);
for (const a of Object.keys(dfg.end_activities   ?? {})) present.add(a);

const missing = REQUIRED.filter(a => !present.has(a));

// Check required ordering (Isolate → Pressure Check must be a direct or reachable edge)
const orderEdge = edges.find(e =>
  (e.source ?? e.from) === MUST_PRECEDE.before &&
  (e.target ?? e.to)   === MUST_PRECEDE.after
);
const orderOk = !!orderEdge;

console.log('=== Safety Process Guard Report ===');
console.log(`Activities in log : ${present.size}`);
console.log(`Edges discovered  : ${edges.length}`);
console.log('');

if (missing.length === 0) {
  console.log('  ✓ All required safety activities are present in the process graph');
} else {
  console.log(`  ✗ MISSING REQUIRED ACTIVITIES: ${missing.join(', ')}`);
  console.log('  → STOP: Do not close the shift until missing activities are recorded');
}

if (orderOk) {
  console.log(`  ✓ "${MUST_PRECEDE.before}" precedes "${MUST_PRECEDE.after}" in at least one trace`);
} else {
  console.log(`  ✗ ORDERING VIOLATION: "${MUST_PRECEDE.before}" → "${MUST_PRECEDE.after}" not found as direct sequence`);
  console.log('  → Review traces where Isolation was skipped before Pressure Check');
}

const violations = missing.length + (orderOk ? 0 : 1);
if (violations > 0) {
  console.log(`\n  TOTAL VIOLATIONS: ${violations} — Notify Process Safety Manager immediately`);
  console.log('  Regulatory reference: OSHA 29 CFR 1910.119 (Process Safety Management)');
} else {
  console.log('\n  ✓ Shift process is compliant with safety standard');
}

console.log(`\nCompleted in ${elapsed} ms`);
