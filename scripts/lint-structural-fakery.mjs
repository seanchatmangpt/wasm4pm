#!/usr/bin/env node
/**
 * lint-structural-fakery.mjs
 *
 * Detects four structural-fakery patterns that have recurred across PRs
 * #66, #73, and #75:
 *
 *   R1  Math.random() in non-test packages/src files
 *       -- unless the file contains the allow-random annotation
 *
 *   R2  Short strings (< 64 chars) assigned to fields whose name contains
 *       "hash", "fingerprint", "signature", or "id" (word-bounded)
 *       -- receipt hashes are BLAKE3 hex (64 chars); short values are stubs
 *
 *   R3  Boolean-literal true on fields named optimal / exact / verified /
 *       canonical, when the same logical block contains a qualifying comment
 *       ("Simplified", "doesn't guarantee", "approximation", "stub")
 *
 *   R4  Hardcoded numeric quality-metric fallbacks (fitness / precision /
 *       generalization / simplicity) whose values are static literals in
 *       production non-test source files
 *       -- silent stub returns that deceive conformance gates
 *
 * Usage:
 *   node scripts/lint-structural-fakery.mjs            # scan packages/
 *   node scripts/lint-structural-fakery.mjs --json     # machine-readable
 *   node scripts/lint-structural-fakery.mjs --fix      # annotate fixable R3
 *
 * Exit codes: 0 = clean, 1 = findings present
 *
 * Allowlist mechanism:
 *   Add `// @lint-allow-random` anywhere in a file to suppress R1 for that file.
 *   Add `// @lint-allow-fakery` on the same line as a finding to suppress it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const JSON_MODE = process.argv.includes('--json');
const FIX_MODE  = process.argv.includes('--fix');

// ── Already-PRd files — never flag, they are in-flight ───────────────────────
const SKIP_FILENAMES = new Set([
  'hash.ts',
  'algorithm-discovery.ts',
  'token-replay.ts',
]);
const SKIP_PATHS = [
  'mocks/ml.ts',
  'mocks/engine.ts',
  'mocks/source.ts',
  // Cognition layer is explicitly off-limits per task constraints
  'cognition/src/contract/',
  'cognition/src/receipt/',
  'cognition/src/system/',
];

// ── File collection ───────────────────────────────────────────────────────────

/** Recursively yield .ts files under dir, excluding .d.ts and node_modules. */
function* walkTs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      yield* walkTs(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      yield full;
    }
  }
}

/** Return true if path should be skipped. */
function isSkipped(absPath) {
  const rel = relative(REPO_ROOT, absPath);
  if (SKIP_FILENAMES.has(absPath.split('/').pop())) return true;
  for (const p of SKIP_PATHS) {
    if (rel.includes(p)) return true;
  }
  return false;
}

/** Return true if a file is a test file (should not be flagged for R1/R4). */
function isTestFile(absPath) {
  return (
    absPath.includes('__tests__') ||
    absPath.includes('.test.') ||
    absPath.includes('.spec.') ||
    absPath.includes('/bench') ||
    absPath.endsWith('.bench.ts')
  );
}

// ── Finders ───────────────────────────────────────────────────────────────────

/**
 * R1: Math.random() in production (non-test) source files.
 * Exempt if file has // @lint-allow-random comment anywhere in it.
 */
function findR1(absPath, lines) {
  if (isTestFile(absPath)) return [];
  const fileText = lines.join('\n');
  if (fileText.includes('// @lint-allow-random')) return [];

  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('// @lint-allow-fakery')) continue;
    if (/Math\.random\(\)/.test(line)) {
      findings.push({
        rule: 'R1',
        severity: 'HIGH',
        file: relative(REPO_ROOT, absPath),
        line: i + 1,
        col: line.indexOf('Math.random()') + 1,
        text: line.trim(),
        message: 'Math.random() in production source — non-deterministic, not cryptographic. Use crypto.getRandomValues() or a seeded PRNG.',
      });
    }
  }
  return findings;
}

/**
 * R2: Short string literal assigned to a field named *hash*, *fingerprint*,
 * *signature*, or (word-bounded) *_id* / *Id*.
 * Receipt hashes are BLAKE3 hex (64 chars); any string shorter than 64 chars
 * is a stub, a truncated value, or a contract violation.
 */
