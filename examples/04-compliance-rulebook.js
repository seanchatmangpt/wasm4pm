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

const NAME = 'compliance';
const JTBD = 'What are the de-facto SOX control sequences in historical data?';

const SEQUENCE_TYPES  = ['Precedence', 'Succession', 'ChainPrecedence', 'ChainSuccession', 'Response', 'ChainResponse'];
const EXISTENCE_TYPES = ['Existence', 'Absence', 'Exactly1', 'Init', 'End'];
const CO_TYPES        = ['CoExistence', 'NotCoExistence', 'NotSuccession', 'NotChainSuccession'];
const HIGH = 0.95;

function run(wasm, xes) {
  const parse   = r => (typeof r === 'string' ? JSON.parse(r) : r);
  const xesData = xes || APPROVAL_LOG;

  const t0      = performance.now();
  const handle  = wasm.load_eventlog_from_xes(xesData);
  const declare = parse(wasm.discover_declare(handle, 'concept:name'));
  const variants = parse(wasm.analyze_trace_variants(handle, 'concept:name'));
  const elapsed = (performance.now() - t0).toFixed(2);

  const traceCount  = wasm.get_trace_count(handle);
  const constraints = declare.constraints ?? [];

  const sequences  = constraints.filter(c => SEQUENCE_TYPES.includes(c.template));
  const existences = constraints.filter(c => EXISTENCE_TYPES.includes(c.template));
  const coexist    = constraints.filter(c => CO_TYPES.includes(c.template));

  // Deduplicate by activity pair — keep highest-confidence template per pair
  const seen = new Map();
  for (const c of sequences) {
    const key = `${c.activities[0]}|${c.activities[1]}`;
    if (!seen.has(key) || seen.get(key).confidence < c.confidence) seen.set(key, c);
  }
  const uniqueSeq = [...seen.values()].sort((a, b) => b.support - a.support);
  const weak      = uniqueSeq.filter(c => c.confidence < HIGH);
  const strong    = uniqueSeq.filter(c => c.confidence >= HIGH);
  const mandatory = existences.filter(c => c.confidence >= HIGH && c.template === 'Existence');

  const violations = weak.map(c => {
    const [a, b] = c.activities;
    return `Weak sequence "${a}" → "${b}" (${(c.confidence * 100).toFixed(0)}% confidence) — potential SOD gap`;
  });

  return {
    name: NAME,
    jtbd: JTBD,
    violations,
    summary: {
      cases:              traceCount,
      variants:           variants.total_variants,
      total_constraints:  constraints.length,
      strong_sequences:   strong.length,
      weak_sequences:     weak.length,
      mandatory_activities: mandatory.map(c => c.activities[0]),
      top_variant:        variants.top_variants?.[0] ?? null,
    },
    findings: { strong, weak, mandatory, coexist },
    compliant: weak.length === 0,
    elapsed_ms: parseFloat(elapsed),
  };
}

module.exports = { run, name: NAME, jtbd: JTBD };

if (require.main === module) {
  const wasm = require(path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js'));
  wasm.init();
  const result  = run(wasm, null);
  const { summary, findings } = result;

  console.log('=== Financial Compliance Rulebook ===');
  console.log(`Cases analysed   : ${summary.cases}`);
  console.log(`Process variants : ${summary.variants} distinct approval paths`);
  console.log(`Constraints found: ${summary.total_constraints}`);

  if (findings.strong.length) {
    console.log('\n  REQUIRED SEQUENCES (de-facto control ordering):');
    findings.strong.slice(0, 5).forEach(c => {
      const [a, b] = c.activities;
      console.log(`    "${a}" → must precede → "${b}"  (${(c.support * 100).toFixed(0)}% of cases)`);
    });
    if (summary.weak_sequences) {
      console.log(`    (+${summary.weak_sequences} pair(s) with < 95% confidence — potential SOD violations)`);
    }
  }

  if (findings.mandatory.length) {
    console.log('\n  MANDATORY ACTIVITIES (always executed):');
    findings.mandatory.forEach(c => {
      console.log(`    "${c.activities[0]}" — present in 100% of cases`);
    });
  }

  if (findings.coexist.length) {
    console.log('\n  CO-OCCURRENCE RULES:');
    findings.coexist.slice(0, 3).forEach(c => {
      const label = c.template.startsWith('Not') ? 'must NOT co-occur with' : 'always co-occurs with';
      console.log(`    "${c.activities[0]}" ${label} "${c.activities[1]}"`);
    });
  }

  if (summary.top_variant) {
    console.log('\n  Dominant approval path:');
    console.log(`    ${summary.top_variant.path.join(' → ')}  (${summary.top_variant.percentage.toFixed(0)}% of disbursements)`);
  }

  console.log('\n  → Cross-reference against SOX Section 302/404 segregation-of-duties controls');
  console.log(`\nCompleted in ${result.elapsed_ms.toFixed(2)} ms`);
}
