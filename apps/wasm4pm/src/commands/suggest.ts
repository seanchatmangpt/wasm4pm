/**
 * wpm suggest <log>
 *
 * Analyses a process event log and recommends the best discovery algorithm
 * for the user's stated goal (fast | balanced | quality | conformance | streaming).
 *
 * Output (human):
 *   Log Analysis: 847 traces, 4,231 events, 63 variants (7.4% unique)
 *
 *   Recommended algorithms for goal: quality
 *
 *   1. ilp            quality=90  speed=20  ~100ms  Best model quality, exact ILP
 *   2. genetic        quality=80  speed=25  ~50ms   High quality, evolutionary search
 *   3. heuristic_miner quality=50 speed=75  ~8ms    Fast iteration, lower precision
 *
 *   Run: wpm run log.xes --algorithm ilp
 *
 * Output (json):
 *   { goal, logStats, recommendations: [{algorithm, quality, speed, estimatedTimeMs, reason}] }
 */

import { defineCommand } from 'citty';
import * as path from 'node:path';
import { getSuggestions, type SuggestionGoal } from '@wasm4pm/planner';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { withLogSession } from '../with-log-session.js';

const VALID_GOALS: SuggestionGoal[] = ['fast', 'balanced', 'quality', 'conformance', 'streaming'];

/** Derive basic log statistics from the raw XES string + WASM handle. */
function deriveLogStats(xesContent: string, wasm: Record<string, unknown>, logHandle: string) {
  // Trace count: count <trace> opening tags (fast heuristic, consistent with withLogSession)
  const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;

  // Event count: count <event> opening tags
  const eventCount = (xesContent.match(/<event[\s>]/g) ?? []).length;

  // Variant count: ask WASM if available, else estimate from trace count
  let variantCount = 0;
  try {
    if (typeof wasm['get_variant_count'] === 'function') {
      const raw = (wasm['get_variant_count'] as (h: string) => unknown)(logHandle);
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) variantCount = n;
    }
  } catch {
    // WASM call is best-effort — fall through
  }

  // Fallback: approximate from unique <string key="concept:name" value="..."/> patterns
  if (variantCount === 0 && eventCount > 0) {
    // Count distinct activity names as a very rough proxy (underestimates variants)
    const activitySet = new Set<string>();
    const actRe = /key="concept:name"[^>]*value="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = actRe.exec(xesContent)) !== null) {
      activitySet.add(m[1] as string);
    }
    // A log with A distinct activities can have up to A! variants; use sqrt as heuristic
    variantCount = Math.max(1, Math.round(Math.sqrt(activitySet.size * traceCount * 0.1)));
  }

  return { traceCount, eventCount, variantCount };
}

/** Format estimated time for human display. */
function fmtTime(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `~${ms}ms`;
  return `~${(ms / 1000).toFixed(1)}s`;
}

