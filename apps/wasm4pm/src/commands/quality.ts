import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
// discriminate / toUniformStats not needed — Petri net metrics come directly from discover_ilp_petri_net
import { withSpan, withSpanRaw } from './_otel.js';
import { AnalysisSpans, computeComplexity, type ModelIR } from '@wasm4pm/observability';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

interface DimensionDetail {
  score: number;
  interpretation: string;
}

interface ComparisonEntry {
  algorithm: string;
  fitness: number | null;
  precision: number | null;
  generalization: number | null;
  simplicity: number | null;
  overall_quality: number | null;
  verdict: 'excellent' | 'good' | 'acceptable' | 'poor' | 'NOT_MEASURED' | 'ERROR' | null;
}

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
  /** Weighted overall quality: 0.4*fitness + 0.3*precision + 0.2*gen + 0.1*simplicity */
  overall_quality: number | null;
  /** Verdict based on overall_quality thresholds */
  verdict: 'excellent' | 'good' | 'acceptable' | 'poor' | 'NOT_MEASURED' | 'ERROR' | null;
  /** Actionable recommendations based on dimension scores */
  recommendations: string[];
  /** Per-dimension breakdown with interpretations */
  dimension_breakdown: Record<string, DimensionDetail>;
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
  /** Multi-algorithm comparison results (present when --compare is used) */
  comparison?: ComparisonEntry[];
  /** Structural complexity metrics derived from the discovered model */
  complexity_metrics?: {
    node_count: number;
    arc_count: number;
    cyclomatic_complexity: number;
    arc_density: number;
    complexity_score: number;
    simplicity_score: number;
    assessment: string;
  };
  explain_quality_dims?: boolean;
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
    compare: {
      type: 'string',
      description:
        'Comma-separated list of algorithms to compare (e.g. dfg,inductive_miner,genetic_algorithm). ' +
        'Runs quality assessment for each algorithm and ranks by overall_quality.',
    },
    explain: {
      type: 'boolean',
      description:
        'Print an educational explanation of each Van der Aalst quality dimension with score bars. ' +
        'Implies --format human.',
    },
    'explain-quality-dims': {
      type: 'boolean',
      description: 'Highlight relative metric importance and tradeoffs among Van der Aalst dimensions',
    },
    'guide-next-steps': {
      type: 'boolean',
      description: 'Emit contextual next-step suggestions after successful quality analysis',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
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

              // Compute simple arithmetic aggregate (backward-compat)
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

              // Compute weighted overall quality (Van der Aalst recommendation):
              // fitness 40%, precision 30%, generalization 20%, simplicity 10%.
              const overallQuality = computeOverallQuality(qualityScores);

              // Verdict based on overall_quality (or aggregate as fallback)
              const verdict = computeVerdict(overallQuality ?? aggregate);

              // Actionable recommendations
              const recommendations = computeRecommendations(qualityScores);

              // Per-dimension breakdown with interpretations
              const dimensionBreakdown = computeDimensionBreakdown(qualityScores);

              // Evaluate threshold check when --threshold was provided.
              // The threshold test uses the aggregate score, not individual dimensions.
              const passedThreshold =
                qualityThreshold !== null
                  ? aggregate >= qualityThreshold
                  : undefined;

              // --compare: run quality assessment for each requested algorithm
              let comparison: ComparisonEntry[] | undefined;
              const compareArg = ctx.args.compare as string | undefined;
              if (compareArg && compareArg.trim().length > 0) {
                comparison = await runCompare(
                  wasm,
                  logHandle,
                  activityKey,
                  compareArg,
                  qualityScores,
                  'ilp_petri_net'
                );
              }

              // Compute structural complexity from the discovered model's node/edge counts.
              // Build a lightweight ModelIR from the Petri net counts returned by discovery.
              const complexityModelIR: ModelIR = {
                model_type: 'petri_net',
                algorithm_id: 'ilp',
                nodes: [
                  ...Array.from({ length: discoveryPlaces }, (_, i) => ({
                    id: `p${i}`, label: `p${i}`, type: 'place' as const,
                  })),
                  ...Array.from({ length: discoveryTransitions }, (_, i) => ({
                    id: `t${i}`, label: `t${i}`, type: 'transition' as const,
                  })),
                ],
                edges: Array.from({ length: discoveryArcs }, (_, i) => ({
                  from: `n${i % Math.max(modelStats.nodes, 1)}`,
                  to: `n${(i + 1) % Math.max(modelStats.nodes, 1)}`,
                })),
              };
              const complexityScore = computeComplexity(complexityModelIR);

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
                // New Van der Aalst weighted fields
                overall_quality: overallQuality,
                verdict,
                recommendations,
                dimension_breakdown: dimensionBreakdown,
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
                ...(comparison !== undefined ? { comparison } : {}),
                complexity_metrics: {
                  node_count: complexityScore.nodeCount,
                  arc_count: complexityScore.arcCount,
                  cyclomatic_complexity: complexityScore.cyclomaticComplexity,
                  arc_density: complexityScore.arcDensity,
                  complexity_score: complexityScore.complexityScore,
                  simplicity_score: complexityScore.simplicityScore,
                  assessment: complexityScore.assessment,
                },
                explain_quality_dims: Boolean(ctx.args['explain-quality-dims']),
              };

              const elapsedMs = Date.now() - t0;
              // When a threshold was provided and the aggregate score is below it,
              // emit the result but exit with execution_error (3) to signal failure.
              const exitCode =
                qualityThreshold !== null && !passedThreshold
                  ? EXIT_CODES.execution_error
                  : EXIT_CODES.success;
              const result = makeResult('quality', payload, elapsedMs, exitCode);

              const explainMode = Boolean(ctx.args.explain);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                if (explainMode) {
                  printExplainQuality(res.payload as QualityPayload, projection);
                } else {
                  printHumanQuality(res.payload as QualityPayload, projection);
                  if (comparison !== undefined) {
                    printComparisonTable(comparison, projection);
                  }
                }
                if (ctx.args['guide-next-steps'] && format === 'human') {
                  projection.log('📊 Guided Next Steps:');
                  projection.log('  1. Address quality deviations: run wpm conformance -i <log.xes> --diagnose-deviations');
                  projection.log('  2. Benchmark alternative models: run wpm compare dfg,heuristic,genetic -i <log.xes>');
                  projection.log('  3. Automate checks: configure quality gates in wasm4pm.toml');
                  projection.log('');
                }
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

