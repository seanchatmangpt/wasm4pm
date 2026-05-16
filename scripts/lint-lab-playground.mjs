#!/usr/bin/env node
/**
 * lint-lab-playground.mjs — iter-12 audit
 *
 * Scans lab/tests/ and playground/scenarios/ for four defect classes:
 *   VAC  — vacuous assertions (expect(true).toBe(true), expect(x).toBeTruthy())
 *   MOCK — mock-wasm patterns in lab/ post-publish tests (browser.test.ts)
 *   OTEL — missing OTEL span evidence in lab/ tests
 *   SKIP — skipped tests with unexported WASM symbols (unresolved gaps)
 *
 * Exit 1 when any violation is found.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Recursively collect .ts files under dir, skip .js and .map */
function collect(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...collect(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) results.push(full);
  }
  return results;
}

const LAB_TESTS   = join(ROOT, 'lab', 'tests');
const PG_SCENARIOS = join(ROOT, 'playground', 'scenarios');

const labFiles = collect(LAB_TESTS);
const pgFiles  = collect(PG_SCENARIOS);

const violations = [];

function rel(p) { return relative(ROOT, p); }

// ── VAC: vacuous always-passing assertions ────────────────────────────────────
// Pattern: expect(true).toBe(true) or expect(x).toBeTruthy() where x is a
// string literal or plain object that can never be falsy.
const VAC_LITERAL   = /expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/g;
const VAC_TRUTHY_LIT = /expect\s*\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`|\{[^}]*\}|\[[^\]]*\])\s*\)\s*\.toBeTruthy\s*\(\s*\)/g;

for (const file of [...labFiles, ...pgFiles]) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (VAC_LITERAL.test(line)) {
      VAC_LITERAL.lastIndex = 0;
      violations.push({ code: 'VAC', file: rel(file), line: i + 1,
        msg: 'vacuous expect(true).toBe(true) — test passes regardless of behaviour' });
    }
    VAC_LITERAL.lastIndex = 0;
    if (VAC_TRUTHY_LIT.test(line)) {
      VAC_TRUTHY_LIT.lastIndex = 0;
      violations.push({ code: 'VAC', file: rel(file), line: i + 1,
        msg: 'vacuous expect(literal).toBeTruthy() — always passes' });
    }
    VAC_TRUTHY_LIT.lastIndex = 0;
  }
}

// ── MOCK: mock-wasm in lab post-publish tests ─────────────────────────────────
// lab/tests/browser.test.ts uses mockWasm objects that stand in for the real
// published WASM module. This means browser algorithm compatibility is never
// actually tested against the artifact; deleting the binary would not cause
// any assertion to fail. This is the FM-5 pattern applied to lab/.
const MOCK_PATTERNS = [
  /mockWasm\s*=\s*\{/,
  /vi\.fn\s*\(\s*\(\)\s*=>\s*JSON\.stringify\s*\(/,
  /const mockWasm:\s*any\s*=\s*\{\}/,
];

for (const file of labFiles) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pat of MOCK_PATTERNS) {
      if (pat.test(lines[i])) {
        violations.push({ code: 'MOCK', file: rel(file), line: i + 1,
          msg: 'mock-wasm in lab/ post-publish test — artifact is never exercised' });
        break;
      }
    }
  }
}

// ── OTEL: lab tests declare OTEL requirement but emit zero spans ──────────────
// jtbd.test.ts header states "OTEL span + test assertion + event log mining (AND
// logic)" but no Instrumentation import or captureRaw call appears in the file.
for (const file of labFiles) {
  const src = readFileSync(file, 'utf8');
  const claimsOtel = /OTEL span\s*\+\s*test assertion/.test(src);
  const hasOtelImport = /Instrumentation|createOtelCapture|captureRaw|emitEvent/.test(src);
  if (claimsOtel && !hasOtelImport) {
    violations.push({ code: 'OTEL', file: rel(file), line: 1,
      msg: 'file claims "OTEL span + test assertion" AND logic but imports no OTEL instrumentation' });
  }
}

// ── SKIP: it.skip with unexported WASM symbols ───────────────────────────────
// Two tests in jtbd.test.ts are skipped because rl_orchestrator_reset and
// ml_anomaly() are not exported. These represent real gaps: test 3 (RL policy
// convergence) and test 5 (ML anomaly detection) have no coverage at all.
const SKIP_PATTERN = /it\.skip\s*\(/g;

for (const file of labFiles) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (SKIP_PATTERN.test(lines[i])) {
      SKIP_PATTERN.lastIndex = 0;
      violations.push({ code: 'SKIP', file: rel(file), line: i + 1,
        msg: 'it.skip — test has no coverage; WASM symbol not yet exported' });
    }
    SKIP_PATTERN.lastIndex = 0;
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const counts = { VAC: 0, MOCK: 0, OTEL: 0, SKIP: 0 };
for (const v of violations) counts[v.code]++;

if (violations.length === 0) {
  console.log('lint-lab-playground: OK — no violations found');
  process.exit(0);
}

console.error(`lint-lab-playground: ${violations.length} violation(s) found\n`);
for (const v of violations) {
  console.error(`  [${v.code}] ${v.file}:${v.line} — ${v.msg}`);
}
console.error(`\nSummary: VAC=${counts.VAC} MOCK=${counts.MOCK} OTEL=${counts.OTEL} SKIP=${counts.SKIP}`);
process.exit(1);
