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

const NAME = 'supply-chain';
const JTBD = 'Which suppliers have drifted from the qualification process?';
const REQUIRED_ACTIVITIES = ['Incoming Inspection', 'Component Test', 'Yield Review', 'Approved'];

function run(wasm, xes) {
  const parse   = r => (typeof r === 'string' ? JSON.parse(r) : r);
  const xesData = xes || AUDIT_LOG;

  const t0      = performance.now();
  const handle  = wasm.load_eventlog_from_xes(xesData);
  const drift   = parse(wasm.detect_drift(handle, 'concept:name', 2));
  const dfg     = parse(wasm.discover_dfg(handle, 'concept:name'));
  const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
  const elapsed = (performance.now() - t0).toFixed(2);

  const traceCount    = wasm.get_trace_count(handle);
  const activityCount = dfg.nodes.length;
  const driftEvents   = drift.drifts ?? [];
  const highDrift     = driftEvents.filter(d => (d.distance ?? 0) > 0.5);
  const present       = new Set(dfg.nodes.map(n => n.id ?? n.label));
  const missing       = REQUIRED_ACTIVITIES.filter(a => !present.has(a));
  const low           = dfg.nodes.filter(n => (n.frequency ?? 0) < traceCount * 0.5);

  const violations = [
    ...highDrift.map(d => `Drift at trace #${d.position}: Jaccard ${d.distance.toFixed(3)} — activity set changed`),
    ...missing.map(a => `Required activity absent from all traces: ${a}`),
  ];

  return {
    name: NAME,
    jtbd: JTBD,
    violations,
    summary: {
      traces:               traceCount,
      variants:             variants.total_variants,
      drift_windows:        drift.drifts_detected ?? 0,
      high_drift_windows:   highDrift.length,
      activities_in_graph:  activityCount,
      missing_required:     missing,
      low_frequency:        low.map(n => `${n.id ?? n.label}(${n.frequency ?? '?'})`),
    },
    findings: { drifts: driftEvents, missing, low_frequency: low },
    compliant: violations.length === 0,
    elapsed_ms: parseFloat(elapsed),
  };
}

module.exports = { run, name: NAME, jtbd: JTBD };

if (require.main === module) {
  const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
  wasm.init();
  const result = run(wasm, null);
  const { summary, findings } = result;

  console.log('=== Supply Chain Drift Report ===');
  console.log(`Traces analysed  : ${summary.traces}`);
  console.log(`Distinct variants: ${summary.variants} (${summary.variants === 1 ? '✓ fully consistent' : '⚠ process variation detected'})`);
  console.log(`Drift windows    : ${summary.drift_windows}`);

  if (summary.drift_windows > 0) {
    findings.drifts.forEach(d => {
      console.log(`  ⚠  Window at trace #${d.position}: Jaccard distance ${d.distance.toFixed(3)} — activity set changed`);
    });
  } else {
    console.log('  ✓ No significant drift detected');
  }

  console.log(`\nBaseline activities in graph: ${summary.activities_in_graph}`);
  if (summary.missing_required.length) {
    console.log(`  ✗ NOT SEEN ANYWHERE: ${summary.missing_required.join(', ')}`);
  }
  if (summary.low_frequency.length) {
    console.log(`  ⚠  Low-frequency activities (< 50% of traces): ${summary.low_frequency.join(', ')}`);
    console.log('  → Escalate to Supplier Quality for root-cause review');
  } else {
    console.log('  ✓ All baseline activities appear in majority of traces');
  }

  console.log(`\nCompleted in ${result.elapsed_ms.toFixed(2)} ms`);
}
