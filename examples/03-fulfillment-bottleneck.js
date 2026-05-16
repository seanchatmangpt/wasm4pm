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

const NAME = 'fulfillment';
const JTBD = 'Which station is the throughput constraint?';

function run(wasm, xes) {
  const parse   = r => (typeof r === 'string' ? JSON.parse(r) : r);
  const xesData = xes || FULFILLMENT_LOG;

  const t0      = performance.now();
  const handle  = wasm.load_eventlog_from_xes(xesData);
  const dfg     = parse(wasm.discover_dfg(handle, 'concept:name'));
  const rework  = parse(wasm.detect_rework(handle, 'concept:name'));
  const elapsed = (performance.now() - t0).toFixed(2);

  const traceCount = wasm.get_trace_count(handle);
  const selfLoops  = dfg.edges.filter(e => e.from === e.to);
  const ranked     = selfLoops.slice().sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  const top        = ranked[0] ?? null;

  const violations = top
    ? [`Bottleneck: "${top.from}" — ${top.frequency} re-executions across ${rework.traces_with_rework}/${traceCount} orders (${rework.rework_percentage}%)`]
    : [];

  return {
    name: NAME,
    jtbd: JTBD,
    violations,
    summary: {
      orders:             traceCount,
      activities:         dfg.nodes.length,
      edges:              dfg.edges.length,
      rework_loops:       selfLoops.length,
      traces_with_rework: rework.traces_with_rework,
      rework_percentage:  rework.rework_percentage,
      bottleneck: top ? { activity: top.from, frequency: top.frequency } : null,
    },
    findings: { self_loops: selfLoops, rework },
    compliant: selfLoops.length === 0,
    elapsed_ms: parseFloat(elapsed),
  };
}

module.exports = { run, name: NAME, jtbd: JTBD };

if (require.main === module) {
  const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
  wasm.init();
  const result  = run(wasm, null);
  const { summary } = result;

  console.log('=== Fulfillment Bottleneck Report ===');
  console.log(`Orders analysed : ${summary.orders}`);
  console.log(`Activities      : ${summary.activities}`);
  console.log(`Process edges   : ${summary.edges}`);
  console.log(`Rework loops    : ${summary.rework_loops} self-loop(s) detected`);

  if (summary.rework_loops > 0) {
    const top     = summary.bottleneck;
    const loopPct = ((top.frequency ?? 0) / summary.orders * 100).toFixed(0);
    console.log(`\n  BOTTLENECK: "${top.activity}"`);
    console.log(`  Rework frequency: ${top.frequency} re-executions across ${summary.traces_with_rework} of ${summary.orders} orders (${summary.rework_percentage}%)`);
    console.log(`  Impact: ~${loopPct}% of orders pass through this station more than once`);
    console.log(`\n  → Capacity intervention options:`);
    console.log(`     1. Add parallel ${top.activity} stations (reduces queue depth)`);
    console.log(`     2. Move defect detection upstream to Pack (prevents QC rejects)`);
    console.log(`     3. Set SLA alert when ${top.activity} rework rate exceeds 20%`);
  } else {
    console.log('\n  ✓ No rework bottleneck detected — process is flowing linearly');
  }

  console.log(`\nCompleted in ${result.elapsed_ms.toFixed(2)} ms`);
}
