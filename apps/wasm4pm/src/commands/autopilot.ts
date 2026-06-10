/**
 * wpm autopilot <log>
 *
 * Closed-loop AutoML: one command on an unseen log.
 *   1. Fingerprint the log (8-dim structure vector via WASM)
 *   2. Recommend top-N algorithms from receipt-corpus evidence
 *      (static behavior corpus + runtime receipts, merged)
 *   3. Execute the winner
 *   4. Interpret quality inline
 *   5. Save a receipt whose summary fields feed the next recommendation
 *
 * Every run enriches the meta-learner corpus — the recommendation gets
 * better as receipts accumulate.
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { Kernel, computeFingerprint, type LogFingerprint } from 'wasm4pm';
import {
  readAlgoBehaviorCases,
  readRuntimeCases,
  mergeMetaCases,
  recommendAlgorithmMeta,
  checkCostModelDrift,
  type MetaRecommendation,
  type CostDriftSignal,
} from '@wasm4pm/planner';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan, withWasmSpan } from './_otel.js';
import { withLogSession } from '../with-log-session.js';
import { interpretFitness } from '../first-run-ux.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';

/**
 * Discovery algorithms autopilot is allowed to execute directly
 * (run via kernel.runRaw with no mandatory extra parameters beyond
 * activity key; heuristic_miner gets its dependency_threshold below).
 */
const EXECUTABLE_DISCOVERY = new Set([
  'dfg',
  'heuristic_miner',
  'inductive_miner',
  'alpha_plus_plus',
  'ilp',
  'hill_climbing',
  'simulated_annealing',
  'transition_system',
  'log_to_trie',
  'correlation_miner',
  'batches',
]);

/** Default corpus location (repo checkout); degrades gracefully when absent. */
const CORPUS_DIR = 'artifacts/release/algorithm-behavior-receipts';
const RUNTIME_RECEIPTS_DIR = '.wasm4pm/receipts';

/** Extract a fitness proxy from a discovery result (same heuristic as --smart). */
function fitnessProxy(raw: unknown): number {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const edges = Array.isArray((parsed as any)?.edges)
      ? (parsed as any).edges.length
      : Array.isArray((parsed as any)?.arcs)
        ? (parsed as any).arcs.length
        : 0;
    const nodes = Array.isArray((parsed as any)?.nodes)
      ? (parsed as any).nodes.length
      : Array.isArray((parsed as any)?.transitions)
        ? (parsed as any).transitions.length
        : 0;
    // Output without graph structure (e.g. optimization summaries) → neutral
    if (edges === 0 && nodes === 0) return 0.5;
    return Math.min(1, edges / Math.max(nodes * 2, 1));
  } catch {
    return 0.5;
  }
}

