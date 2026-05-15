'use strict';
/**
 * Example 1 — Supply Chain Process Drift Detection
 *
 * JTBD: "When I receive supplier audit data, I need to know which suppliers
 * have drifted from our process standard before the deviation becomes a
 * quality escape."
 *
 * Industry: Consumer electronics manufacturing (supplier qualification)
 * Algorithm: Jaccard-distance concept drift detection across sliding windows
 *
 * Run: node examples/01-supply-chain-drift.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Supplier audit log: each trace = one supplier audit cycle.
// Early cycles follow the approved process; later cycles show drift
// (component inspection dropped, final sign-off reordered).
const AUDIT_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="Supplier-A-Q1"/>
    <event><string key="concept:name" value="Incoming Inspection"/></event>
    <event><string key="concept:name" value="Component Test"/></event>
    <event><string key="concept:name" value="Yield Review"/></event>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
  <trace><string key="concept:name" value="Supplier-A-Q2"/>
    <event><string key="concept:name" value="Incoming Inspection"/></event>
    <event><string key="concept:name" value="Component Test"/></event>
    <event><string key="concept:name" value="Yield Review"/></event>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
  <trace><string key="concept:name" value="Supplier-A-Q3"/>
    <event><string key="concept:name" value="Incoming Inspection"/></event>
    <event><string key="concept:name" value="Yield Review"/></event>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
  <trace><string key="concept:name" value="Supplier-B-Q1"/>
    <event><string key="concept:name" value="Incoming Inspection"/></event>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
  <trace><string key="concept:name" value="Supplier-B-Q2"/>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
  <trace><string key="concept:name" value="Supplier-B-Q3"/>
    <event><string key="concept:name" value="Incoming Inspection"/></event>
    <event><string key="concept:name" value="Component Test"/></event>
    <event><string key="concept:name" value="Approved"/></event>
  </trace>
</log>`;

const t0 = performance.now();
const handle = parse(wasm.load_eventlog_from_xes(AUDIT_LOG));
const drift  = parse(wasm.detect_drift(handle, 'concept:name', 2));
const dfg    = parse(wasm.discover_dfg(handle, 'concept:name'));
const elapsed = (performance.now() - t0).toFixed(2);

console.log('=== Supply Chain Drift Report ===');
console.log(`Traces analysed : ${dfg.trace_count ?? dfg.num_traces ?? Object.keys(dfg).length}`);
console.log(`Drift windows   : ${drift.drifts_detected}`);

if (drift.drifts_detected > 0) {
  drift.drifts.forEach(d => {
    console.log(`  ⚠  Window at trace #${d.position}: Jaccard distance ${d.distance.toFixed(3)} — process changed`);
  });
} else {
  console.log('  ✓ No significant drift detected');
}

const edges = dfg.edges ?? dfg.directly_follows ?? [];
const baseline = ['Incoming Inspection', 'Component Test', 'Yield Review', 'Approved'];
const present = new Set(Object.values(dfg.activities ?? {}).map(a => a.name ?? a).concat(
  edges.flatMap(e => [e.source ?? e.from, e.target ?? e.to])
));
const missing = baseline.filter(a => !present.has(a));
if (missing.length) {
  console.log(`\n  Missing from process graph: ${missing.join(', ')}`);
  console.log('  → Escalate to Supplier Quality for root-cause review');
} else {
  console.log('\n  All baseline activities present in process graph');
}

console.log(`\nCompleted in ${elapsed} ms`);
