'use strict';
/**
 * Example 3 — Fulfillment Process Bottleneck Discovery
 *
 * JTBD: "When throughput drops, I need to identify which fulfillment activity
 * is the constraint — in seconds, not after a data science team runs a
 * three-day analysis."
 *
 * Industry: E-commerce fulfillment operations
 * Algorithms: DFG discovery (self-loops = rework = throughput constraint)
 *             + rework detection (confirms which activity is the bottleneck)
 *
 * Run: node examples/03-fulfillment-bottleneck.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Fulfillment log: each trace = one customer order.
// QC Inspect has rework loops — the throughput bottleneck.
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
const handle  = wasm.load_eventlog_from_xes(FULFILLMENT_LOG);
const dfg     = parse(wasm.discover_dfg(handle, 'concept:name'));
const rework  = parse(wasm.detect_rework(handle, 'concept:name'));
const elapsed = (performance.now() - t0).toFixed(2);

// Self-loops in the DFG (from === to) reveal rework at specific activities
const selfLoops = dfg.edges.filter(e => e.from === e.to);
const traceCount = wasm.get_trace_count(handle);

console.log('=== Fulfillment Bottleneck Report ===');
console.log(`Orders analysed : ${traceCount}`);
console.log(`Activities      : ${dfg.nodes.length}`);
console.log(`Process edges   : ${dfg.edges.length}`);
console.log(`Rework loops    : ${selfLoops.length} self-loop(s) detected`);

if (selfLoops.length > 0) {
  // Rank by loop frequency descending
  const ranked = selfLoops.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  const top = ranked[0];
  const loopPct = ((top.frequency ?? 0) / traceCount * 100).toFixed(0);

  console.log(`\n  BOTTLENECK: "${top.from}"`);
  console.log(`  Rework frequency: ${top.frequency} re-executions across ${rework.traces_with_rework} of ${traceCount} orders (${rework.rework_percentage}%)`);
  console.log(`  Impact: ~${loopPct}% of orders pass through this station more than once`);
  console.log(`\n  → Capacity intervention options:`);
  console.log(`     1. Add parallel ${top.from} stations (reduces queue depth)`);
  console.log(`     2. Move defect detection upstream to Pack (prevents QC rejects)`);
  console.log(`     3. Set SLA alert when ${top.from} rework rate exceeds 20%`);
} else {
  console.log('\n  ✓ No rework bottleneck detected — process is flowing linearly');
}

console.log(`\nCompleted in ${elapsed} ms`);
