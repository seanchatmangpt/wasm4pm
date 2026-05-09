import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { discriminate, toUniformStats } from '../discriminator.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';

interface QualityPayload {
  status: string;
  input: string;
  activityKey: string;
  metrics: string[];
  scores: Record<string, number>;
  aggregate: {
    score: number;
    level: string;
  };
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
      'Assess multi-dimensional quality of a process model (fitness, precision, generalization, simplicity)',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (named alternative to positional)',
      alias: 'i',
    },
    metrics: {
      type: 'string',
      description:
        'Comma-separated quality metrics to compute (default: fitness,precision,generalization,simplicity)',
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
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
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
        algorithm: String(ctx.args.algorithm ?? ''),
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
          'SOURCE_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
        return;
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
            `Invalid metric(s): ${invalidMetrics.join(', ')}. Valid: ${validMetrics.join(', ')}`
          ),
          EXIT_CODES.source_error,
          'SOURCE_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
        return;
      }

      await withLogSession(
        { inputPath, activityKey, commandName: 'quality', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

      // Discover a model for quality assessment (use inductive miner — produces Petri net handle)
      let modelHandle: string;
      try {
        const modelResult = wasm.discover_inductive_miner(logHandle, activityKey);
        const parsed = typeof modelResult === 'string' ? JSON.parse(modelResult) : modelResult;
        modelHandle = (parsed as Record<string, unknown>).handle as string;
        if (!modelHandle) {
          throw new Error(`Inductive miner returned unexpected result: ${JSON.stringify(parsed)}`);
        }
      } catch (e) {
        wasm.delete_object(logHandle);
        throw new Error(`Failed to discover model: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Discriminate model JSON for structural info.
      // The inductive miner produces a process tree; we may also encounter Petri
      // nets in this branch if the discovery path changes in the future.
      let modelStats: { nodes: number; edges: number } = { nodes: 0, edges: 0 };
      let petriCounts: { places: number; transitions: number; arcs: number } | null = null;
      try {
        const rawModelJson = wasm.get_object_json ? wasm.get_object_json(modelHandle) : null;
        if (rawModelJson) {
          const shape = discriminate(rawModelJson, 'inductive');
          modelStats = toUniformStats(shape);
          if (shape.kind === 'petrinet') {
            petriCounts = {
              places: shape.places,
              transitions: shape.transitions,
              arcs: shape.arcs,
            };
          }
        }
      } catch {
        // Model JSON retrieval not available, or shape did not match a known kind.
        // Quality scoring will fall back to defaults below.
      }

      // Compute quality metrics via WASM conformance functions
      const qualityScores: Record<string, number> = {};

      // Fitness — via token-based replay (alignments)
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
          const alignResult = typeof rawAlign === 'string' ? JSON.parse(rawAlign) : rawAlign;
          // Fitness = 1 - (total cost / max possible cost); alignments return per-trace costs
          const traces = alignResult.traces as
            | Array<{ cost?: number; num_moves?: number }>
            | undefined;
          if (traces && traces.length > 0) {
            let totalCost = 0;
            let totalMoves = 0;
            for (const trace of traces) {
              totalCost += trace.cost ?? 0;
              totalMoves += trace.num_moves ?? 1;
            }
            qualityScores.fitness = totalMoves > 0 ? Math.max(0, 1 - totalCost / totalMoves) : 1.0;
          } else {
            qualityScores.fitness =
              ((alignResult as Record<string, unknown>).fitness as number) ?? 1.0;
          }
        } catch {
          qualityScores.fitness = 0.0;
        }
      }

      // Precision — via ETConformance escaping-edge analysis
      if (requestedMetrics.includes('precision')) {
        try {
          const rawPrec = wasm.wasm_compute_precision(logHandle, modelHandle, activityKey);
          const precResult = typeof rawPrec === 'string' ? JSON.parse(rawPrec) : rawPrec;
          qualityScores.precision =
            ((precResult as Record<string, unknown>).precision as number) ??
            ((precResult as Record<string, unknown>).value as number) ??
            0.5;
        } catch {
          qualityScores.precision = 0.0;
        }
      }

      // Generalization — via WASM generalization metric
      if (requestedMetrics.includes('generalization')) {
        try {
          const rawGen = wasm.generalization(logHandle, modelHandle, activityKey);
          const genResult = typeof rawGen === 'string' ? JSON.parse(rawGen) : rawGen;
          qualityScores.generalization =
            ((genResult as Record<string, unknown>).generalization as number) ??
            ((genResult as Record<string, unknown>).value as number) ??
            0.5;
        } catch {
          qualityScores.generalization = 0.0;
        }
      }

      // Simplicity — via WASM compute_simplicity(places, transitions, arcs)
      if (requestedMetrics.includes('simplicity')) {
        try {
          if (
            petriCounts &&
            typeof wasm.wasm_compute_simplicity === 'function' &&
            petriCounts.places + petriCounts.transitions + petriCounts.arcs > 0
          ) {
            qualityScores.simplicity = wasm.wasm_compute_simplicity(
              petriCounts.places,
              petriCounts.transitions,
              petriCounts.arcs
            );
          } else {
            // Fallback: heuristic if WASM function unavailable or model is not a Petri net
            const totalElements = modelStats.nodes + modelStats.edges;
            qualityScores.simplicity = 1.0 / (1.0 + totalElements / 10.0);
          }
        } catch {
          // Fallback: heuristic on failure
          const totalElements = modelStats.nodes + modelStats.edges;
          qualityScores.simplicity = 1.0 / (1.0 + totalElements / 10.0);
        }
      }

      // Compute aggregate quality score
      const scores = Object.values(qualityScores);
      const aggregate = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.0;

      // Free model handle (logHandle is cleaned up by withLogSession)
      try {
        if (modelHandle) {
          wasm.delete_object(modelHandle);
        }
      } catch {
        // Cleanup failure is non-fatal — do not block output
      }

      // Build payload
      const payload: QualityPayload = {
        status: 'success',
        input: inputPath,
        activityKey,
        metrics: requestedMetrics,
        scores: qualityScores,
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
        },
        model: {
          type: 'inductive_miner',
          nodes: modelStats.nodes,
          edges: modelStats.edges,
        },
      };

      const elapsedMs = Date.now() - t0;
      const result = makeResult('quality', payload, elapsedMs, EXIT_CODES.success);

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
                algorithm: (payload as unknown as Record<string, unknown>).algorithm,
                metrics: (payload as unknown as Record<string, unknown>).metrics,
                elapsedMs,
              },
            };
            saveCommandReceipt(receipt);
          } catch {
            /* receipt write must never break the command */
          }
        }

        process.exit(result.exit_code);
      });  // end withLogSession
    } catch (error) {
      const result = makeErrorResult(
        'quality',
        error,
        EXIT_CODES.execution_error,
        'EXECUTION_ERROR'
      );
      emitResult(result, { format, verbose, quiet });
      process.exit(result.exit_code);
    }
      },
    );
  },
});

import type { ConsoleProjection } from '../output.js';

function printHumanQuality(payload: QualityPayload, projection: ConsoleProjection): void {
  const scores = payload.scores;
  const aggregate = payload.aggregate;
  const modelInfo = payload.model;

  projection.log('');
  projection.success(`Quality Assessment — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(
    `  Model: ${modelInfo.type} (${modelInfo.nodes} nodes, ${modelInfo.edges} edges)`
  );
  projection.log('');

  // ASCII bar chart for quality scores
  const sparkBar = (value: number, width = 20): string => {
    const filled = Math.round(value * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  const scoreLabel = (score: number): string => {
    if (score >= 0.8) return '✓';
    if (score >= 0.6) return '○';
    return '✗';
  };

  projection.log('  Quality Scores:');
  for (const [metric, score] of Object.entries(scores)) {
    const bar = sparkBar(score);
    const label = scoreLabel(score);
    projection.log(`    ${metric.padEnd(15)} ${score.toFixed(3).padStart(6)}  ${label}  ${bar}`);
  }
  projection.log('');

  // Aggregate score
  const aggScore = aggregate.score;
  const aggLevel = aggregate.level;
  const aggBar = sparkBar(aggScore);
  const aggLabel = scoreLabel(aggScore);
  projection.log(
    `  Aggregate: ${aggScore.toFixed(3).padStart(6)}  ${aggLabel}  ${aggBar}  (${aggLevel})`
  );
  projection.log('');

  // Interpretation
  projection.log('  Interpretation:');
  projection.log(`    - Fitness:       How well the model can replay the log`);
  projection.log(`    - Precision:     How much unobserved behavior the model allows`);
  projection.log(`    - Generalization: How well the model generalizes to unseen behavior`);
  projection.log(`    - Simplicity:    How simple/complex the model is`);
  projection.log('');
}
