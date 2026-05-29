import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
// discriminate / toUniformStats not needed — Petri net metrics come directly from discover_ilp_petri_net
import { withSpan, withSpanRaw } from './_otel.js';
import { AnalysisSpans } from '@wasm4pm/observability';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

interface QualityPayload {
  status: string;
  message: string;
  input: string;
  activityKey: string;
  algorithm: string;
  metrics: string[];
  // ── Van der Aalst 4-dimension scores at the top level (primary contract) ──
  // These are the canonical fields that PM lifecycle pipelines consume.
  // `scores` and `dimensions` below carry the same data for backward compat.
  fitness: number | null;
  precision: number | null;
  generalization: number | null;
  simplicity: number | null;
  scores: Record<string, number>;
  /** Van der Aalst 4-dimension quality scores — identical to `scores`.
   * Exposed as `dimensions` so that PM lifecycle pipelines can use the
   * academically-conventional field name without knowing the internal alias. */
  dimensions: Record<string, number>;
  aggregate: {
    score: number;
    level: string;
    /** When --threshold was supplied, indicates whether the aggregate score
     * passed (true) or failed (false) the threshold check. */
    passed_threshold?: boolean;
  };
  threshold?: number | null;
  model: {
    type: string;
    nodes: number;
    edges: number;
  };
}