const HASH_FIELD_RE = /\b(?:hash|fingerprint|signature|_id|Id)\s*[:=]\s*[`'"]([^`'"]{1,63})[`'"]/g;
const SKIP_HASH_CONTEXTS = [
  /^\s*\/\//,          // comment lines
  /typeof\s/,          // typeof guard
  /pattern\s*:/,       // regex pattern declarations
  /\.test\(/,          // .test(
  /import\s/,          // import statements
  /=\s*[`'"]0x/,       // hex prefix (short constant — maybe intentional)
];

function findR2(absPath, lines) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('// @lint-allow-fakery')) continue;
    if (SKIP_HASH_CONTEXTS.some((re) => re.test(line))) continue;

    HASH_FIELD_RE.lastIndex = 0;
    let m;
    while ((m = HASH_FIELD_RE.exec(line)) !== null) {
      const val = m[1];
      // Only flag concrete short strings; skip template expressions like ${...}
      if (val.includes('${')) continue;
      // Skip empty strings — those are caught by other rules
      if (val.length === 0) continue;
      findings.push({
        rule: 'R2',
        severity: 'CRITICAL',
        file: relative(REPO_ROOT, absPath),
        line: i + 1,
        col: m.index + 1,
        text: line.trim(),
        message: `Short string (${val.length} chars) assigned to hash/fingerprint/id field — BLAKE3 hashes are 64 hex chars. Value: "${val.slice(0, 32)}${val.length > 32 ? '…' : ''}"`,
      });
    }
  }
  return findings;
}

/**
 * R3: `optimal: true` / `exact: true` / `verified: true` / `canonical: true`
 * with a qualifying comment nearby (within ±5 lines) that admits the value
 * is approximate, simplified, or not guaranteed.
 */
const LIE_FIELD_RE = /\b(optimal|exact|verified|canonical)\s*:\s*true\b/;
const QUALIFYING_COMMENT_RE = /\b(simplified|doesn['']t\s+guarantee|approximat|stub|not\s+optimal)\b/i;

function findR3(absPath, lines) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('// @lint-allow-fakery')) continue;
    if (!LIE_FIELD_RE.test(line)) continue;

    // Search window: same line + 5 lines above + 5 lines below
    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(lines.length - 1, i + 5);
    const window = lines.slice(windowStart, windowEnd + 1).join('\n');

    if (QUALIFYING_COMMENT_RE.test(window)) {
      const m = LIE_FIELD_RE.exec(line);
      findings.push({
        rule: 'R3',
        severity: 'CRITICAL',
        file: relative(REPO_ROOT, absPath),
        line: i + 1,
        col: m ? m.index + 1 : 1,
        text: line.trim(),
        message: `Boolean lie: "${m?.[1]}: true" with adjacent qualifying comment admitting it is not actually ${m?.[1]}. Use a computed value or rename to reflect approximation.`,
      });
    }
  }
  return findings;
}

/**
 * R4: Hardcoded quality-metric numeric literals in fallback/stub branches of
 * production (non-test) source files.
 * Pattern: field named fitness/precision/generalization/simplicity assigned a
 * static number in a block labelled Fallback / stub / not supported.
 */
const QUALITY_FIELD_RE = /\b(fitness|precision|generalization|simplicity)\s*:\s*(\d+(?:\.\d+)?)\b/;
const STUB_CONTEXT_MARKERS = ['fallback', 'stub result', 'not supported', 'stub implementation'];

function findR4(absPath, lines) {
  if (isTestFile(absPath)) return [];
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('// @lint-allow-fakery')) continue;
    if (!QUALITY_FIELD_RE.test(line)) continue;

    // Look backward up to 20 lines for a stub/fallback marker
    const lookback = lines.slice(Math.max(0, i - 20), i).join('\n').toLowerCase();
    const isStubContext = STUB_CONTEXT_MARKERS.some((m) => lookback.includes(m));
    if (!isStubContext) continue;

    const m = QUALITY_FIELD_RE.exec(line);
    findings.push({
      rule: 'R4',
      severity: 'CRITICAL',
      file: relative(REPO_ROOT, absPath),
      line: i + 1,
      col: m ? m.index + 1 : 1,
      text: line.trim(),
      message: `Hardcoded quality metric "${m?.[1]}: ${m?.[2]}" in stub/fallback branch — this value is fabricated, not computed. Conformance gates will see a false positive. Throw or propagate NaN instead.`,
    });
  }
  return findings;
}

// ── Main scan ─────────────────────────────────────────────────────────────────

const all = [];

for (const absPath of walkTs(PACKAGES_DIR)) {
  if (isSkipped(absPath)) continue;

  let lines;
  try {
    lines = readFileSync(absPath, 'utf8').split('\n');
  } catch {
    continue;
  }

  all.push(
    ...findR1(absPath, lines),
    ...findR2(absPath, lines),
    ...findR3(absPath, lines),
    ...findR4(absPath, lines),
  );
}

// Sort by severity then file then line
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
all.sort((a, b) => {
  const sd = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
  if (sd !== 0) return sd;
  if (a.file < b.file) return -1;
  if (a.file > b.file) return 1;
  return a.line - b.line;
});

// ── Output ────────────────────────────────────────────────────────────────────

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({ findings: all, total: all.length }, null, 2) + '\n');
} else {
  const RESET = '\x1b[0m', RED = '\x1b[31m', YELLOW = '\x1b[33m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
  const RULE_LABEL = {
    R1: 'MATH.RANDOM',
    R2: 'SHORT-HASH',
    R3: 'BOOL-LIE',
    R4: 'STUB-METRIC',
  };

  if (all.length === 0) {
    console.log(`${BOLD}lint-structural-fakery: no findings${RESET}`);
  } else {
    const bySeverity = {};
    for (const f of all) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    console.log(`\n${BOLD}lint-structural-fakery — ${all.length} finding(s)${RESET}`);
    console.log(Object.entries(bySeverity).map(([s, n]) => `  ${s}: ${n}`).join('\n'));
    console.log();

    for (const f of all) {
      const color = f.severity === 'CRITICAL' ? RED : YELLOW;
      console.log(`${color}${BOLD}[${f.rule}/${RULE_LABEL[f.rule]}] ${f.severity}${RESET}`);
      console.log(`  ${f.file}:${f.line}:${f.col}`);
      console.log(`  ${DIM}${f.text}${RESET}`);
      console.log(`  ${f.message}`);
      console.log();
    }

    const ruleCount = {};
    for (const f of all) ruleCount[f.rule] = (ruleCount[f.rule] || 0) + 1;
    console.log(`${DIM}By rule: ${Object.entries(ruleCount).map(([r, n]) => `${r}=${n}`).join(' ')}${RESET}`);
    console.log(`${DIM}Allowlist: add // @lint-allow-random (file-level R1) or // @lint-allow-fakery (line-level)${RESET}\n`);
  }
}

process.exit(all.length > 0 ? 1 : 0);
