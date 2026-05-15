'use strict';
/**
 * Example 3 — Fulfillment Process Bottleneck Discovery
 *
 * JTBD: "When throughput drops, I need to identify which fulfillment activity
 * is the constraint — in seconds, not after a data science team runs a
 * three-day analysis."
 *
 * Industry: E-commerce fulfillment operations
 * Algorithm: Heuristic miner — discovers the directly-follows graph weighted
 *            by dependency strength, exposing weak links (bottlenecks)
 *
 * Run: node examples/03-fulfillment-bottleneck.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Fulfillment log: each trace = one customer order lifecycle.
// QC Inspect has high rework (appears multiple times) — the bottleneck.
const FULFILLMENT_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="ORD-1001"/>
    <event><string key="concept:name" value="Pick"/></event>
    <event><string key="concept:name" value="Pack"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="Ship"/></event>
  </trace>
  <trace><string key="concept:name" value="ORD-1002"/>
    <event><string key="concept:name" value="Pick"/></event>
    <event><string key="concept:name" value="Pack"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="Ship"/></event>
  </trace>
  <trace><string key="concept:name" value="ORD-1003"/>
    <event><string key="concept:name" value="Pick"/></event>
    <event><string key="concept:name" value="Pack"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="Repack"/></event>
    <event><string key="concept:name" value="Ship"/></event>
  </trace>
  <trace><string key="concept:name" value="ORD-1004"/>
    <event><string key="concept:name" value="Pick"/></event>
    <event><string key="concept:name" value="Pack"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="Ship"/></event>
  </trace>
  <trace><string key="concept:name" value="ORD-1005"/>
    <event><string key="concept:name" value="Pick"/></event>
    <event><string key="concept:name" value="Pack"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="QC Inspect"/></event>
    <event><string key="concept:name" value="Repack"/></event>
    <event><string key="concept:name" value="Ship"/></event>
  </trace>
</log>`;

const t0 = performance.now();
const handle  = parse(wasm.load_eventlog_from_xes(FULFILLMENT_LOG));
const dfg     = parse(wasm.discover_heuristic_miner(handle, 'concept:name', 0.2));
const elapsed = (performance.now() - t0).toFixed(2);

// Count self-loops (rework) per activity — highest = bottleneck
const edges = dfg.edges ?? dfg.directly_follows ?? dfg.dfg_edges ?? [];
const rework = {};
for (const e of edges) {
  const src = e.source ?? e.from ?? e[0];
  const tgt = e.target ?? e.to ?? e[1];
  if (src === tgt) rework[src] = (rework[src] ?? 0) + (e.frequency ?? e.count ?? 1);
}

// Activity totals
const freq = {};
for (const e of edges) {
  const src = e.source ?? e.from ?? e[0];
  freq[src] = (freq[src] ?? 0) + (e.frequency ?? e.count ?? 1);
}

const bottleneck = Object.entries(rework).sort((a, b) => b[1] - a[1])[0];

console.log('=== Fulfillment Bottleneck Report ===');
console.log(`Activities found: ${Object.keys(freq).length}`);
console.log(`Edges in model  : ${edges.length}`);

if (bottleneck) {
  const [activity, loops] = bottleneck;
  const pct = ((loops / (freq[activity] ?? loops)) * 100).toFixed(0);
  console.log(`\n  BOTTLENECK: "${activity}"`);
  console.log(`  Rework loops  : ${loops} (${pct}% of this activity's executions are repeats)`);
  console.log(`  → Rebalance station capacity or add parallel QC lanes`);
} else {
  console.log('\n  ✓ No significant rework bottleneck detected');
}

console.log(`\nCompleted in ${elapsed} ms`);