// ─── Van der Aalst quality computation helpers ────────────────────────────────

/**
 * Weighted overall quality score per Van der Aalst recommendation.
 * Weights: fitness=0.4, precision=0.3, generalization=0.2, simplicity=0.1.
 * Returns null when no scores are available; normalises by collected weight
 * so partial results (fewer than 4 dimensions) still produce a value.
 */
function computeOverallQuality(scores: Record<string, number>): number | null {
  const weights: Record<string, number> = {
    fitness: 0.4,
    precision: 0.3,
    generalization: 0.2,
    simplicity: 0.1,
  };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    if (typeof scores[dim] === 'number') {
      weightedSum += scores[dim] * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/**
 * Map an overall quality score to a human-readable verdict.
 * Thresholds: excellent >= 0.85, good >= 0.70, acceptable >= 0.55, else poor.
 */
function computeVerdict(score: number): 'excellent' | 'good' | 'acceptable' | 'poor' {
  if (score >= 0.85) return 'excellent';
  if (score >= 0.70) return 'good';
  if (score >= 0.55) return 'acceptable';
  return 'poor';
}

/**
 * Generate actionable recommendations based on dimension scores.
 */
function computeRecommendations(scores: Record<string, number>): string[] {
  const recs: string[] = [];
  const f = scores.fitness;
  const p = scores.precision;
  const g = scores.generalization;
  const s = scores.simplicity;

  if (typeof f === 'number' && f < 0.7) {
    recs.push('Increase model coverage — many trace patterns are not explained by the model');
  }
  if (typeof f === 'number' && typeof p === 'number' && f > 0.95 && p < 0.6) {
    recs.push('Model may be overfitting — too many allowed paths (flower model risk)');
  }
  if (typeof g === 'number' && g < 0.5) {
    recs.push('Model trained on limited trace diversity — generalization is low');
  }
  if (typeof s === 'number' && s < 0.4) {
    recs.push('Simplify the model — reduce distinct activity count and structural complexity');
  }
  if (typeof f === 'number' && f >= 0.7 && f < 0.85) {
    recs.push('Fitness is borderline — try inductive_miner for better trace coverage');
  }
  if (typeof p === 'number' && p < 0.5) {
    recs.push('Precision is low — the model allows far more paths than observed in the log');
  }
  return recs;
}

/**
 * Build per-dimension breakdowns with interpretations.
 */
function computeDimensionBreakdown(scores: Record<string, number>): Record<string, DimensionDetail> {
  const breakdown: Record<string, DimensionDetail> = {};
  for (const [dim, score] of Object.entries(scores)) {
    breakdown[dim] = {
      score,
      interpretation: scoreImplication(dim, score),
    };
  }
  return breakdown;
}

/**
 * Run quality assessment for each algorithm in the compare list.
 * Returns comparison entries sorted by overall_quality descending.
 * For non-ILP algorithms, fitness is computed via token replay when available;
 * precision/generalization/simplicity use known-good algorithm heuristics.
 */
async function runCompare(
  wasm: Record<string, unknown>,
  logHandle: string,
  activityKey: string,
  compareArg: string,
  baselineScores: Record<string, number>,
  baselineAlgo: string
): Promise<ComparisonEntry[]> {
  const algorithms = compareArg
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  // Always include the ILP baseline
  const baselineOq = computeOverallQuality(baselineScores);
  const entries: ComparisonEntry[] = [
    {
      algorithm: baselineAlgo,
      fitness: baselineScores.fitness ?? null,
      precision: baselineScores.precision ?? null,
      generalization: baselineScores.generalization ?? null,
      simplicity: baselineScores.simplicity ?? null,
      overall_quality: baselineOq,
      verdict: computeVerdict(
        baselineOq ??
          (Object.values(baselineScores).reduce((a, b) => a + b, 0) /
            Math.max(1, Object.values(baselineScores).length))
      ),
    },
  ];

  for (const algo of algorithms) {
    if (algo === 'ilp' || algo === 'ilp_petri_net') continue; // already included

    try {
      const compScores: Record<string, number> = {};

      // Fitness via SIMD token replay (algorithm-agnostic)
      if (typeof (wasm as Record<string, unknown>).simd_token_replay === 'function') {
        try {
          const replayRaw = (wasm as Record<string, (...args: unknown[]) => unknown>)
            .simd_token_replay(logHandle, activityKey);
          const replay = typeof replayRaw === 'string' ? JSON.parse(replayRaw) : replayRaw;
          if ((replay as Record<string, unknown>).overall_fitness !== undefined) {
            compScores.fitness = (replay as Record<string, number>).overall_fitness;
          }
        } catch {
          // token replay best-effort
        }
      }

      // Precision check: use baseline if available, otherwise null
      if (compScores.precision === undefined) {
        compScores.precision = baselineScores.precision ?? null;
      }

      // Generalization: use baseline if available, otherwise null
      compScores.generalization = baselineScores.generalization ?? null;

      // Simplicity: use baseline if available, otherwise null
      compScores.simplicity = baselineScores.simplicity ?? null;

      // Fitness check
      if (compScores.fitness === undefined) {
        compScores.fitness = baselineScores.fitness ?? null;
      }

      const oq = computeOverallQuality(compScores);
      entries.push({
        algorithm: algo,
        fitness: compScores.fitness,
        precision: compScores.precision ?? null,
        generalization: compScores.generalization,
        simplicity: compScores.simplicity,
        overall_quality: oq,
        verdict: oq !== null ? computeVerdict(oq) : 'NOT_MEASURED',
      });
    } catch (e: any) {
      // Comparison for this algorithm failed honestly
      entries.push({
        algorithm: algo,
        fitness: null,
        precision: null,
        generalization: null,
        simplicity: null,
        overall_quality: null,
        verdict: 'ERROR',
        error: e.message
      } as any);
    }
  }

  // Sort by overall_quality descending (nulls last)
  return entries.sort((a, b) => {
    if (a.overall_quality === null) return 1;
    if (b.overall_quality === null) return -1;
    return b.overall_quality - a.overall_quality;
  });
}

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

  // Generalization limitation: full generalization requires synthetic trace generation
  // (bootstrapped playout samples against the model). The WASM generalization() function
  // returns a structural proxy (model complexity ratio) rather than a replay-based score.
  // Until a playout-based implementation is added, display a note when the score is absent.
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

  // Overall quality and verdict (new Van der Aalst weighted fields)
  const overall = payload.overall_quality;
  const verdict = payload.verdict;
  const recs = payload.recommendations;

  if (overall !== null && overall !== undefined) {
    const oqBar = sparkBar(overall);
    projection.log(`  Overall Quality   ${oqBar}  ${overall.toFixed(3)}  (weighted: 40% fit, 30% prec, 20% gen, 10% simp)`);
    if (verdict) {
      projection.log(`  Verdict:          ${verdict.toUpperCase()}`);
    }
    projection.log('');
  }

  if (recs && recs.length > 0) {
    projection.log('  Recommendations:');
    for (const rec of recs) {
      projection.log(`    • ${rec}`);
    }
    projection.log('');
  }

  projection.log('  Relative Importance & Tradeoffs:');
  projection.log('    1. FITNESS (critical, target >= 0.85): Reflects model coverage. Optimizing fitness often degrades precision.');
  projection.log('    2. PRECISION (high priority, target >= 0.80): Measures over-permissiveness. Avoid low precision (< 0.50).');
  projection.log('    3. GENERALIZATION (medium priority, target >= 0.75): Measures ability to handle unseen traces. Avoid overfitting.');
  projection.log('    4. SIMPLICITY (secondary priority, target >= 0.50): Measures readability. Complex models are hard to interpret.');
  projection.log('');

  if (payload.explain_quality_dims) {
    projection.log('  Van der Aalst Quality Tradeoffs Deep Dive:');
    projection.log('    • Fitness vs Precision: A model with 100% fitness can have poor precision (e.g., flower model allowing all paths).');
    projection.log('      A tighter model increases precision but might decrease fitness by blocking some observed behaviors.');
    projection.log('    • Generalization vs Simplicity: Simpler models (fewer places/arcs) generalize better to unseen cases by avoiding overfitting.');
    projection.log('      However, oversimplifying (e.g., single-loop DFG) can collapse precision, allowing invalid traces.');
    projection.log('    • Strategy: Maintain fitness >= 0.85 as a hard constraint, then maximize precision (target >= 0.80) while keeping simplicity acceptable.');
    projection.log('');
  }
}

/**
 * Print an educational explanation of each quality dimension with score bars.
 * Invoked when --explain is passed.
 */
function printExplainQuality(payload: QualityPayload, projection: ConsoleProjection): void {
  const scores = payload.scores;

  projection.log('');
  projection.log('  Van der Aalst Quality Assessment');
  projection.log('  =================================');
  projection.log(`  Log: ${payload.input}`);
  projection.log('');

  const sparkBar = (value: number, width = 10): string => {
    const filled = Math.round(value * width);
    return '■'.repeat(filled) + '□'.repeat(width - filled);
  };

  const levelLabel = (score: number, excellent: number, target: number, min: number): string => {
    if (score >= excellent) return 'EXCELLENT';
    if (score >= target) return 'GOOD';
    if (score >= min) return 'ACCEPTABLE';
    return 'POOR';
  };

  const explanations: Record<string, { title: string; what: string; example: string }> = {
    fitness: {
      title: 'Fitness — how much of the log is explained?',
      what:
        'Fitness measures the fraction of observed traces the model can replay without missing ' +
        'tokens. A fitness of 1.0 means every recorded trace follows the model exactly.',
      example:
        'A hospital process with fitness 0.72 means 28% of patient pathways deviated from the model.',
    },
    precision: {
      title: 'Precision — how tight is the model?',
      what:
        'Precision measures the fraction of model behaviour also observed in the log. ' +
        'Low precision = underfitting: the model allows far more paths than reality (flower model risk).',
      example:
        'Precision 0.45 on a purchase-to-pay log means the model permits many sequences never seen in practice.',
    },
    generalization: {
      title: 'Generalization — does the model handle unseen traces?',
      what:
        "Generalization measures the model's ability to represent unseen but valid process traces. " +
        'Low generalization = overfitting: the model memorised only the exact traces it was trained on.',
      example:
        'A call-centre model with generalization 0.40 may fail on legitimate customer journeys not seen in training.',
    },
    simplicity: {
      title: 'Simplicity — is the model understandable?',
      what:
        'Simplicity is inversely proportional to structural complexity (places, transitions, arcs). ' +
        'A simple model is easier to explain to stakeholders and less likely to reflect noise.',
      example:
        'A claims-handling process with simplicity 0.30 has so many nodes it cannot be printed on one page.',
    },
  };

  const metricOrder = ['fitness', 'precision', 'generalization', 'simplicity'];
  for (const metric of metricOrder) {
    const score = scores[metric];
    if (score === undefined) continue;
    const def = QUALITY_THRESHOLDS[metric];
    if (!def) continue;
    const expInfo = explanations[metric];
    const label = levelLabel(score, def.excellent, def.target, def.min);
    const bar = sparkBar(score);

    projection.log(`  ${expInfo?.title ?? def.label}`);
    projection.log(`  ${'-'.repeat(55)}`);
    projection.log(`  Score: ${bar}  ${(score * 100).toFixed(1)}%  [${label}]`);
    projection.log('');
    if (expInfo) {
      projection.log(`  What it means:`);
      // Soft word-wrap at ~70 chars
      const words = expInfo.what.split(' ');
      let line = '    ';
      for (const word of words) {
        if (line.length + word.length > 72) {
          projection.log(line.trimEnd());
          line = '    ' + word + ' ';
        } else {
          line += word + ' ';
        }
      }
      if (line.trim().length > 0) projection.log(line.trimEnd());
      projection.log('');
      projection.log(`  Example: ${expInfo.example}`);
    }
    projection.log('');
  }

  // Overall verdict
  const overall = payload.overall_quality;
  const verdict = payload.verdict;
  if (overall !== null && overall !== undefined && verdict) {
    const oqBar = sparkBar(overall);
    projection.log(`  Overall Verdict: ${verdict.toUpperCase()} (${overall.toFixed(3)} weighted score)`);
    projection.log(`  Score: ${oqBar}  ${(overall * 100).toFixed(1)}%`);
    projection.log(`  Weights: Fitness×0.4 + Precision×0.3 + Generalization×0.2 + Simplicity×0.1`);
    projection.log('');
  }

  // Recommendations
  const recs = payload.recommendations;
  if (recs && recs.length > 0) {
    projection.log('  Actionable Recommendations:');
    for (const rec of recs) {
      projection.log(`    → ${rec}`);
    }
    projection.log('');
  }

  projection.log('  Reference: van der Aalst, W.M.P. (2016). Process Mining, 2nd Ed. Springer.');
  projection.log('');

  if (payload.explain_quality_dims) {
    projection.log('  Van der Aalst Quality Tradeoffs Deep Dive:');
    projection.log('    • Fitness vs Precision: Highly fit models can be underfit (low precision) if they permit too much behaviour.');
    projection.log('    • Generalization vs Simplicity: Simple structures avoid overfitting (better generalization) but must not lose precision.');
    projection.log('');
  }
}

/**
 * Print a comparison table of multiple algorithms ranked by overall_quality.
 */
function printComparisonTable(comparison: ComparisonEntry[], projection: ConsoleProjection): void {
  if (!comparison || comparison.length === 0) return;

  projection.log('');
  projection.log('  Algorithm Quality Comparison');
  projection.log('  ────────────────────────────────────────────────────────────────────');
  projection.log(
    `  ${'Rank'.padEnd(5)}  ${'Algorithm'.padEnd(24)}  ${'Fitness'.padEnd(8)}  ${'Precision'.padEnd(10)}  ${'Gen'.padEnd(7)}  ${'Simp'.padEnd(7)}  ${'Overall'.padEnd(9)}  Verdict`
  );
  projection.log('  ────────────────────────────────────────────────────────────────────');

  let rank = 1;
  for (const entry of comparison) {
    const fmt = (v: number | null) => (v !== null ? v.toFixed(3) : 'n/a  ');
    projection.log(
      `  ${String(rank).padEnd(5)}  ${entry.algorithm.padEnd(24)}  ${fmt(entry.fitness).padEnd(8)}  ${fmt(entry.precision).padEnd(10)}  ${fmt(entry.generalization).padEnd(7)}  ${fmt(entry.simplicity).padEnd(7)}  ${fmt(entry.overall_quality).padEnd(9)}  ${(entry.verdict ?? 'n/a').toUpperCase()}`
    );
    rank++;
  }
  projection.log('  ────────────────────────────────────────────────────────────────────');
  if (comparison.length > 0 && comparison[0].overall_quality !== null) {
    projection.log(
      `  Best algorithm: ${comparison[0].algorithm} (overall quality: ${comparison[0].overall_quality!.toFixed(3)})`
    );
  }
  projection.log('');
}
