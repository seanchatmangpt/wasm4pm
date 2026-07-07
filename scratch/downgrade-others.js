const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const repDir = path.join(rootDir, 'reports/capability-validation');
const algDir = path.join(repDir, 'algorithms');
const brDir = path.join(repDir, 'breeds');

const algFiles = fs.readdirSync(algDir).filter(f => f.endsWith('.md')).sort();
const brFiles = fs.readdirSync(brDir).filter(f => f.endsWith('.md')).sort();

// 1. Update the 114 reports
for (const f of algFiles) {
  const filePath = path.join(algDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/final_status:\s*\S+/, 'final_status: UNSUPPORTED');
  content = content.replace(/maturity_level:\s*\S+/, 'maturity_level: L4');
  content = content.replace(/receipt:\s*\S+/, 'receipt: MISSING_PER_ITEM_TEST_OUTPUT');
  fs.writeFileSync(filePath, content);
}

for (const f of brFiles) {
  if (f === '062-allen_temporal.md') continue;
  const filePath = path.join(brDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/final_status:\s*\S+/, 'final_status: UNSUPPORTED');
  content = content.replace(/maturity_level:\s*\S+/, 'maturity_level: L4');
  content = content.replace(/receipt:\s*\S+/, 'receipt: MISSING_PER_ITEM_TEST_OUTPUT');
  fs.writeFileSync(filePath, content);
}

console.log('114 reports downgraded to L4/UNSUPPORTED.');

// 2. Rebuild index
const rebuildIndex = require('./rebuild-index.js');

// 3. Rebuild status ledger: ALGORITHM_AND_BREED_STATUS.md
const BREEDS_ORDER = [
  'ltl_monitor', 'allen_temporal', 'ctl_check', 'event_calculus', 'situation_calculus',
  'fuzzy_logic', 'dempster_shafer', 'abductive_ibe', 'bayesian_network', 'problog',
  'markov_logic', 'htn_planning', 'partial_order_plan', 'contingent_plan', 'mdp',
  'pomdp', 'strips', 'gps', 'asp', 'abductive_lp', 'tableaux', 'prolog',
  'clp', 'sat_cdcl', 'csp_ac3', 'default_logic', 'circumscription', 'frames_inheritance',
  'description_logic', 'belief_merging', 'script_sam', 'act_r', 'soar', 'episodic_memory',
  'ebl', 'ilp', 'version_space', 'analogy_sme', 'rl_symbolic', 'qualitative_reason',
  'naive_physics', 'triz', 'morphological', 'construction_grammar', 'meta_reasoning',
  'autoinstinct_learning', 'autoinstinct_neurosis', 'autoinstinct_semantics', 'autoinstinct_vision',
  'cbr', 'dendral', 'eliza', 'hearsay', 'mycin', 'ocpm_route_discoverer'
];

const algosMD = fs.readFileSync(path.join(rootDir, 'packages/kernel/ALGORITHMS.md'), 'utf8');
const algoRegex = /-\s+\*\*`([a-z0-9_]+)`\*\*/g;
const algorithmsList = [];
let m;
while ((m = algoRegex.exec(algosMD)) !== null) {
  algorithmsList.push(m[1]);
}

let ledger = `# Algorithm and Cognitive Breed Validation Ledger

## Summary

| Category | Total | Closed | Valid | Fixed | Refactored | Test Added | Blocked | Unsupported |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Algorithms | 60 | 60 | 0 | 0 | 0 | 0 | 0 | 60 |
| Breeds | 55 | 55 | 1 | 0 | 0 | 0 | 0 | 54 |
| Total | 115 | 115 | 1 | 0 | 0 | 0 | 0 | 114 |

## Seeded Algorithm Ledger

|   # | Type      | ID                                 | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Final Status |
| --: | --------- | ---------------------------------- | -- | -- | -- | -- | -- | -- | -- | ------------ |
`;

for (let idx = 0; idx < algorithmsList.length; idx++) {
  const algoId = algorithmsList[idx];
  const numStr = String(idx + 1).padStart(3, '0');
  ledger += `| ${numStr} | algorithm | ${algoId.padEnd(34)} | L4 | L4 | L4 | L4 | L4 | L4 | L4 | UNSUPPORTED  |\n`;
}

ledger += `
## Seeded Cognitive Breed Ledger

|   # | Type  | ID                     | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Final Status |
| --: | ----- | ---------------------- | -- | -- | -- | -- | -- | -- | -- | ------------ |
`;

for (let idx = 0; idx < BREEDS_ORDER.length; idx++) {
  const breedId = BREEDS_ORDER[idx];
  const num = idx + 61;
  const numStr = String(num).padStart(3, '0');
  if (breedId === 'allen_temporal') {
    ledger += `| ${numStr} | breed     | ${breedId.padEnd(34)} | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |\n`;
  } else {
    ledger += `| ${numStr} | breed     | ${breedId.padEnd(34)} | L4 | L4 | L4 | L4 | L4 | L4 | L4 | UNSUPPORTED  |\n`;
  }
}

ledger += `
## Evidence Notes and Implementation Locations

All 115 capabilities have been expanded into dedicated validation reports under [reports/capability-validation/](file://${repDir}).

Refer to:
- [REPORT_INDEX.md](file://${path.join(repDir, 'REPORT_INDEX.md')}) for direct links to each report.
- Individual reports for canonical declarations, implementation mapping, actual capabilities, test cases, and cryptographic receipts.
`;

fs.writeFileSync(path.join(rootDir, 'ALGORITHM_AND_BREED_STATUS.md'), ledger);
console.log('Ledger rebuilt successfully!');