export const suggest = defineCommand({
  meta: {
    name: 'suggest',
    description:
      'Analyse a process log and suggest the best discovery algorithm for your goal.\n\n' +
      'EXAMPLES:\n' +
      '  wpm suggest log.xes                    # Balanced recommendations (default)\n' +
      '  wpm suggest log.xes --goal fast        # Fastest algorithms only\n' +
      '  wpm suggest log.xes --goal quality     # Highest-quality algorithms\n' +
      '  wpm suggest log.xes --goal conformance # Algorithms best for conformance checking\n' +
      '  wpm suggest log.xes --format json      # Machine-readable output',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to event log (.xes, .json)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to event log — named alternative to positional',
      alias: 'i',
    },
    goal: {
      type: 'string',
      description: `Analysis goal: ${VALID_GOALS.join(' | ')} (default: balanced)`,
      default: 'balanced',
      alias: 'g',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
    verbose: {
      type: 'boolean',
      description: 'Show additional detail about each recommendation',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress headers and decoration',
      alias: 'q',
    },
    top: {
      type: 'string',
      description: 'Number of recommendations to show (default: 3)',
      default: '3',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const emitOptions = { format, verbose, quiet };

    const rawGoal = (ctx.args.goal as string) ?? 'balanced';
    const n = Math.min(10, Math.max(1, parseInt(String(ctx.args.top ?? '3'), 10) || 3));

    // Validate goal
    if (!VALID_GOALS.includes(rawGoal as SuggestionGoal)) {
      const result = makeErrorResult(
        'suggest',
        new Error(
          `Unknown goal: '${rawGoal}'.\n` +
          `  Valid goals: ${VALID_GOALS.join(', ')}\n\n` +
          `  Example: wpm suggest log.xes --goal quality`
        ),
        EXIT_CODES.config_error,
        'INVALID_GOAL'
      );
      emitResult(result, emitOptions);
      return await exitWithFlush(result.exit_code);
    }
    const goal = rawGoal as SuggestionGoal;

    // Resolve input path
    const inputPath: string | undefined =
      (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

    if (!inputPath) {
      const result = makeErrorResult(
        'suggest',
        new Error(
          'No input file provided.\n\n' +
          '  Usage: wpm suggest <log.xes> [--goal fast|balanced|quality|conformance|streaming]\n\n' +
          '  Example: wpm suggest process.xes --goal quality'
        ),
        EXIT_CODES.source_error,
        'INPUT_REQUIRED'
      );
      emitResult(result, emitOptions);
      return await exitWithFlush(result.exit_code);
    }

    let lateGoal = goal;
    let lateTraces = 0;

    return withSpan(
      'suggest',
      { goal, input: inputPath, format, top: n },
      async () => {
        // We read the raw XES content inside withLogSession so we can count traces/events
        // without a second file read. The raw content is captured via closure.
        let capturedXes = '';

        await withLogSession(
          { inputPath, activityKey: 'concept:name', commandName: 'suggest', emitOptions },
          async (wasm, logHandle) => {
            // Capture the XES content that withLogSession already read.
            // withLogSession doesn't expose the raw string, so we re-read once more
            // (small overhead, file is already OS-cached).
            try {
              const { readFile } = await import('node:fs/promises');
              capturedXes = await readFile(inputPath, 'utf-8');
            } catch {
              // If re-read fails we work with empty string → fallback stats
            }

            const stats = deriveLogStats(capturedXes, wasm, logHandle);
            lateTraces = stats.traceCount;

            const recommendations = getSuggestions(stats, goal, n);

            const variantPct =
              stats.traceCount > 0
                ? ((stats.variantCount / stats.traceCount) * 100).toFixed(1)
                : '0.0';

            const payload = {
              goal,
              logStats: {
                traceCount: stats.traceCount,
                eventCount: stats.eventCount,
                variantCount: stats.variantCount,
                variantPercent: Number(variantPct),
                logFile: path.basename(inputPath),
              },
              recommendations,
              topPick: recommendations[0]?.algorithm ?? null,
              runCommand: recommendations[0]
                ? `wpm run ${path.basename(inputPath)} --algorithm ${recommendations[0].algorithm}`
                : null,
            };

            const result = makeResult('suggest', payload, recommendations.length, EXIT_CODES.success);

            emitResult(result, emitOptions, (_res, p) => {
              if (!quiet) {
                p.log('');
                p.log(
                  `Log Analysis: ${stats.traceCount.toLocaleString()} traces, ` +
                  `${stats.eventCount.toLocaleString()} events, ` +
                  `${stats.variantCount.toLocaleString()} variants ` +
                  `(${variantPct}% unique)`
                );
                p.log('');
                p.log(`Recommended algorithms for goal: ${goal}`);
                p.log('');
              }

              const COL_ID = 22;
              const COL_Q  = 10;
              const COL_S  = 10;
              const COL_T  = 8;

              if (!quiet) {
                p.log(
                  `  ${'#'.padEnd(3)} ${'Algorithm'.padEnd(COL_ID)} ` +
                  `${'Quality'.padStart(COL_Q)} ${'Speed'.padStart(COL_S)} ` +
                  `${'Est.Time'.padStart(COL_T)}  Reason`
                );
                p.log(`  ${'─'.repeat(80)}`);
              }

              recommendations.forEach((rec, idx) => {
                const timeStr = rec.estimatedTimeMs !== undefined
                  ? fmtTime(rec.estimatedTimeMs).padStart(COL_T)
                  : ' '.repeat(COL_T);

                p.log(
                  `  ${String(idx + 1).padEnd(3)} ${rec.algorithm.padEnd(COL_ID)} ` +
                  `${String(rec.quality).padStart(COL_Q)} ${String(rec.speed).padStart(COL_S)} ` +
                  `${timeStr}  ${rec.reason}`
                );

                if (verbose && idx < recommendations.length - 1) {
                  p.log('');
                }
              });

              if (!quiet && recommendations[0]) {
                p.log('');
                p.log(`Run: wpm run ${path.basename(inputPath)} --algorithm ${recommendations[0].algorithm}`);
                p.log('');
              }
            });
          }
        );
      },
      () => ({ goal: lateGoal, trace_count: lateTraces }),
    );
  },
});
