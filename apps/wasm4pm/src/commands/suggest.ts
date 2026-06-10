/**
 * wpm suggest <log>
 *
 * Powerful recommendation engine that analyses a process event log and
 * suggests the best discovery algorithms AND follow-up analysis commands.
 *
 * Output (human):
 *   Process Mining Recommendations
 *   ================================
 *   Analyzing log: 1,247 events, 145 traces, 42 activities
 *
 *   ALGORITHM RECOMMENDATIONS
 *     1. inductive_miner (score: 0.94)
 *        Why: 145 variants + timestamps available
 *        Expected: fitness ~0.87, precision ~0.74, ~1.3s
 *
 *   ANALYSIS RECOMMENDATIONS
 *     • Run conformance check (many variants → worth verifying)
 *     • Run temporal analysis (timestamps present)
 *
 *   QUICK START
 *     wpm run log.xes --algorithm inductive_miner
 *
 * Output (json):
 *   { goal, logStats, recommendations, analysisRecommendations, topPick, runCommand }
 */

import { defineCommand } from 'citty';
import * as path from 'node:path';
import {
  getSuggestions,
  getAnalysisRecommendations,
  normaliseGoal,
  type SuggestionGoal,
  type AlgorithmRecommendation,
  type AnalysisRecommendation,
  VALID_GOALS,
} from '@wasm4pm/planner';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { withLogSession } from '../with-log-session.js';

/** Format estimated time for human display. */
function fmtTime(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `~${ms}ms`;
  if (ms < 60_000) return `~${(ms / 1000).toFixed(1)}s`;
  return `~${Math.round(ms / 60_000)}m`;
}

/** Derive comprehensive log statistics from raw XES content. */
function deriveLogStats(xesContent: string, wasm: Record<string, unknown>, logHandle: string) {
  const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
  const eventCount = (xesContent.match(/<event[\s>]/g) ?? []).length;

  // Activity count: distinct concept:name values
  const activitySet = new Set<string>();
  const actRe = /key="concept:name"[^>]*value="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = actRe.exec(xesContent)) !== null) {
    activitySet.add(m[1] as string);
  }
  const activityCount = activitySet.size;

  // Variant count: ask WASM if available
  let variantCount = 0;
  try {
    if (typeof wasm['get_variant_count'] === 'function') {
      const raw = (wasm['get_variant_count'] as (h: string) => unknown)(logHandle);
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) variantCount = n;
    }
  } catch {
    /* WASM call is best-effort */
  }
  if (variantCount === 0 && eventCount > 0) {
    variantCount = Math.max(1, Math.round(Math.sqrt(activityCount * traceCount * 0.1)));
  }

  // Detect presence of org:resource attribute (enables social mining)
  const hasResources = xesContent.includes('key="org:resource"');

  // Detect presence of time:timestamp attribute (enables temporal analysis)
  const hasTimestamps =
    xesContent.includes('key="time:timestamp"') || xesContent.includes('date key="time:timestamp"');

  return { traceCount, eventCount, variantCount, activityCount, hasResources, hasTimestamps };
}

/** Render a single algorithm recommendation block for human output. */
function renderAlgorithmRec(
  rec: AlgorithmRecommendation,
  idx: number,
  logFile: string,
  explain: boolean,
): string[] {
  const lines: string[] = [];
  const scoreStr = rec.score !== undefined ? (rec.score * 100).toFixed(0) : '?';
  lines.push(`  ${idx + 1}. ${rec.algorithm} (score: ${scoreStr})`);
  lines.push(`     Why: ${rec.reason}`);

  const fitnessStr = rec.expectedFitness !== undefined
    ? `fitness ~${(rec.expectedFitness * 100).toFixed(0)}%`
    : '';
  const precStr = rec.expectedPrecision !== undefined
    ? `precision ~${(rec.expectedPrecision * 100).toFixed(0)}%`
    : '';
  const timeStr = rec.estimatedTimeMs !== undefined ? fmtTime(rec.estimatedTimeMs) : '';

  const details = [fitnessStr, precStr, timeStr].filter(Boolean).join(', ');
  if (details) lines.push(`     Expected: ${details}`);

  if (explain && rec.explainLines && rec.explainLines.length > 0) {
    lines.push('');
    lines.push('     Reasoning breakdown:');
    for (const line of rec.explainLines) {
      lines.push(`       ${line.trim()}`);
    }
  }

  return lines;
}

