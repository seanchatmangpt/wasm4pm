#!/usr/bin/env node

/**
 * lint-exit-codes.mjs — Exit-code semantics linter for wasm4pm CLI commands.
 *
 * Detects four classes of exit-code bugs surfaced in PRs #45, #47, #62, #67:
 *
 *   E1 — OTEL-flush gap: `process.exitCode = N; return` bypasses exitWithFlush,
 *         losing queued OTEL spans (found in doctor.ts).
 *
 *   E2 — Hardcoded numeric literal: `exitWithFlush(0)` or `exitWithFlush(2)` etc.
 *         instead of `exitWithFlush(EXIT_CODES.success)`. Magic numbers drift.
 *
 *   E3 — Silent-gate bypass: a code path that computes a `failed`/`escaped`/
 *         `refuted`/`errors` count > 0 but then exits via `makeResult(...)` with
 *         no explicit non-zero exit code (default 0 from makeResult's optional arg).
 *
 *   E4 — Semantic mismatch: `makeErrorResult(..., EXIT_CODES.source_error, ...)` on
 *         a path that is clearly about missing/invalid CLI arguments or algorithm
 *         names — not about event-log loading. Should be config_error (1).
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = violations found (printed to stdout)
 *
 * Usage:
 *   node scripts/lint-exit-codes.mjs
 *   node scripts/lint-exit-codes.mjs --json
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const COMMANDS_DIR = join(ROOT, 'apps/wasm4pm/src/commands');

const jsonMode = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// Findings collector
// ---------------------------------------------------------------------------

/** @type {Array<{rule:string, file:string, line:number, snippet:string, detail:string}>} */
const findings = [];
let filesChecked = 0;

function report(rule, file, line, snippet, detail) {
  findings.push({ rule, file: file.replace(ROOT + '/', ''), line, snippet: snippet.trim(), detail });
}

// ---------------------------------------------------------------------------
// File walker — collects all *.ts files under commands/
// ---------------------------------------------------------------------------

function walkTs(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) entries.push(...walkTs(full));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) entries.push(full);
  }
  return entries;
}

const files = walkTs(COMMANDS_DIR);

// ---------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------

