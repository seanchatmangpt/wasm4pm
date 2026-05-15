'use strict';
/**
 * Example 2 — Autonomous Cloud Incident Health Triage
 *
 * JTBD: "When an incident fires, I need to know the process health severity
 * and which monitoring strategy to activate — before an on-call engineer
 * has opened their laptop."
 *
 * Industry: Hyperscale cloud operations (SRE / incident response)
 * Algorithm: Autonomic cycle — perception → RL decision → circuit breaker gate
 *
 * Run: node examples/02-incident-triage.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Incident response log: each trace = one service incident lifecycle.
// Traces show a healthy baseline followed by an incident with retries and rework.
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
const handle = parse(wasm.load_eventlog_from_xes(INCIDENT_LOG));
const cycle  = JSON.parse(wasm.autonomic_execute_cycle(handle, 'concept:name', '{}'));
const elapsed = (performance.now() - t0).toFixed(2);

const HEALTH_LABELS = ['Normal', 'Warning', 'Degraded', 'Critical', 'Failed'];
const h = cycle.perception?.health_level ?? 0;
const action = cycle.decision?.action ?? 'MAINTAIN';
const reward = cycle.decision?.reward ?? 0;
const cb     = cycle.protection?.circuit_state ?? 'Closed';

console.log('=== Incident Health Triage ===');
console.log(`Health level    : ${h}/4  (${HEALTH_LABELS[h]})`);
console.log(`Autonomic action: ${action}`);
console.log(`Reward signal   : ${reward.toFixed ? reward.toFixed(3) : reward}`);
console.log(`Circuit breaker : ${cb}`);

if (h >= 2) {
  console.log('\n  ⚠  Process degradation detected — escalate immediately');
  console.log('  → Activate runbook: INCIDENT-RUNBOOK-P1');
} else if (h === 1) {
  console.log('\n  △  Warning level — monitor closely for 10 min before paging');
} else {
  console.log('\n  ✓  Process health nominal — continue automated remediation');
}

const spc = cycle.perception?.spc_alert_count ?? 0;
if (spc > 0) {
  console.log(`  SPC alerts      : ${spc} Western Electric rule violation(s) detected`);
}

console.log(`\nCompleted in ${elapsed} ms`);
