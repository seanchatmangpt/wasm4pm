'use strict';
/**
 * Example 4 — Automated Financial Process Compliance Rulebook
 *
 * JTBD: "When auditing portfolio company controls, I need the de-facto
 * approval process rules extracted from the historical transaction log —
 * not what the policy manual says should happen."
 *
 * Industry: Financial services / investment holding company audit
 * Algorithm: Declare mining — extracts behavioral constraints
 *            (what must always precede what, what must never co-occur)
 *
 * Run: node examples/04-compliance-rulebook.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Financial approval log: each trace = one payment disbursement.
// The log contains both compliant and non-compliant cases.
const APPROVAL_LOG = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <classifier name="Activity" keys="concept:name"/>
  <trace><string key="concept:name" value="PAY-0101"/>
    <event><string key="concept:name" value="Submit Request"/></event>
    <event><string key="concept:name" value="Manager Approve"/></event>
    <event><string key="concept:name" value="CFO Approve"/></event>
    <event><string key="concept:name" value="Disburse"/></event>
  </trace>
  <trace><string key="concept:name" value="PAY-0102"/>
    <event><string key="concept:name" value="Submit Request"/></event>
    <event><string key="concept:name" value="Manager Approve"/></event>
    <event><string key="concept:name" value="CFO Approve"/></event>
    <event><string key="concept:name" value="Disburse"/></event>
  </trace>
  <trace><string key="concept:name" value="PAY-0103"/>
    <event><string key="concept:name" value="Submit Request"/></event>
    <event><string key="concept:name" value="Manager Approve"/></event>
    <event><string key="concept:name" value="Disburse"/></event>
  </trace>
  <trace><string key="concept:name" value="PAY-0104"/>
    <event><string key="concept:name" value="Submit Request"/></event>
    <event><string key="concept:name" value="CFO Approve"/></event>
    <event><string key="concept:name" value="Manager Approve"/></event>
    <event><string key="concept:name" value="Disburse"/></event>
  </trace>
  <trace><string key="concept:name" value="PAY-0105"/>
    <event><string key="concept:name" value="Submit Request"/></event>
    <event><string key="concept:name" value="Manager Approve"/></event>
    <event><string key="concept:name" value="CFO Approve"/></event>
    <event><string key="concept:name" value="Disburse"/></event>
  </trace>
</log>`;

const t0 = performance.now();
const handle   = parse(wasm.load_eventlog_from_xes(APPROVAL_LOG));
const declare  = parse(wasm.discover_declare(handle, 'concept:name'));
const elapsed  = (performance.now() - t0).toFixed(2);

const constraints = declare.constraints ?? declare.rules ?? declare.declare_constraints ?? [];

// Classify by constraint type
const always   = constraints.filter(c => (c.type ?? c.constraint_type ?? '').includes('always') || (c.type ?? '').includes('response'));
const never    = constraints.filter(c => (c.type ?? c.constraint_type ?? '').includes('not') || (c.type ?? '').includes('absence'));
const sequence = constraints.filter(c => (c.type ?? c.constraint_type ?? '').includes('precedence') || (c.type ?? '').includes('succession'));
const other    = constraints.filter(c => !always.includes(c) && !never.includes(c) && !sequence.includes(c));

console.log('=== Financial Compliance Rulebook ===');
console.log(`Total constraints discovered: ${constraints.length}`);

if (sequence.length) {
  console.log('\n  REQUIRED SEQUENCES (precedence rules):');
  sequence.slice(0, 5).forEach(c => {
    const a = c.activity_a ?? c.from ?? c.source ?? JSON.stringify(c).slice(0, 60);
    const b = c.activity_b ?? c.to   ?? c.target ?? '';
    const sup = c.support != null ? ` (${(c.support * 100).toFixed(0)}% of cases)` : '';
    console.log(`    ${a} → must precede → ${b}${sup}`);
  });
}

if (always.length) {
  console.log('\n  MANDATORY ACTIVITIES (existence rules):');
  always.slice(0, 5).forEach(c => {
    const a = c.activity ?? c.activity_a ?? c.from ?? JSON.stringify(c).slice(0, 60);
    console.log(`    ${a} — must appear in every case`);
  });
}

if (never.length) {
  console.log('\n  FORBIDDEN PATTERNS (absence / not-succession rules):');
  never.slice(0, 3).forEach(c => {
    const a = c.activity_a ?? c.from ?? JSON.stringify(c).slice(0, 60);
    const b = c.activity_b ?? c.to   ?? '';
    console.log(`    ${a} → must NOT directly precede → ${b}`);
  });
}

if (other.length) {
  console.log(`\n  Other constraints : ${other.length}`);
}

if (constraints.length === 0) {
  console.log('\n  (No Declare constraints extracted — try more traces for statistical significance)');
}

console.log('\n  → Cross-reference against SOX Section 302/404 segregation-of-duties controls');
console.log(`\nCompleted in ${elapsed} ms`);
