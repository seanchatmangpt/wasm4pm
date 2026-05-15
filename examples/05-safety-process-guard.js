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
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Safety inspection log: each trace = one shift's maintenance sequence.
// STANDARD: Isolate → Pressure Check → Valve Inspect → Sign-Off (in that order).
// Some shifts skipped steps or reordered Sign-Off.
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

// Safety standard: required activities and the one critical ordering rule.
const REQUIRED     = ['Isolate', 'Pressure Check', 'Valve Inspect', 'Sign-Off'];
const BEFORE_AFTER = { before: 'Isolate', after: 'Pressure Check' };  // must appear in this order

const t0 = performance.now();
const handle   = wasm.load_eventlog_from_xes(SAFETY_LOG);
const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
const elapsed  = (performance.now() - t0).toFixed(2);

// Evaluate each variant path against the safety standard
const findings = variants.top_variants.map(v => {
  const path      = v.path;
  const pathSet   = new Set(path);
  const missing   = REQUIRED.filter(a => !pathSet.has(a));

  const idxBefore = path.indexOf(BEFORE_AFTER.before);
  const idxAfter  = path.indexOf(BEFORE_AFTER.after);
  const orderOk   = idxBefore === -1 || idxAfter === -1 || idxBefore < idxAfter;

  return {
    path: path.join(' → '),
    count: v.count,
    pct: v.percentage,
    missing,
    orderViolation: !orderOk,
    compliant: missing.length === 0 && orderOk,
  };
});

const compliant    = findings.filter(f => f.compliant);
const violations   = findings.filter(f => !f.compliant);
const shiftCount   = wasm.get_trace_count(handle);
const affectedShifts = violations.reduce((s, v) => s + v.count, 0);

console.log('=== Safety Process Guard Report ===');
console.log(`Shifts reviewed : ${shiftCount}`);
console.log(`Distinct paths  : ${variants.total_variants}`);
console.log(`Compliant paths : ${compliant.length} (${compliant.reduce((s, f) => s + f.count, 0)} shifts)`);
console.log(`Violations      : ${violations.length} path type(s) affecting ${affectedShifts} shift(s)`);

if (violations.length > 0) {
  console.log('\n  ✗ NON-CONFORMING PATHS:');
  violations.forEach(v => {
    console.log(`\n  [${v.count} shift(s), ${v.pct.toFixed(0)}%]  ${v.path}`);
    if (v.missing.length) console.log(`    Missing steps    : ${v.missing.join(', ')}`);
    if (v.orderViolation) console.log(`    Ordering issue   : "${BEFORE_AFTER.before}" must come before "${BEFORE_AFTER.after}"`);
  });
  console.log('\n  ✗ ACTION REQUIRED: Do not close the shift record until all violations are resolved');
  console.log('  Regulatory reference: OSHA 29 CFR 1910.119 — Process Safety Management');
} else {
  console.log('\n  ✓ All shifts conform to the safety process standard');
}

console.log(`\nCompleted in ${elapsed} ms`);