/**
 * Compute the Pareto front for a set of algorithm recommendations.
 * Dominance: S1 dominates S2 if S1.quality >= S2.quality AND S1.speed >= S2.speed
 * with at least one strict inequality.
 * Tiebreak: sort by algorithm name (deterministic).
 */
export function computeParetoFront(suggestions: AlgorithmRecommendation[]): {
  front: AlgorithmRecommendation[];
  dominated: AlgorithmRecommendation[];
} {
  const front: AlgorithmRecommendation[] = [];
  const dominated: AlgorithmRecommendation[] = [];

  for (const candidate of suggestions) {
    const isDominated = suggestions.some(
      (other) =>
        other !== candidate &&
        other.quality >= candidate.quality &&
        other.speed >= candidate.speed &&
        (other.quality > candidate.quality || other.speed > candidate.speed),
    );
    if (isDominated) {
      dominated.push(candidate);
    } else {
      front.push(candidate);
    }
  }

  // Deterministic tiebreak: sort by algorithm name
  front.sort((a, b) => a.algorithm.localeCompare(b.algorithm));
  dominated.sort((a, b) => a.algorithm.localeCompare(b.algorithm));

  return { front, dominated };
}

/** Render analysis recommendations block for human output. */
function renderAnalysisRecs(
  recs: AnalysisRecommendation[],
  logFile: string,
): string[] {
  if (recs.length === 0) return [];
  const lines: string[] = [];
  lines.push('');
  lines.push('ANALYSIS RECOMMENDATIONS');
  for (const rec of recs) {
    lines.push(`  • ${rec.reason}`);
    lines.push(`    ${rec.example}`);
  }
  return lines;
}

