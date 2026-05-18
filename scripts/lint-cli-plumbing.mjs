#!/usr/bin/env node
/**
 * lint-cli-plumbing.mjs — CLI arg plumbing and OTEL coverage linter
 *
 * Detects two silent-ignore patterns in apps/wasm4pm/src/commands/*.ts:
 *
 *   PATTERN 1  Arg declared in `args: { ... }` of defineCommand but never
 *              read by the run() handler (either ctx.args.X or destructured
 *              run({ args }) → args.X). Declared-but-not-read args are dead
 *              UI surface: they appear in --help but do nothing.
 *
 *   PATTERN 2  File imports defineCommand but contains zero calls to
 *              withSpan / withSpanRaw. Every top-level command must emit an
 *              OTEL span so execution is traceable.
 *
 * Exit codes: 0 = clean, 1 = violations found
 *
 * Usage:
 *   node scripts/lint-cli-plumbing.mjs [--json]
 *   node scripts/lint-cli-plumbing.mjs --dir path/to/commands
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── config ────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CMD_DIR = resolve(HERE, '../apps/wasm4pm/src/commands');

// Keys that appear inside an arg sub-object definition, not as arg names
const ARG_META_KEYS = new Set([
  'type', 'description', 'default', 'alias', 'required', 'valueHint',
]);

// ── arg block extraction ──────────────────────────────────────────────────────

/**
 * Extract top-level arg names from every `args: { ... }` block in `src`.
 * Returns an array of { name, line } objects (1-indexed).
 *
 * Works by tracking brace depth: depth==1 means we're one level inside the
 * args object, which is where top-level arg keys live. We inspect each line
 * BEFORE updating depth so we catch keys on lines that also open a sub-object
 * (e.g. `    load: {`).
 */
function extractDeclaredArgs(src) {
  const lines = src.split('\n');
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/\bargs\s*:\s*\{/.test(lines[i])) continue;

    let depth = 0;
    let inArgs = false;

    for (let j = i; j < Math.min(i + 400, lines.length); j++) {
      const l = lines[j];
      const opens = (l.match(/\{/g) ?? []).length;
      const closes = (l.match(/\}/g) ?? []).length;

      if (!inArgs) {
        if (opens > 0) { depth += opens - closes; inArgs = true; }
        continue;
      }

      // Inspect line BEFORE updating depth
      if (depth === 1) {
        const m = l.match(/^\s+['"]?([a-zA-Z][a-zA-Z0-9_-]*)['"]?\s*:/);
        if (m && !ARG_META_KEYS.has(m[1])) {
          results.push({ name: m[1], line: j + 1 });
        }
      }

      depth += opens - closes;
      if (depth <= 0) break;
    }
  }

  return results;
}

/**
 * Extract all arg names that are actually read in `src`.
 * Handles two calling conventions:
 *   - run(ctx)       → ctx.args.X  or  ctx.args['X']
 *   - run({ args })  → args.X      or  args['X']
 *
 * Single-character arg names (e.g. 'k') use the same regex but require the
 * quantifier [a-zA-Z0-9_]* (zero or more) so they are not missed.
 */
function extractReadArgs(src) {
  const reads = new Set();

  // ctx.args.X  (X ≥ 1 char)
  for (const m of src.matchAll(/ctx\.args\s*\.\s*([a-zA-Z][a-zA-Z0-9_]*)/g))
    reads.add(m[1]);

  // ctx.args['X'] or ctx.args["X"]
  for (const m of src.matchAll(/ctx\.args\s*\[\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]]/g))
    reads.add(m[1]);

  // Destructured: args.X (filter out array/string method names)
  const NOISE = new Set(['length', 'indexOf', 'join', 'slice', 'push', 'pop',
    'filter', 'map', 'sort', 'find', 'forEach', 'reduce', 'includes']);
  for (const m of src.matchAll(/\bargs\.([a-zA-Z][a-zA-Z0-9_]*)/g)) {
    if (!NOISE.has(m[1])) reads.add(m[1]);
  }

  // Destructured: args['X']
  for (const m of src.matchAll(/\bargs\s*\[\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]]/g))
    reads.add(m[1]);

  return reads;
}

// ── OTEL detection ────────────────────────────────────────────────────────────

function hasSpanCall(src) {
  return /withSpan|withSpanRaw/.test(src);
}

// ── main ──────────────────────────────────────────────────────────────────────

function run() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const dirIdx = args.indexOf('--dir');
  const cmdDir = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : DEFAULT_CMD_DIR;

  const files = readdirSync(cmdDir)
    .filter(f => f.endsWith('.ts') && f !== '_otel.ts')
    .sort();

  const p1Violations = []; // declared-but-not-read
  const p2Violations = []; // zero-OTEL

  for (const fname of files) {
    const fpath = join(cmdDir, fname);
    const src = readFileSync(fpath, 'utf8');

    if (!src.includes('defineCommand')) continue;

    // ── Pattern 1 ──
    const declared = extractDeclaredArgs(src);
    const reads = extractReadArgs(src);

    for (const { name, line } of declared) {
      if (!reads.has(name)) {
        p1Violations.push({ file: fname, arg: name, line });
      }
    }

    // ── Pattern 2 ──
    if (!hasSpanCall(src)) {
      p2Violations.push({ file: fname });
    }
  }

  // ── output ──
  const clean = p1Violations.length === 0 && p2Violations.length === 0;

  if (jsonMode) {
    process.stdout.write(JSON.stringify(
      { clean, pattern1: p1Violations, pattern2: p2Violations }, null, 2
    ) + '\n');
  } else {
    if (p1Violations.length > 0) {
      console.log('\nPATTERN 1 — Declared-but-not-read args (silent --help surface bug):\n');
      for (const { file, arg, line } of p1Violations) {
        console.log(`  ${file}:${line}  arg '${arg}' declared in args: block but never read by run()`);
      }
    }

    if (p2Violations.length > 0) {
      console.log('\nPATTERN 2 — Zero OTEL span coverage (defineCommand with no withSpan/withSpanRaw):\n');
      for (const { file } of p2Violations) {
        console.log(`  ${file}`);
      }
    }

    if (clean) {
      console.log('\nAll checks clean.\n');
    } else {
      const total = p1Violations.length + p2Violations.length;
      console.log(`\n${total} violation(s) found.\n`);
    }
  }

  process.exit(clean ? 0 : 1);
}

run();
