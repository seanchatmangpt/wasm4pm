'use strict';
/**
 * Example 5 — Safety-Critical Activity Verification
 *
 * JTBD: "When a shift ends, I need to verify that every safety-critical
 * inspection step was executed in the required sequence — not just that
 * work was performed."
 *
 * Industry: Energy / refinery operations (process safety management)
 * Algorithm: Variant analysis — checks each actual trace path against the
 *            declared safety standard, flagging any non-conforming shift
 *
 * Run: node examples/05-safety-process-guard.js
 */

const path = require('path');

const SAFETY_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="SHIFT-A"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-B"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-C"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-D"/>
    <event><string key="concept:name" value="Isolate"/></event>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
  </trace>
  <trace><string key="concept:name" value="SHIFT-E"/>
    <event><string key="concept:name" value="Pressure Check"/></event>
    <event><string key="concept:name" value="Valve Inspect"/></event>
    <event><string key="concept:name" value="Sign-Off"/></event>
  </trace>
</log>`;

const NAME = 'safety';
const JTBD = 'Did every shift complete the required safety steps in order?';
const REQUIRED     = ['Isolate', 'Pressure Check', 'Valve Inspect', 'Sign-Off'];
const BEFORE_AFTER = { before: 'Isolate', after: 'Pressure Check' };

function run(wasm, xes) {
  const parse   = r => (typeof r === 'string' ? JSON.parse(r) : r);
  const xesData = xes || SAFETY_LOG;

  const t0       = performance.now();
  const handle   = wasm.load_eventlog_from_xes(xesData);
  const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
  const elapsed  = (performance.now() - t0).toFixed(2);

  const shiftCount = wasm.get_trace_count(handle);

  const findings = variants.top_variants.map(v => {
    const tracePath  = v.path;
    const pathSet    = new Set(tracePath);
    const missing    = REQUIRED.filter(a => !pathSet.has(a));
    const idxBefore  = tracePath.indexOf(BEFORE_AFTER.before);
    const idxAfter   = tracePath.indexOf(BEFORE_AFTER.after);
    const orderOk    = idxBefore === -1 || idxAfter === -1 || idxBefore < idxAfter;

    return {
      path:           tracePath.join(' → '),
      count:          v.count,
      pct:            v.percentage,
      missing,
      orderViolation: !orderOk,
      compliant:      missing.length === 0 && orderOk,
    };
  });

  const violations = findings
    .filter(f => !f.compliant)
    .map(f => {
      const parts = [];
      if (f.missing.length) parts.push(`Missing steps: ${f.missing.join(', ')}`);
      if (f.orderViolation) parts.push(`Ordering: "${BEFORE_AFTER.before}" must precede "${BEFORE_AFTER.after}"`);
      return `[${f.count} shift(s)] ${f.path} — ${parts.join('; ')}`;
    });

  const affectedShifts = findings.filter(f => !f.compliant).reduce((s, f) => s + f.count, 0);

  return {
    name: NAME,
    jtbd: JTBD,
    violations,
    summary: {
      shifts:          shiftCount,
      distinct_paths:  variants.total_variants,
      compliant_paths: findings.filter(f => f.compliant).length,
      violation_paths: findings.filter(f => !f.compliant).length,
      affected_shifts: affectedShifts,
    },
    findings,
    compliant: violations.length === 0,
    elapsed_ms: parseFloat(elapsed),
  };
}

module.exports = { run, name: NAME, jtbd: JTBD };

if (require.main === module) {
  const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
  wasm.init();
  const result  = run(wasm, null);
  const { summary, findings } = result;

  console.log('=== Safety Process Guard Report ===');
  console.log(`Shifts reviewed : ${summary.shifts}`);
  console.log(`Distinct paths  : ${summary.distinct_paths}`);
  console.log(`Compliant paths : ${summary.compliant_paths} (${findings.filter(f => f.compliant).reduce((s, f) => s + f.count, 0)} shifts)`);
  console.log(`Violations      : ${summary.violation_paths} path type(s) affecting ${summary.affected_shifts} shift(s)`);

  const violations = findings.filter(f => !f.compliant);
  if (violations.length > 0) {
    console.log('\n  ✗ NON-CONFORMING PATHS:');
    violations.forEach(v => {
      console.log(`\n  [${v.count} shift(s), ${v.pct.toFixed(0)}%]  ${v.path}`);
      if (v.missing.length)    console.log(`    Missing steps    : ${v.missing.join(', ')}`);
      if (v.orderViolation)    console.log(`    Ordering issue   : "${BEFORE_AFTER.before}" must come before "${BEFORE_AFTER.after}"`);
    });
    console.log('\n  ✗ ACTION REQUIRED: Do not close the shift record until all violations are resolved');
    console.log('  Regulatory reference: OSHA 29 CFR 1910.119 — Process Safety Management');
  } else {
    console.log('\n  ✓ All shifts conform to the safety process standard');
  }

  console.log(`\nCompleted in ${result.elapsed_ms.toFixed(2)} ms`);
}