export const suggest = defineCommand({
  meta: {
    name: 'suggest',
    description:
      'Powerful recommendation engine: analyse a log and suggest algorithms + follow-up commands.\n\n' +
      'EXAMPLES:\n' +
      '  wpm suggest log.xes                           # Balanced recommendations (default)\n' +
      '  wpm suggest log.xes --goal fast               # Fastest algorithms only\n' +
      '  wpm suggest log.xes --goal quality            # Highest-quality algorithms\n' +
      '  wpm suggest log.xes --goal "find bottlenecks" # Temporal + social analysis\n' +
      '  wpm suggest log.xes --goal "check compliance" # Conformance + validate\n' +
      '  wpm suggest log.xes --goal "predict outcomes" # Prediction pipeline\n' +
      '  wpm suggest log.xes --explain                 # Show detailed reasoning\n' +
      '  wpm suggest log.xes --format json             # Machine-readable output',
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
      description:
        `Analysis goal (default: balanced). Valid: ${VALID_GOALS.join(', ')}. ` +
        `Also accepts freeform: "find bottlenecks", "check compliance", "predict outcomes"`,
      default: 'balanced',
      alias: 'g',
    },
    explain: {
      type: 'boolean',
      description: 'Show detailed reasoning for each recommendation',
      alias: 'e',
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
    const explainMode = Boolean(ctx.args.explain);
    const emitOptions = { format, verbose, quiet };

    const rawGoal = (ctx.args.goal as string) ?? 'balanced';
    const n = Math.min(10, Math.max(1, parseInt(String(ctx.args.top ?? '3'), 10) || 3));

    // Normalize goal — accepts freeform text
    const goal: SuggestionGoal = normaliseGoal(rawGoal);

    // Resolve input path
    const inputPath: string | undefined =
      (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

    if (!inputPath) {
      const result = makeErrorResult(
        'suggest',
        new Error(
          'No input file provided.\n\n' +
          '  Usage: wpm suggest <log.xes> [--goal fast|balanced|quality|...]\n\n' +
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
      { goal, raw_goal: rawGoal, input: inputPath, format, top: n, explain: explainMode },
      async () => {
        let capturedXes = '';

        await withLogSession(
          { inputPath, activityKey: 'concept:name', commandName: 'suggest', emitOptions },
          async (wasm, logHandle) => {
            // Re-read for stat derivation (file is OS-cached)
            try {
              const { readFile } = await import('node:fs/promises');
              capturedXes = await readFile(inputPath, 'utf-8');
            } catch {
              /* fall through — stats degrade gracefully */
            }

            const stats = deriveLogStats(capturedXes, wasm, logHandle);
            lateTraces = stats.traceCount;
            lateGoal = goal;

            // Get algorithm recommendations with optional explain mode
            const recommendations = getSuggestions(stats, goal, n, explainMode);

            // Get analysis command recommendations
            const analysisRecommendations = getAnalysisRecommendations(stats, goal);

            const logBasename = path.basename(inputPath);
            const variantPct =
              stats.traceCount > 0
                ? ((stats.variantCount / stats.traceCount) * 100).toFixed(1)
                : '0.0';

            const { front: paretoFront, dominated: paretoDominated } = computeParetoFront(recommendations);

            const payload = {
              goal,
              raw_goal: rawGoal,
              logStats: {
                traceCount: stats.traceCount,
                eventCount: stats.eventCount,
                variantCount: stats.variantCount,
                variantPercent: Number(variantPct),
                activityCount: stats.activityCount,
                hasResources: stats.hasResources,
                hasTimestamps: stats.hasTimestamps,
                logFile: logBasename,
              },
              recommendations,
              paretoFront,
              dominated: paretoDominated,
              analysisRecommendations,
              topPick: recommendations[0]?.algorithm ?? null,
              runCommand: recommendations[0]
                ? `wpm run ${logBasename} --algorithm ${recommendations[0].algorithm}`
                : null,
            };

            const result = makeResult(
              'suggest',
              payload,
              recommendations.length,
              EXIT_CODES.success
            );

            emitResult(result, emitOptions, (_res, p) => {
              if (!quiet) {
                p.log('');
                p.log('Process Mining Recommendations');
                p.log('================================');
                p.log(
                  `Analyzing log: ${stats.eventCount.toLocaleString()} events, ` +
                  `${stats.traceCount.toLocaleString()} traces, ` +
                  `${stats.activityCount} activities` +
                  (stats.variantCount > 0 ? `, ${stats.variantCount} variants (${variantPct}% unique)` : '')
                );
                if (stats.hasResources) p.log('  (org:resource attribute present — social mining available)');
                if (stats.hasTimestamps) p.log('  (time:timestamp attribute present — temporal analysis available)');
              }

              p.log('');
              p.log('ALGORITHM RECOMMENDATIONS');

              recommendations.forEach((rec, idx) => {
                const recLines = renderAlgorithmRec(rec, idx, logBasename, explainMode);
                for (const line of recLines) {
                  p.log(line);
                }
                if (idx < recommendations.length - 1) p.log('');
              });

              // Pareto front section
              if (paretoFront.length > 0) {
                p.log('');
                p.log('PARETO FRONT (non-dominated)');
                for (const rec of paretoFront) {
                  p.log(`  • ${rec.algorithm} (quality=${rec.quality}, speed=${rec.speed}, score=${(rec.score * 100).toFixed(0)})`);
                }
              }

              // Analysis recommendations
              const analysisLines = renderAnalysisRecs(analysisRecommendations, logBasename);
              for (const line of analysisLines) {
                p.log(line);
              }

              if (!quiet && recommendations[0]) {
                p.log('');
                p.log('QUICK START');
                p.log(`  wpm run ${logBasename} --algorithm ${recommendations[0].algorithm}`);
                if (analysisRecommendations.length > 0) {
                  p.log(`  ${analysisRecommendations[0]!.example}`);
                }
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