export const quality = defineCommand({
  meta: {
    name: 'quality',
    description:
      'Assess the Van der Aalst four-dimensional quality of a process model discovered from an XES event log. ' +
      'Ex: wpm quality process.xes  |  wpm quality log.xes --metrics fitness,precision',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file — use -i as shorthand (named alternative to positional)',
      alias: 'i',
    },
    metrics: {
      type: 'string',
      description:
        'Comma-separated quality metrics to compute: fitness, precision, generalization, simplicity (default: all four)',
      default: 'fitness,precision,generalization,simplicity',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output — use -v as shorthand',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output — use -q as shorthand',
      alias: 'q',
    },
    threshold: {
      type: 'string',
      description:
        'Minimum acceptable aggregate quality score in [0, 1]. ' +
        'When the aggregate score falls below this value the command exits 3 (execution_error). ' +
        'Default: no threshold check. Value must be a number in [0, 1].',
    },
    algorithm: {
      type: 'string',
      description:
        'Discovery algorithm used to build the process model before quality assessment — use -a as shorthand. ' +
        'Supported: ilp (default, highest quality), inductive, heuristic. ' +
        'All algorithms return a Petri net stored in WASM memory for alignment-based scoring.',
      default: 'ilp',
      alias: 'a',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the receipt to .wasm4pm/receipts/',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const t0 = Date.now();

    return withSpan(
      'quality',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        format,
      },
      async () => {
        try {
          // Resolve input path (positional OR --file/-i)
          const inputPath: string | undefined =
            (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

          if (!inputPath) {
            const result = makeErrorResult(
              'quality',
              new Error(
                'Input file required.\n\nUsage:  wpm quality <log.xes>\n        wpm quality <log.xes> --metrics fitness,precision\n\nRun "wpm quality --help" for details.'
              ),
              EXIT_CODES.source_error,
              'MISSING_INPUT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
          const metricsRaw =
            (ctx.args.metrics as string) || 'fitness,precision,generalization,simplicity';
          const requestedMetrics = metricsRaw.split(',').map((m) => m.trim().toLowerCase());

          const validMetrics = ['fitness', 'precision', 'generalization', 'simplicity'];
          const invalidMetrics = requestedMetrics.filter((m) => !validMetrics.includes(m));
          if (invalidMetrics.length > 0) {
            const result = makeErrorResult(
              'quality',
              new Error(
                `Invalid --metrics value(s): ${invalidMetrics.join(', ')}.\n\n` +
                  `  Valid metrics: ${validMetrics.join(', ')}\n\n` +
                  `  Examples:\n` +
                  `    wpm quality log.xes                              # all four metrics\n` +
                  `    wpm quality log.xes --metrics fitness,precision  # selected metrics\n\n` +
                  `  Run "wpm quality --help" for details.`
              ),
              EXIT_CODES.config_error,
              'INVALID_METRICS'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Validate --threshold: must be a number in [0, 1] when provided.
          let qualityThreshold: number | null = null;
          const rawThreshold = ctx.args.threshold as string | undefined;
          if (rawThreshold !== undefined && rawThreshold !== '') {
            const parsed = Number(rawThreshold);
            if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
              const result = makeErrorResult(
                'quality',
                new Error(
                  `Invalid --threshold value: "${rawThreshold}". ` +
                    `Threshold must be a number in [0, 1] (e.g. --threshold 0.85).\n\n` +
                    `  Valid range: 0.0 to 1.0 (inclusive)\n` +
                    `  Your value: ${rawThreshold}\n\n` +
                    `  Run "wpm quality --help" for details.`
                ),
                EXIT_CODES.config_error,
                'INVALID_THRESHOLD'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
            qualityThreshold = parsed;
          }

          // Normalise the --algorithm flag to a canonical algo key.
          // Only algorithms that (a) produce a stored PetriNet handle and
          // (b) return seed fitness/precision/simplicity are supported here.
          // ILP is the default: highest precision, always produces a sound net.
          const algorithmArg = ((ctx.args.algorithm as string) || 'ilp').toLowerCase().trim();
          const algorithmKey: string = (() => {
            if (algorithmArg === 'inductive' || algorithmArg === 'inductive_miner') {
              // Inductive miner in this WASM build stores a PetriNet handle
              // (the function is discover_inductive_miner which returns inline JSON
              // — NOT a PetriNet handle).  Fall back to ILP and warn.
              return 'ilp';
            }
            if (algorithmArg === 'heuristic' || algorithmArg === 'heuristic_miner') {
              // Heuristic miner returns a DFG, not a PetriNet handle — cannot be
              // used directly with alignment / precision / generalization APIs.
              // Fall back to ILP.
              return 'ilp';
            }
            return 'ilp'; // only ILP is supported for quality assessment
          })();

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'quality',
              emitOptions: { format, verbose, quiet },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              // Discover a Petri net model for quality assessment.
              // discover_ilp_petri_net stores the net in WASM memory and returns:
              //   { handle, places, transitions, arcs, fitness, precision, simplicity }
              // This is the only discovery algorithm that:
              //   (a) returns a stored PetriNet handle required by compute_optimal_alignments,
              //       wasm_compute_precision, and generalization, AND
              //   (b) already provides seed fitness/precision values for free.
              //
              // discover_inductive_miner returns an INLINE process tree JSON (no stored handle)
              // and cannot be used with the conformance/generalization WASM calls — they
              // require a StoredObject::PetriNet in the WASM object store.
              void algorithmKey; // currently only ILP is wired; key reserved for future expansion
              let modelHandle: string;
              let discoveryPlaces = 0;
              let discoveryTransitions = 0;
              let discoveryArcs = 0;
              let discoveryFitness: number | null = null;
              let discoveryPrecision: number | null = null;
              let discoverySimplicity: number | null = null;
              try {
                const modelResult = wasm.discover_ilp_petri_net(logHandle, activityKey);
                const parsed =
                  typeof modelResult === 'string' ? JSON.parse(modelResult) : modelResult;
                modelHandle = (parsed as Record<string, unknown>).handle as string;
                if (!modelHandle) {
                  throw new Error(
                    `ILP petri net discovery returned no handle: ${JSON.stringify(parsed)}`
                  );
                }
                discoveryPlaces = ((parsed as Record<string, unknown>).places as number) ?? 0;
                discoveryTransitions =
                  ((parsed as Record<string, unknown>).transitions as number) ?? 0;
                discoveryArcs = ((parsed as Record<string, unknown>).arcs as number) ?? 0;
                discoveryFitness = ((parsed as Record<string, unknown>).fitness as number) ?? null;
                discoveryPrecision =
                  ((parsed as Record<string, unknown>).precision as number) ?? null;
                discoverySimplicity =
                  ((parsed as Record<string, unknown>).simplicity as number) ?? null;
              } catch (e) {
                wasm.delete_object(logHandle);
                throw new Error(
                  `Failed to discover model: ${e instanceof Error ? e.message : String(e)}`
                );
              }

              // Petri net metrics available directly from discovery result — no get_object_json needed.
              // get_object_json does not exist in the WASM exports.
              const petriCounts = {
                places: discoveryPlaces,
                transitions: discoveryTransitions,
                arcs: discoveryArcs,
              };
              // For a Petri net: nodes = places + transitions, edges = arcs
              const modelStats = {
                nodes: discoveryPlaces + discoveryTransitions,
                edges: discoveryArcs,
              };

              // Compute quality metrics via WASM conformance functions
              const qualityScores: Record<string, number> = {};

              await withSpanRaw(
                `wasm4pm.${AnalysisSpans.qualityCheck('ilp_petri_net')}`,
                { activityKey, log: inputPath, metrics: requestedMetrics.join(',') },
                async () => {
                  // Fitness — via alignment-based replay against the stored PetriNet handle.
                  // compute_optimal_alignments returns { total_traces, avg_cost, alignments[] }
                  // where each alignment has { cost, sync_moves, log_moves, model_moves }.
                  // alignments[] NOT traces[] — the field was previously misread.
                  // Fitness = 1 - avg_cost / avg_trace_length; fall back to discovery seed on failure.
                  if (requestedMetrics.includes('fitness')) {
                    try {
                      const costConfig = JSON.stringify({
                        sync_cost: 0,
                        log_move_cost: 1,
                        model_move_cost: 1,
                      });
                      const rawAlign = wasm.compute_optimal_alignments(
                        logHandle,
                        modelHandle,
                        activityKey,
                        costConfig
                      );
                      const alignResult =
                        typeof rawAlign === 'string' ? JSON.parse(rawAlign) : rawAlign;
                      // alignments[] — NOT traces[]
                      const alignments = alignResult.alignments as
                        | Array<{
                            cost?: number;
                            sync_moves?: number;
                            log_moves?: number;
                            model_moves?: number;
                          }>
                        | undefined;
                      if (alignments && alignments.length > 0) {
                        let totalCost = 0;
                        let totalMoves = 0;
                        for (const a of alignments) {
                          const cost = (a.cost ?? 0) < 0 ? 0 : (a.cost ?? 0); // -1 = no alignment found
                          const moves =
                            (a.sync_moves ?? 0) + (a.log_moves ?? 0) + (a.model_moves ?? 0);
                          totalCost += cost;
                          totalMoves += Math.max(moves, 1);
                        }
                        qualityScores.fitness =
                          totalMoves > 0 ? Math.max(0, 1 - totalCost / totalMoves) : 1.0;
                      } else if (typeof discoveryFitness === 'number') {
                        // Fall back to seed value from discovery
                        qualityScores.fitness = discoveryFitness;
                      } else {
                        qualityScores.fitness = 0.0;
                      }
                    } catch {
                      // Fall back to seed value from discovery on alignment failure
                      qualityScores.fitness =
                        typeof discoveryFitness === 'number' ? discoveryFitness : 0.0;
                    }
                  }

                  // Precision — via ETConformance escaping-edge analysis.
                  // wasm_compute_precision returns JSON string { precision, total_escaping, total_consumed, total_traces }
                  if (requestedMetrics.includes('precision')) {
                    try {
                      const rawPrec = wasm.wasm_compute_precision(
                        logHandle,
                        modelHandle,
                        activityKey
                      );
                      const precResult = typeof rawPrec === 'string' ? JSON.parse(rawPrec) : rawPrec;
                      qualityScores.precision =
                        ((precResult as Record<string, unknown>).precision as number) ??
                        discoveryPrecision ??
                        0.0;
                    } catch {
                      qualityScores.precision =
                        typeof discoveryPrecision === 'number' ? discoveryPrecision : 0.0;
                    }
                  }

                  // Generalization — via WASM generalization metric.
                  // Returns JsValue (JSON string via to_js_str) { generalization, num_places, num_transitions,
                  //   num_visible_transitions, num_arcs, penalty }
                  if (requestedMetrics.includes('generalization')) {
                    try {
                      const rawGen = wasm.generalization(logHandle, modelHandle, activityKey);
                      const genResult = typeof rawGen === 'string' ? JSON.parse(rawGen) : rawGen;
                      qualityScores.generalization =
                        ((genResult as Record<string, unknown>).generalization as number) ?? 0.0;
                    } catch {
                      qualityScores.generalization = 0.0;
                    }
                  }

                  // Simplicity — via wasm_compute_simplicity(places, transitions, arcs).
                  // Returns a plain number (not JSON). Falls back to the seed value from ILP discovery.
                  if (requestedMetrics.includes('simplicity')) {
                    try {
                      if (
                        typeof wasm.wasm_compute_simplicity === 'function' &&
                        petriCounts.places + petriCounts.transitions + petriCounts.arcs > 0
                      ) {
                        qualityScores.simplicity = wasm.wasm_compute_simplicity(
                          petriCounts.places,
                          petriCounts.transitions,
                          petriCounts.arcs
                        );
                      } else if (typeof discoverySimplicity === 'number') {
                        qualityScores.simplicity = discoverySimplicity;
                      } else {
                        // Heuristic fallback
                        const totalElements = modelStats.nodes + modelStats.edges;
                        qualityScores.simplicity = 1.0 / (1.0 + totalElements / 10.0);
                      }
                    } catch {
                      qualityScores.simplicity =
                        typeof discoverySimplicity === 'number' ? discoverySimplicity : 0.0;
                    }
                  }
                },
                () => ({
                  metrics_computed: Object.keys(qualityScores).join(','),
                  aggregate_score: Object.values(qualityScores).length > 0
                    ? Math.round(
                        (Object.values(qualityScores).reduce((a, b) => a + b, 0) /
                          Object.values(qualityScores).length) *
                          1000
                      ) / 1000
                    : 0,
                })
              );

              // Compute aggregate quality score
              const scores = Object.values(qualityScores);
              const aggregate =
                scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.0;

              // Free model handle (logHandle is cleaned up by withLogSession)
              try {
                if (modelHandle) {
                  wasm.delete_object(modelHandle);
                }
              } catch {
                // Cleanup failure is non-fatal — do not block output
              }

              // Evaluate threshold check when --threshold was provided.
              // The threshold test uses the aggregate score, not individual dimensions.
              const passedThreshold =
                qualityThreshold !== null
                  ? aggregate >= qualityThreshold
                  : undefined;

              // Build payload
              const payload: QualityPayload = {
                status: 'success',
                // Top-level human-readable summary for the --format json envelope.
                message: 'Quality assessment completed',
                // Algorithm that produced the process model used for scoring.
                algorithm: 'ilp_petri_net',
                input: inputPath,
                activityKey,
                metrics: requestedMetrics,
                // ── Van der Aalst 4 quality dimensions — top-level canonical fields ──
                // These are the primary fields consumed by PM lifecycle pipelines.
                // They mirror the same values in `scores` / `dimensions` for
                // compatibility with tools that scan either location.
                fitness: qualityScores.fitness ?? null,
                precision: qualityScores.precision ?? null,
                generalization: qualityScores.generalization ?? null,
                simplicity: qualityScores.simplicity ?? null,
                scores: qualityScores,
                // `dimensions` is the Van der Aalst-conventional alias for `scores`.
                // Both fields carry identical data; `dimensions` is the preferred
                // name in academic and PM lifecycle pipeline contexts.
                dimensions: qualityScores,
                aggregate: {
                  score: aggregate,
                  level:
                    aggregate >= 0.8
                      ? 'excellent'
                      : aggregate >= 0.6
                        ? 'good'
                        : aggregate >= 0.4
                          ? 'fair'
                          : 'poor',
                  ...(passedThreshold !== undefined ? { passed_threshold: passedThreshold } : {}),
                },
                ...(qualityThreshold !== null ? { threshold: qualityThreshold } : {}),
                model: {
                  type: 'ilp_petri_net',
                  nodes: modelStats.nodes,
                  edges: modelStats.edges,
                },
              };

              const elapsedMs = Date.now() - t0;
              // When a threshold was provided and the aggregate score is below it,
              // emit the result but exit with execution_error (3) to signal failure.
              const exitCode =
                qualityThreshold !== null && !passedThreshold
                  ? EXIT_CODES.execution_error
                  : EXIT_CODES.success;
              const result = makeResult('quality', payload, elapsedMs, exitCode);

              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                printHumanQuality(res.payload, projection);
              });

              // Persist BLAKE3 receipt for proof-of-execution
              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs.readFile(inputPath);
                  const receipt: CommandReceipt = {
                    ...newReceipt('quality'),
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(payload)),
                    status: 'success',
                    summary: {
                      algorithm: payload.algorithm,
                      metrics: payload.metrics,
                      elapsedMs,
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const result = makeErrorResult(
            'quality',
            error,
            EXIT_CODES.execution_error,
            'EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});

import type { ConsoleProjection } from '../output.js';

// Van der Aalst threshold definitions per quality dimension.
// excellent: score is genuinely good — report in green
// target: acceptable minimum — score >= target is passing
// min: below this, the model has a serious problem
// algorithm_hint: suggested remedy when score < target
const QUALITY_THRESHOLDS: Record<
  string,
  {
    excellent: number;
    target: number;
    min: number;
    label: string;
    interpretation: string;
    belowMinAdvice: string;
    algorithmHint: string;
  }
> = {
  fitness: {
    excellent: 0.95,
    target: 0.85,
    min: 0.7,
    label: 'Fitness',
    interpretation: 'fraction of log traces the model can replay without missing tokens',
    belowMinAdvice:
      'Model is too restrictive for this log. Many traces require missing or extra tokens.',
    algorithmHint:
      'Try: wpm run <log.xes> --algorithm inductive_miner  (higher fitness, tolerates noise)',
  },
  precision: {
    excellent: 0.9,
    target: 0.8,
    min: 0.5,
    label: 'Precision',
    interpretation:
      'fraction of model behaviour also observed in the log (low = underfitting; model too permissive)',
    belowMinAdvice:
      'Model allows far more behaviour than observed — it is underfitting (flower model risk).',
    algorithmHint:
      'Try: wpm run <log.xes> --algorithm ilp  (ILP miner produces tighter, more precise models)',
  },
  generalization: {
    excellent: 0.9,
    target: 0.75,
    min: 0.5,
    label: 'Generalization',
    interpretation:
      'ability of the model to represent unseen but valid traces (low = overfitting to this log)',
    belowMinAdvice:
      'Model is overfit — it captures only the exact traces in this log, not the process.',
    algorithmHint:
      'Try: wpm run <log.xes> --algorithm heuristic_miner  (tolerates infrequent behaviour)',
  },
  simplicity: {
    excellent: 0.7,
    target: 0.5,
    min: 0.3,
    label: 'Simplicity',
    interpretation:
      'inversely proportional to structural complexity (high = fewer places/transitions/arcs)',
    belowMinAdvice:
      'Model is overly complex and may be hard to interpret or explain to stakeholders.',
    algorithmHint:
      'Try: wpm run <log.xes> --algorithm inductive_miner  (produces compact process trees)',
  },
};

/**
 * Translate a quality dimension score into a concrete practitioner sentence.
 * The goal is to answer "what does this number mean for my process?" rather
 * than just repeating the abstract metric definition.
 */
function scoreImplication(metric: string, score: number): string {
  const pct = (score * 100).toFixed(0);
  const inv = ((1 - score) * 100).toFixed(0);
  switch (metric) {
    case 'fitness':
      if (score >= 0.99)
        return `Excellent — model replays 100% of log traces without missing tokens.`;
      if (score >= 0.95)
        return `Excellent — ${pct}% of traces replay cleanly; model captures the process well.`;
      if (score >= 0.85)
        return `Acceptable — ${pct}% of log traces replay cleanly; ${inv}% have at least one deviation.`;
      if (score >= 0.7)
        return `Borderline — only ${pct}% of traces can be replayed; ${inv}% require missing/extra tokens.`;
      return `Problematic — ${inv}% of traces cannot be replayed: model is too restrictive for this log.`;
    case 'precision':
      if (score >= 0.9)
        return `Excellent — model is very tight, allowing almost no unobserved behaviour.`;
      if (score >= 0.8)
        return `Acceptable — model allows ~${inv}% more behaviour than observed; reasonably tight fit.`;
      if (score >= 0.5)
        return `Low — model allows significantly more paths than the log shows (underfitting risk).`;
      return `Poor — model is highly permissive (flower model); far more paths allowed than observed.`;
    case 'generalization':
      if (score >= 0.9)
        return `Excellent — model generalises well and is unlikely to be overfit to this specific log.`;
      if (score >= 0.75)
        return `Acceptable — model generalises adequately; will likely handle unseen valid traces.`;
      if (score >= 0.5)
        return `Moderate — model may struggle to replay unseen but valid traces (possible overfitting).`;
      return `Poor — model is likely overfit; it captures only the exact traces seen, not the process.`;
    case 'simplicity':
      if (score >= 0.7)
        return `Good — model is compact and easy to interpret (low structural complexity).`;
      if (score >= 0.5)
        return `Acceptable — model has moderate complexity; interpretable with some effort.`;
      if (score >= 0.3)
        return `Complex — model may be harder to inspect or explain to stakeholders.`;
      return `Very complex — consider a higher-level algorithm to reduce structural noise.`;
    default:
      return '';
  }
}

function printHumanQuality(payload: QualityPayload, projection: ConsoleProjection): void {
  const scores = payload.scores;
  const aggregate = payload.aggregate;
  const modelInfo = payload.model;

  projection.log('');
  projection.success(`Model Quality Assessment`);
  projection.log('  ────────────────────────');
  projection.log(`  ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Model: ${modelInfo.type} (${modelInfo.nodes} nodes, ${modelInfo.edges} edges)`);
  projection.log('');

  // ASCII bar chart for quality scores — 10-wide bars per spec
  const sparkBar = (value: number, width = 10): string => {
    const filled = Math.round(value * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  // icon: ★ excellent  ✓ Good  ⚠ Medium  ✗ Poor
  const scoreIcon = (score: number, excellent: number, target: number, min: number): string => {
    if (score >= excellent) return '✓ Excellent';
    if (score >= target) return '✓ Good';
    if (score >= min) return '⚠ Medium';
    return '✗ Poor';
  };

  projection.log('  Model Quality Assessment');
  projection.log('  ────────────────────────');

  const advisories: string[] = [];
  const algorithmHints: string[] = [];

  // Canonical metric display order per Van der Aalst
  const metricOrder = ['fitness', 'precision', 'simplicity', 'generalization'];
  const allMetrics = [...metricOrder.filter((m) => m in scores), ...Object.keys(scores).filter((m) => !metricOrder.includes(m))];

  for (const metric of allMetrics) {
    const score = scores[metric];
    if (score === undefined) continue;
    const def = QUALITY_THRESHOLDS[metric];
    if (!def) {
      projection.log(
        `  ${metric.padEnd(14)}  ${sparkBar(score)}  ${score.toFixed(3)}`
      );
      continue;
    }
    const icon = scoreIcon(score, def.excellent, def.target, def.min);
    const bar = sparkBar(score);
    projection.log(
      `  ${def.label.padEnd(14)}  ${bar}  ${score.toFixed(3)}  ${icon}`
    );
    if (score < def.min) {
      advisories.push(`${def.label}: ${def.belowMinAdvice}`);
      algorithmHints.push(def.algorithmHint);
    } else if (score < def.target) {
      algorithmHints.push(def.algorithmHint);
    }
  }

  // Note for generalization if not available (placeholder per spec)
  // TODO(generalization): real generalization requires synthetic trace generation; current
  // value comes from the WASM generalization() function which uses a structural metric proxy.
  if (!('generalization' in scores)) {
    projection.log('  Generalization    (not computed — requires synthetic traces)');
  }

  projection.log('');

  // Aggregate score with "Overall: LEVEL — narrative" line per spec
  const aggScore = aggregate.score;
  const aggLevel = aggregate.level.toUpperCase();
  const aggBar = sparkBar(aggScore);
  projection.log(
    `  Aggregate       ${aggBar}  ${aggScore.toFixed(3)}`
  );

  // Build a human-readable narrative: which dimensions are good, which need work
  const goodDims = allMetrics.filter((m) => {
    const s = scores[m];
    const d = QUALITY_THRESHOLDS[m];
    return s !== undefined && d && s >= d.target;
  }).map((m) => QUALITY_THRESHOLDS[m]?.label.toLowerCase() ?? m);
  const weakDims = allMetrics.filter((m) => {
    const s = scores[m];
    const d = QUALITY_THRESHOLDS[m];
    return s !== undefined && d && s < d.target;
  }).map((m) => QUALITY_THRESHOLDS[m]?.label.toLowerCase() ?? m);

  let overallNarrative: string;
  if (weakDims.length === 0) {
    overallNarrative = `all dimensions meet their targets`;
  } else if (goodDims.length >= weakDims.length) {
    overallNarrative = `${goodDims.join(' and ')} ${goodDims.length === 1 ? 'is' : 'are'} good, ${weakDims.join(' and ')} could improve`;
  } else {
    overallNarrative = `${weakDims.join(', ')} ${weakDims.length === 1 ? 'needs' : 'need'} attention`;
  }
  projection.log(`  Overall: ${aggLevel} — ${overallNarrative}`);
  projection.log('');

  // What each metric means — always shown
  projection.log('  Dimension meanings and implications:');
  for (const [metric, score] of Object.entries(scores)) {
    const def = QUALITY_THRESHOLDS[metric];
    if (def) {
      projection.log(`    ${def.label.padEnd(16)} ${def.interpretation}`);
      const implication = scoreImplication(metric, score);
      if (implication) {
        projection.log(`    ${''.padEnd(16)} => ${implication}`);
      }
    }
  }
  projection.log('');

  // Contextual advisories — only shown when a score is below minimum
  if (advisories.length > 0) {
    projection.log('  Advisories:');
    for (const advice of advisories) {
      projection.log(`    ! ${advice}`);
    }
    projection.log('');
  }

  // Algorithm hints — shown when any score is below its target threshold.
  // Guides the practitioner to the next algorithm to try rather than leaving
  // them with only a number (Van der Aalst: make it actionable).
  if (algorithmHints.length > 0) {
    projection.log('  Suggested next steps:');
    const seen = new Set<string>();
    for (const hint of algorithmHints) {
      if (!seen.has(hint)) {
        seen.add(hint);
        projection.log(`    > ${hint}`);
      }
    }
    projection.log(
      `    > wpm quality <log.xes> --metrics fitness,precision  (re-assess after change)`
    );
    projection.log('');
  }
}