export const autopilot = defineCommand({
  meta: {
    name: 'autopilot',
    description:
      'Closed-loop AutoML: fingerprint a log, recommend the best algorithm from receipt evidence, run it, interpret results, and save a receipt that improves future recommendations.\n\n' +
      'EXAMPLES:\n' +
      '  wpm autopilot log.xes                  # full loop with human report\n' +
      '  wpm autopilot log.xes --top 5          # show top-5 recommendations\n' +
      '  wpm autopilot log.xes --format json    # machine-readable output',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to event log (.xes)',
      required: false,
    },
    'activity-key': {
      type: 'string',
      description: 'XES attribute for activity labels (default: concept:name)',
      default: 'concept:name',
    },
    top: {
      type: 'string',
      description: 'Number of recommendations to compute (default: 3)',
      default: '3',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress headers and decoration',
      alias: 'q',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = Boolean(ctx.args.quiet);
    const emitOptions = { format, verbose: false, quiet };
    const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
    const topN = Math.min(10, Math.max(1, parseInt(String(ctx.args.top ?? '3'), 10) || 3));

    const inputPath = ctx.args.input as string | undefined;
    if (!inputPath) {
      const result = makeErrorResult(
        'autopilot',
        new Error(
          'No input file provided.\n\n  Usage: wpm autopilot <log.xes>\n\n  Example: wpm autopilot process.xes'
        ),
        EXIT_CODES.source_error,
        'INPUT_REQUIRED'
      );
      emitResult(result, emitOptions);
      return await exitWithFlush(result.exit_code);
    }

    let lateAlgorithm = '';
    let lateFitness: number | null = null;

    return withSpan(
      'autopilot',
      { input: inputPath, activity_key: activityKey, top: topN, format },
      async () => {
        await withLogSession(
          { inputPath, activityKey, commandName: 'autopilot', emitOptions },
          async (wasm, logHandle) => {
            const kernel = new Kernel(wasm as any);
            await kernel.init();

            // ── Stage 1: fingerprint ─────────────────────────────────────
            const fingerprint: LogFingerprint = await withWasmSpan(
              'autopilot.fingerprint',
              { activity_key: activityKey },
              () => computeFingerprint(kernel, wasm as any, logHandle, activityKey)
            );

            // ── Stage 2: meta-learned recommendation ─────────────────────
            const corpusDir = existsSync(CORPUS_DIR)
              ? CORPUS_DIR
              : path.join(process.cwd(), CORPUS_DIR);
            const corpusCases = readAlgoBehaviorCases(corpusDir);
            const runtimeCases = readRuntimeCases(RUNTIME_RECEIPTS_DIR);
            const cases = mergeMetaCases(corpusCases, runtimeCases);
            const corpusSource =
              corpusCases.length > 0 && runtimeCases.length > 0
                ? 'corpus+runtime'
                : corpusCases.length > 0
                  ? 'corpus'
                  : runtimeCases.length > 0
                    ? 'runtime'
                    : 'none';

            const executableCases = cases.filter((c) =>
              EXECUTABLE_DISCOVERY.has(c.algorithm)
            );
            let recommendations: MetaRecommendation[] = recommendAlgorithmMeta(
              fingerprint.totalEvents,
              executableCases,
              topN
            );

            // Fallback when no receipt evidence exists at all: dfg is the
            // safest universally-applicable discovery algorithm.
            if (recommendations.length === 0) {
              recommendations = [
                {
                  algorithm: 'dfg',
                  score: 0,
                  estimatedMs: 0,
                  corpusMs: 0,
                  explanation: 'fallback: no receipt corpus available',
                },
              ];
            }

            const winner = recommendations[0]!.algorithm;
            lateAlgorithm = winner;

            // ── Stage 3: execute the winner ──────────────────────────────
            const params: Record<string, unknown> =
              winner === 'heuristic_miner' ? { dependency_threshold: 0.3 } : {};
            const t0 = performance.now();
            const raw = await withWasmSpan(
              'autopilot.discover',
              { algorithm: winner, activity_key: activityKey },
              () => kernel.runRaw(winner, logHandle, activityKey, params)
            );
            const elapsedMs = performance.now() - t0;
            const model = typeof raw === 'string' ? JSON.parse(raw) : raw;

            // ── Stage 4: interpret quality ───────────────────────────────
            const fitness = fitnessProxy(raw);
            lateFitness = fitness;
            const interpretation = interpretFitness(fitness);

            // Drift check on the winner (advisory)
            let drift: CostDriftSignal | undefined;
            try {
              drift = checkCostModelDrift(RUNTIME_RECEIPTS_DIR, winner);
            } catch {
              /* advisory only */
            }

            // ── Stage 5: receipt — feeds the next recommendation ─────────
            const payload = {
              status: 'success',
              algorithm: winner,
              activityKey,
              input: inputPath,
              elapsedMs: Math.round(elapsedMs * 100) / 100,
              fingerprint,
              corpusSource,
              recommendations,
              model,
              quality: { fitness_proxy: fitness },
              interpretation,
              ...(drift && { cost_drift: drift }),
            };

            let receiptRunId: string | null = null;
            try {
              const inputBytes = await fs.readFile(inputPath);
              const receipt: CommandReceipt = {
                ...newReceipt('autopilot'),
                input_hash: blake3Hex(inputBytes),
                output_hash: blake3Hex(JSON.stringify(payload)),
                status: 'success',
                summary: {
                  algorithm: winner,
                  activityKey,
                  duration_ms: Math.round(elapsedMs * 100) / 100,
                  eventCount: fingerprint.totalEvents,
                  fitness_proxy: fitness,
                },
              };
              saveCommandReceipt(receipt);
              receiptRunId = receipt.run_id;
            } catch {
              /* receipt write must never break the command */
            }

            const result = makeResult(
              'autopilot',
              { ...payload, receipt: receiptRunId ? { run_id: receiptRunId } : null },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, emitOptions, (_res, p) => {
              if (!quiet) {
                p.log('');
                p.log('Autopilot — Closed-Loop Algorithm Selection');
                p.log('===========================================');
              }

              p.log('');
              p.log('LOG FINGERPRINT');
              p.log(`  traces: ${fingerprint.traceCount.toLocaleString()}   events: ${fingerprint.totalEvents.toLocaleString()}   activities: ${fingerprint.activityCount}   variants: ${fingerprint.variantCount}`);
              p.log(`  mean trace length: ${fingerprint.meanTraceLength.toFixed(1)}   dfg density: ${fingerprint.dfgDensity.toFixed(3)}   entropy: ${fingerprint.eventEntropy.toFixed(3)}   top-10 coverage: ${fingerprint.variantTopCoverage.toFixed(2)}`);

              p.log('');
              p.log(`RECOMMENDATIONS (evidence: ${corpusSource})`);
              recommendations.forEach((rec, idx) => {
                const marker = idx === 0 ? '►' : ' ';
                p.log(`  ${marker} ${idx + 1}. ${rec.algorithm} (score: ${rec.score.toFixed(1)})`);
                p.log(`       ${rec.explanation}`);
              });

              p.log('');
              p.log('EXECUTION');
              p.log(`  ran ${winner} in ${elapsedMs.toFixed(1)}ms`);
              p.log(`  ${interpretation.emoji} fitness proxy ${(fitness * 100).toFixed(0)}% — ${interpretation.level}`);
              p.log(`  ${interpretation.explanation}`);

              if (drift?.isAlert) {
                p.log('');
                p.warn(
                  `⚠ Cost model stale for ${winner}: actual ${drift.actualMeanMs.toFixed(1)}ms vs predicted ${drift.predictedMeanMs.toFixed(1)}ms (EWMA ratio ${drift.ewmaRatio.toFixed(2)}, ${drift.trend})`
                );
              }

              if (!quiet) {
                p.log('');
                if (receiptRunId) {
                  p.log(`Receipt saved (${receiptRunId}) — this run will inform future recommendations.`);
                }
                p.log(`Next: wpm run ${path.basename(inputPath)} --algorithm ${winner} --with-quality`);
                p.log('');
              }
            });
          }
        );
      },
      () => ({ algorithm: lateAlgorithm, fitness_proxy: lateFitness ?? -1 })
    );
  },
});
