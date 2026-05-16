#!/usr/bin/env node

/**
 * OTEL Span Completeness Lint — Van der Aalst observability quality gate.
 *
 * Detects two classes of OTEL instrumentation defect:
 *
 *   Rule A — Closed span with UNSET status
 *     An OtelEvent object that has both `end_time` set and `status.code === 'UNSET'`
 *     is a completed span that was never resolved. A practitioner querying Jaeger
 *     sees grey (UNSET) spans that are indistinguishable from errors. This is the
 *     #1 cause of misleading process-mining audit trails.
 *
 *   Rule B — Algorithm start-span missing algorithm.profile
 *     Every algorithm execution span must carry `algorithm.profile` so a practitioner
 *     can filter `conformance.check` results by the deployment profile they were
 *     gathered under. Missing this attribute makes the span non-comparable across
 *     profile runs. See instrumentation.ts createAlgorithmStartedEvent for the
 *     canonical fix pattern.
 *
 *   Rule C — Conformance completed span missing Van der Aalst quality dimensions
 *     A closed `conformance.check` span that omits any of the four dimensions
 *     (fitness, precision, generalization, simplicity) loses the ability to track
 *     the fitness-precision trade-off over time. These dimensions should always be
 *     present (use -1 to signal "not computed" rather than omitting).
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = violations found (printed to stdout)
 *
 * Usage:
 *   node scripts/lint-otel-completeness.mjs          # run all checks
 *   node scripts/lint-otel-completeness.mjs --json   # machine-readable output
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findings = [];
let checkCount = 0;

function find(severity, rule, message, context = {}) {
  checkCount++;
  findings.push({ severity, rule, message, ...context });
}

function ok(rule) {
  checkCount++;
}

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf-8');
}

/**
 * Walk a directory tree, yielding .ts files (not .d.ts).
 */
