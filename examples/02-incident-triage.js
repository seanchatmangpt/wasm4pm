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

const NAME = 'incident';
const JTBD = 'What is the incident health severity and which runbook fires?';

const HEALTH_LABELS    = ['Normal ✓', 'Warning △', 'Degraded ⚠', 'Critical ✗', 'Failed ✗'];
const RUNBOOK_BY_LEVEL = [
  'Continue automated remediation',
  'Monitor for 10 min; prepare on-call brief',
  'Page on-call now — activate INCIDENT-RUNBOOK-P2',
  'Declare P1; assemble war room — activate INCIDENT-RUNBOOK-P1',
  'Engage executive escalation path',
];

function run(wasm, xes) {
  const parse   = r => (typeof r === 'string' ? JSON.parse(r) : r);
  const xesData = xes || INCIDENT_LOG;

  const t0       = performance.now();
  const handle   = wasm.load_eventlog_from_xes(xesData);
  const rework   = parse(wasm.detect_rework(handle, 'concept:name'));
  const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
  const elapsed  = (performance.now() - t0).toFixed(2);

  const retryRate     = rework.rework_percentage ?? 0;
  const variantCount  = variants.total_variants ?? 1;
  const topVariantPct = variants.top_variants?.[0]?.percentage ?? 100;

  let healthLevel = 0;
  if (retryRate > 70 || variantCount > 4)      healthLevel = 3;
  else if (retryRate > 40 || variantCount > 2)  healthLevel = 2;
  else if (retryRate > 10 || variantCount > 1)  healthLevel = 1;

  const hotspot    = rework.rework_by_activity?.[0];
  const violations = healthLevel >= 2
    ? [`Health level ${healthLevel}/4 (${HEALTH_LABELS[healthLevel]}) — retry rate ${retryRate.toFixed(1)}%`]
    : [];

  return {
    name: NAME,
    jtbd: JTBD,
    violations,
    summary: {
      health_level:    healthLevel,
      health_label:    HEALTH_LABELS[healthLevel],
      runbook:         RUNBOOK_BY_LEVEL[healthLevel],
      retry_rate:      retryRate,
      variants:        variantCount,
      top_variant_pct: topVariantPct,
      hotspot: hotspot ? { activity: hotspot[0], count: hotspot[1] } : null,
      top_paths: (variants.top_variants ?? []).slice(0, 3).map(v => ({
        path: v.path,
        pct:  v.percentage,
      })),
    },
    findings: { rework, variants },
    compliant: healthLevel < 2,
    elapsed_ms: parseFloat(elapsed),
  };
}

module.exports = { run, name: NAME, jtbd: JTBD };

if (require.main === module) {
  const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
  wasm.init();
  const result  = run(wasm, null);
  const { summary } = result;

  console.log('=== Incident Health Triage ===');
  console.log(`Health level    : ${summary.health_level}/4  (${summary.health_label})`);
  console.log(`Retry rate      : ${summary.retry_rate}% of incidents required repeated remediation`);
  console.log(`Process variants: ${summary.variants} distinct paths (dominant: ${summary.top_variant_pct.toFixed(0)}% of cases)`);

  if (summary.hotspot) {
    console.log(`Retry hotspot   : "${summary.hotspot.activity}" (${summary.hotspot.count} repeated execution${summary.hotspot.count !== 1 ? 's' : ''})`);
  }

  console.log(`\n  → ${summary.runbook}`);

  if (summary.variants > 1) {
    console.log('\n  Top response paths:');
    summary.top_paths.forEach((v, i) => {
      console.log(`    ${i + 1}. ${v.path.join(' → ')}  (${v.pct.toFixed(0)}%)`);
    });
  }

  console.log(`\nCompleted in ${result.elapsed_ms.toFixed(2)} ms`);
}
