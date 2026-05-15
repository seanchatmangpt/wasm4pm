'use strict';
/**
 * Example 2 — Autonomous Cloud Incident Health Triage
 *
 * JTBD: "When an incident fires, I need to know the process health severity
 * and which monitoring strategy to activate — before an on-call engineer
 * has opened their laptop."
 *
 * Industry: Hyperscale cloud operations (SRE / incident response)
 * Algorithms: Rework detection (retry rate) + variant analysis (process stability)
 *
 * Run: node examples/02-incident-triage.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Incident response log: each trace = one service incident lifecycle.
// Healthy incidents auto-resolve; degraded incidents show retries and escalations.
const INCIDENT_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="INC-0041"/>
    <event><string key="concept:name" value="Alert Fired"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Resolved"/></event>
  </trace>
  <trace><string key="concept:name" value="INC-0042"/>
    <event><string key="concept:name" value="Alert Fired"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Resolved"/></event>
  </trace>
  <trace><string key="concept:name" value="INC-0043"/>
    <event><string key="concept:name" value="Alert Fired"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Page On-Call"/></event>
    <event><string key="concept:name" value="Manual Rollback"/></event>
    <event><string key="concept:name" value="Resolved"/></event>
  </trace>
  <trace><string key="concept:name" value="INC-0044"/>
    <event><string key="concept:name" value="Alert Fired"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Auto-Remediate"/></event>
    <event><string key="concept:name" value="Page On-Call"/></event>
    <event><string key="concept:name" value="Escalate to L2"/></event>
    <event><string key="concept:name" value="Resolved"/></event>
  </trace>
</log>`;

const t0 = performance.now();
const handle   = wasm.load_eventlog_from_xes(INCIDENT_LOG);
const rework   = parse(wasm.detect_rework(handle, 'concept:name'));
const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
const elapsed  = (performance.now() - t0).toFixed(2);

// Derive a 0–4 health level from operational signals:
//   rework_percentage drives degradation; variant explosion signals instability
const retryRate      = rework.rework_percentage ?? 0;          // % traces with retries
const variantCount   = variants.total_variants ?? 1;
const topVariantPct  = variants.top_variants?.[0]?.percentage ?? 100;  // dominant path coverage

// Health scoring: high retry rate or many variants = degraded
let healthLevel = 0;
if (retryRate > 70 || variantCount > 4)  healthLevel = 3; // Critical
else if (retryRate > 40 || variantCount > 2) healthLevel = 2; // Degraded
else if (retryRate > 10 || variantCount > 1) healthLevel = 1; // Warning

const HEALTH_LABELS   = ['Normal ✓', 'Warning △', 'Degraded ⚠', 'Critical ✗', 'Failed ✗'];
const RUNBOOK_BY_LEVEL = [
  'Continue automated remediation',
  'Monitor for 10 min; prepare on-call brief',
  'Page on-call now — activate INCIDENT-RUNBOOK-P2',
  'Declare P1; assemble war room — activate INCIDENT-RUNBOOK-P1',
  'Engage executive escalation path',
];

console.log('=== Incident Health Triage ===');
console.log(`Health level    : ${healthLevel}/4  (${HEALTH_LABELS[healthLevel]})`);
console.log(`Retry rate      : ${retryRate}% of incidents required repeated remediation`);
console.log(`Process variants: ${variantCount} distinct paths (dominant: ${topVariantPct.toFixed(0)}% of cases)`);

if (rework.rework_by_activity?.length) {
  const hotspot = rework.rework_by_activity[0];
  console.log(`Retry hotspot   : "${hotspot[0]}" (${hotspot[1]} repeated execution${hotspot[1] !== 1 ? 's' : ''})`);
}

console.log(`\n  → ${RUNBOOK_BY_LEVEL[healthLevel]}`);

if (variantCount > 1) {
  console.log('\n  Top response paths:');
  variants.top_variants.slice(0, 3).forEach((v, i) => {
    console.log(`    ${i + 1}. ${v.path.join(' → ')}  (${v.percentage.toFixed(0)}%)`);
  });
}

console.log(`\nCompleted in ${elapsed} ms`);