for (const filePath of files) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  filesChecked++;

  // -------------------------------------------------------------------
  // E1: process.exitCode = N  followed (within 3 lines) by `return`
  //     without an intervening exitWithFlush call.
  // -------------------------------------------------------------------
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/process\.exitCode\s*=/.test(l)) {
      // Scan ahead up to 4 lines for a bare `return` without exitWithFlush
      let foundReturn = false;
      let foundFlush = false;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/exitWithFlush/.test(lines[j])) { foundFlush = true; break; }
        if (/\breturn\b/.test(lines[j])) { foundReturn = true; break; }
      }
      if (foundReturn && !foundFlush) {
        report(
          'E1',
          filePath,
          i + 1,
          l,
          'process.exitCode = N followed by return — bypasses exitWithFlush (OTEL flush gap). ' +
          'Use: return await exitWithFlush(EXIT_CODES.X) instead.'
        );
      }
    }
  }

  // -------------------------------------------------------------------
  // E2: exitWithFlush(<numeric literal>) — hardcoded integer
  //     Allowed exceptions: none (EXIT_CODES.success is 0, but naming matters).
  // -------------------------------------------------------------------
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Match exitWithFlush followed by a bare integer (not EXIT_CODES.*)
    const m = l.match(/exitWithFlush\s*\(\s*(\d+)\s*\)/);
    if (m) {
      // Allow SIGINT/SIGTERM shutdown handlers — they are intentional
      // (watch.ts exits 0 on signal, that's correct but should still use constant)
      report(
        'E2',
        filePath,
        i + 1,
        l,
        `exitWithFlush(${m[1]}) uses a hardcoded numeric literal. ` +
        `Use EXIT_CODES.${numericToName(Number(m[1]))} instead.`
      );
    }
  }

  // -------------------------------------------------------------------
  // E3: makeResult(...) used on a code path that references a count of
  //     failures/escaped/refuted/errors, but no exit-code override is
  //     passed to makeResult (so it defaults to 0 = success).
  //
  //     Heuristic: within the same function block (bounded by class of
  //     surrounding braces), find:
  //       - a variable assigned a count of refuted/escaped/failed/errors
  //       - a makeResult(...) call WITHOUT a 4th exit-code argument
  //         (makeResult takes 4 args: command, payload, durationMs, exitCode?)
  //     Then flag if the function body also contains `final_verdict` usage
  //     that implies a non-allow verdict is possible.
  //
  //     We detect this at the block level by scanning contiguous regions
  //     between function boundaries.
  // -------------------------------------------------------------------
  const silentGatePattern = /makeResult\s*\([^)]*\)\s*;?\s*$/;

  // Collect function-level blocks heuristically: find lines containing
  // async run or function definitions, then analyse until next top-level one.
  let inBlock = false;
  let blockLines = [];
  let blockStart = 0;

  const flushBlockForE3 = (blines, bstart) => {
    const joined = blines.join('\n');
    // Does this block reference a verdict or fail count?
    const hasFailCount =
      /\b(escaped|refuted|failed|errors)\s*[=><!]/.test(joined) ||
      /\bfinal_verdict\b/.test(joined);
    if (!hasFailCount) return;

    // Does this block call makeResult without explicit exit-code (4th arg)?
    // makeResult(cmd, payload, duration) — 3 args only
    for (let i = 0; i < blines.length; i++) {
      const bl = blines[i];
      // Look for makeResult( with exactly 3 args (no 4th EXIT_CODES arg)
      // Simple heuristic: makeResult on one line with no EXIT_CODES in sight
      if (/\bmakeResult\s*\(/.test(bl) && !/EXIT_CODES/.test(bl)) {
        // Check if the same logical line continues
        const vicinity = blines.slice(Math.max(0, i - 1), i + 3).join(' ');
        if (!/EXIT_CODES/.test(vicinity)) {
          report(
            'E3',
            filePath,
            bstart + i + 1,
            bl,
            'makeResult() called with no explicit exit-code in a function that references ' +
            'failure/verdict counts — verdict=deny or escaped>0 silently exits 0. ' +
            'Pass EXIT_CODES.conformance_fail or EXIT_CODES.execution_error as 4th arg.'
          );
        }
      }
    }
  };

  // Simple block extractor: split on `async run` or standalone `run(`
  const runBoundaryRe = /\basync\s+run\b|\brun\s*\(/;
  let currentBlock = [];
  let currentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (runBoundaryRe.test(lines[i])) {
      if (currentBlock.length > 0) {
        flushBlockForE3(currentBlock, currentStart);
      }
      currentBlock = [lines[i]];
      currentStart = i;
    } else {
      currentBlock.push(lines[i]);
    }
  }
  if (currentBlock.length > 0) flushBlockForE3(currentBlock, currentStart);

  // -------------------------------------------------------------------
  // E4: makeErrorResult(..., EXIT_CODES.source_error, ...) on paths
  //     that describe missing/invalid CLI arguments or algorithm names,
  //     not event-log loading. Signs:
  //       - Error message contains "No model", "No algorithm", "not specified",
  //         "unknown", "unsupported" — arg validation vocabulary
  //       - File is NOT about XES/OCEL parsing (it will have XES refs too, but
  //         the specific makeErrorResult call message is the discriminator)
  // -------------------------------------------------------------------
  const argValidationPhrases = [
    /No model.*specified/i,
    /No algorithm.*specified/i,
    /not specified/i,
    /unknown.*algorithm/i,
    /unsupported.*algorithm/i,
    /must supply/i,
    /provide.*algorithm/i,
    /Use --model.*--algorithm/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/EXIT_CODES\.source_error/.test(l)) {
      // Look back up to 6 lines for the makeErrorResult call and its message
      const context = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      for (const phrase of argValidationPhrases) {
        if (phrase.test(context)) {
          report(
            'E4',
            filePath,
            i + 1,
            l,
            'EXIT_CODES.source_error (2) used for a missing/invalid CLI argument path. ' +
            'Source error is for event-log loading failures. ' +
            'Use EXIT_CODES.config_error (1) for missing or invalid arguments.'
          );
          break; // one finding per line
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: map numeric literal to EXIT_CODES key name
// ---------------------------------------------------------------------------

function numericToName(n) {
  const map = { 0: 'success', 1: 'config_error', 2: 'source_error', 3: 'execution_error', 4: 'partial_failure', 5: 'system_error', 6: 'conformance_fail' };
  return map[n] ?? `unknown_${n}`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (jsonMode) {
  process.stdout.write(JSON.stringify({ files_checked: filesChecked, violations: findings.length, findings }, null, 2) + '\n');
} else {
  console.log(`lint-exit-codes — ${filesChecked} files checked`);
  console.log('');
  if (findings.length === 0) {
    console.log('  No exit-code violations found.');
  } else {
    for (const f of findings) {
      console.log(`  [${f.rule}] ${f.file}:${f.line}`);
      console.log(`         ${f.snippet}`);
      console.log(`         ${f.detail}`);
      console.log('');
    }
    console.log(`  ${findings.length} violation(s) found.`);
  }
}

process.exit(findings.length > 0 ? 1 : 0);
