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
 *            (sequence obligations, existence requirements, forbidden patterns)
 *
 * Run: node examples/04-compliance-rulebook.js
 */

const path = require('path');
const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);

wasm.init();

// Financial approval log: each trace = one payment disbursement.
// Mix of compliant (full dual-sign) and non-compliant (single approver) cases.
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
const handle    = wasm.load_eventlog_from_xes(APPROVAL_LOG);
const declare   = parse(wasm.discover_declare(handle, 'concept:name'));
const variants  = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
const elapsed   = (performance.now() - t0).toFixed(2);

const constraints = declare.constraints ?? [];

// Group by template family
const SEQUENCE_TYPES  = ['Precedence', 'Succession', 'ChainPrecedence', 'ChainSuccession', 'Response', 'ChainResponse'];
const EXISTENCE_TYPES = ['Existence', 'Absence', 'Exactly1', 'Init', 'End'];
const CO_TYPES        = ['CoExistence', 'NotCoExistence', 'NotSuccession', 'NotChainSuccession'];

const sequences  = constraints.filter(c => SEQUENCE_TYPES.includes(c.template));
const existences = constraints.filter(c => EXISTENCE_TYPES.includes(c.template));
const coexist    = constraints.filter(c => CO_TYPES.includes(c.template));

// High-confidence = universally present rule
const HIGH = 0.95;

console.log('=== Financial Compliance Rulebook ===');
console.log(`Cases analysed   : ${wasm.get_trace_count(handle)}`);
console.log(`Process variants : ${variants.total_variants} distinct approval paths`);
console.log(`Constraints found: ${constraints.length}`);

if (sequences.length) {
  console.log('\n  REQUIRED SEQUENCES (de-facto control ordering):');
  // Deduplicate by activity pair — keep highest-confidence template per pair
  const seen = new Map();
  for (const c of sequences) {
    const key = `${c.activities[0]}|${c.activities[1]}`;
    if (!seen.has(key) || seen.get(key).confidence < c.confidence) seen.set(key, c);
  }
  const unique = [...seen.values()].sort((a, b) => b.support - a.support);
  unique
    .filter(c => c.confidence >= HIGH)
    .slice(0, 5)
    .forEach(c => {
      const [a, b] = c.activities;
      console.log(`    "${a}" → must precede → "${b}"  (${(c.support * 100).toFixed(0)}% of cases)`);
    });
  const weak = unique.filter(c => c.confidence < HIGH).length;
  if (weak) console.log(`    (+${weak} pair(s) with < 95% confidence — potential SOD violations)`);
}

if (existences.length) {
  console.log('\n  MANDATORY ACTIVITIES (always executed):');
  existences
    .filter(c => c.confidence >= HIGH && c.template === 'Existence')
    .forEach(c => {
      console.log(`    "${c.activities[0]}" — present in 100% of cases`);
    });
}

if (coexist.length) {
  console.log('\n  CO-OCCURRENCE RULES:');
  coexist.slice(0, 3).forEach(c => {
    const label = c.template.startsWith('Not') ? 'must NOT co-occur with' : 'always co-occurs with';
    console.log(`    "${c.activities[0]}" ${label} "${c.activities[1]}"`);
  });
}

console.log('\n  Dominant approval path:');
console.log(`    ${variants.top_variants[0].path.join(' → ')}  (${variants.top_variants[0].percentage.toFixed(0)}% of disbursements)`);
console.log('\n  → Cross-reference against SOX Section 302/404 segregation-of-duties controls');
console.log(`\nCompleted in ${elapsed} ms`);