function* walkTs(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      yield* walkTs(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper — extract method body by name
//
// TypeScript static method signatures end with `): ReturnType {`.
// The function body brace is the `{` that follows the closing `}` of the
// return type annotation.  We search for the pattern `} {` starting from
// the method declaration to locate the real function body.
// ---------------------------------------------------------------------------

/**
 * Return the text inside the braces of a static method in `src`.
 * `methodName` is the bare name without `static` (e.g. 'createAlgorithmStartedEvent').
 * Returns null if the method cannot be found.
 */
function extractMethodBody(src, methodName) {
  const startIdx = src.indexOf(`static ${methodName}(`);
  if (startIdx === -1) return null;

  // Find `} {` — the end of the return type annotation followed by the body open brace.
  // Fall back to the first `{` found 100+ chars into the signature if no return type.
  let bodyBrace = -1;
  const searchFrom = startIdx;
  const sigEndPattern = /\}\s*\{/g;
  sigEndPattern.lastIndex = searchFrom;
  let m;
  while ((m = sigEndPattern.exec(src)) !== null) {
    // Make sure we haven't gone past the next `static` declaration.
    const nextStatic = src.indexOf('\n  static ', startIdx + 1);
    if (nextStatic !== -1 && m.index > nextStatic) break;
    bodyBrace = src.indexOf('{', m.index + 1);
    break;
  }
  if (bodyBrace === -1) {
    // Fallback: look for `{` after the closing paren of the signature
    const closeParen = src.indexOf(')', startIdx);
    bodyBrace = src.indexOf('{', closeParen);
  }
  if (bodyBrace === -1) return null;

  let depth = 1;
  let pos = bodyBrace + 1;
  while (pos < src.length && depth > 0) {
    if (src[pos] === '{') depth++;
    else if (src[pos] === '}') depth--;
    pos++;
  }
  return src.slice(bodyBrace + 1, pos - 1);
}

// ---------------------------------------------------------------------------
// Rule A — Closed span with UNSET status
//
// A createXxxCompletedEvent that constructs an OtelEvent with both
// `end_time:` set and `status: { code: 'UNSET' }` is a completed span that
// was never resolved.  Closed spans must always use 'OK' or 'ERROR'.
// ---------------------------------------------------------------------------

function checkClosedSpanUnsetStatus() {
  const rule = 'closed-span-unset-status';
  const file = 'packages/observability/src/instrumentation.ts';
  let src;
  try {
    src = read(file);
  } catch {
    find('warning', rule, `Could not read ${file} — skipping closed-span check`, { file });
    return;
  }

  // Find all `static createXxx` method names.
  const methodNames = [];
  for (const m of src.matchAll(/static\s+(create\w+)\s*\(/g)) {
    if (!methodNames.includes(m[1])) methodNames.push(m[1]);
  }

  for (const methodName of methodNames) {
    const body = extractMethodBody(src, methodName);
    if (body === null) continue;

    const hasEndTime = /end_time\s*:/.test(body);
    const hasUnsetLiteral = /status\s*:\s*\{\s*code\s*:\s*['"]UNSET['"]/.test(body);

    if (hasEndTime && hasUnsetLiteral) {
      find(
        'error',
        rule,
        `${methodName} emits a closed OtelEvent (end_time set) with status.code 'UNSET'. ` +
          `Closed spans must resolve to 'OK' or 'ERROR'. ` +
          `Use: status: { code: options?.status || 'OK' }`,
        { file, method: methodName }
      );
    } else {
      ok(rule);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule B — Algorithm start-span missing algorithm.profile
//
// The createAlgorithmStartedEvent factory must emit 'algorithm.profile'
// (mirroring requiredAttrs['execution.profile']).  We verify the attribute
// is present in the attributes block of that method.
// ---------------------------------------------------------------------------

function checkAlgorithmProfileAttribute() {
  const rule = 'algorithm-profile-attribute';
  const file = 'packages/observability/src/instrumentation.ts';
  let src;
  try {
    src = read(file);
  } catch {
    find('warning', rule, `Could not read ${file} — skipping algorithm.profile check`, { file });
    return;
  }

  const body = extractMethodBody(src, 'createAlgorithmStartedEvent');
  if (body === null) {
    find('error', rule, 'createAlgorithmStartedEvent not found in instrumentation.ts', { file });
    return;
  }

  if (!/'algorithm\.profile'/.test(body)) {
    find(
      'error',
      rule,
      `createAlgorithmStartedEvent does not emit 'algorithm.profile' attribute. ` +
        `Add: 'algorithm.profile': requiredAttrs['execution.profile']`,
      { file, method: 'createAlgorithmStartedEvent' }
    );
  } else {
    ok(rule);
  }
}

// ---------------------------------------------------------------------------
// Rule C — Conformance completed span missing Van der Aalst quality dimensions
//
// createConformanceCheckCompletedEvent must emit all four dimensions.
// We verify that 'conformance.fitness', 'conformance.precision',
// 'conformance.generalization', and 'conformance.simplicity' are always
// present in the attributes block (not conditional spreads).
// ---------------------------------------------------------------------------

function checkConformanceDimensions() {
  const rule = 'conformance-dimensions-complete';
  const file = 'packages/observability/src/instrumentation.ts';
  let src;
  try {
    src = read(file);
  } catch {
    find('warning', rule, `Could not read ${file} — skipping conformance dimensions check`, {
      file,
    });
    return;
  }

  const body = extractMethodBody(src, 'createConformanceCheckCompletedEvent');
  if (body === null) {
    find('error', rule, 'createConformanceCheckCompletedEvent not found in instrumentation.ts', {
      file,
    });
    return;
  }

  const required = [
    'conformance.fitness',
    'conformance.precision',
    'conformance.generalization',
    'conformance.simplicity',
  ];

  const missing = [];
  for (const dim of required) {
    // Accept both quoted patterns: 'conformance.fitness' and "conformance.fitness"
    const pattern = new RegExp(`['"]${dim.replace('.', '\\.')}['"]`);
    if (!pattern.test(body)) {
      missing.push(dim);
    }
  }

  if (missing.length > 0) {
    find(
      'error',
      rule,
      `createConformanceCheckCompletedEvent is missing Van der Aalst quality dimensions: ` +
        `${missing.join(', ')}. ` +
        `All four must always be emitted (use -1 for "not computed" rather than omitting).`,
      { file, method: 'createConformanceCheckCompletedEvent', missing }
    );
  } else {
    ok(rule);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function runAllChecks() {
  checkClosedSpanUnsetStatus();
  checkAlgorithmProfileAttribute();
  checkConformanceDimensions();
}

const jsonMode = process.argv.includes('--json');

runAllChecks();

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        status: errors.length > 0 ? 'fail' : 'pass',
        checks: checkCount,
        errors: errors.length,
        warnings: warnings.length,
        findings,
      },
      null,
      2
    )
  );
} else {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  OTEL Span Completeness Lint (Van der Aalst QoL)    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  if (findings.length === 0) {
    console.log(`  All ${checkCount} checks passed.`);
  } else {
    for (const f of findings) {
      const icon = f.severity === 'error' ? 'x' : '!';
      const color =
        f.severity === 'error' ? '\x1b[31m' : f.severity === 'warning' ? '\x1b[33m' : '\x1b[36m';
      console.log(`  ${color}${icon}\x1b[0m [${f.rule}] ${f.message}`);
      if (f.file) console.log(`    -- ${f.file}${f.method ? ` (${f.method})` : ''}`);
    }
  }

  console.log();
  console.log(
    `  Checks: ${checkCount}  |  Errors: ${errors.length}  |  Warnings: ${warnings.length}`
  );
  console.log();

  if (errors.length > 0) {
    console.log('  \x1b[31mOTEL COMPLETENESS GATE FAILED\x1b[0m -- fix errors before merging');
  } else if (warnings.length > 0) {
    console.log('  \x1b[33mOTEL COMPLETENESS GATE PASSED WITH WARNINGS\x1b[0m');
  } else {
    console.log('  \x1b[32mOTEL COMPLETENESS GATE PASSED\x1b[0m');
  }
}

process.exit(errors.length > 0 ? 1 : 0);
