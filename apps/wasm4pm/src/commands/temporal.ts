import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

export const temporal = defineCommand({
  meta: {
    name: 'temporal',
    description: 'Analyze temporal profiles and performance patterns in event logs',
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
    threshold: {
      type: 'string',
      description: 'Significance threshold for temporal violations (default: 0.05)',
      default: '0.05',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    'timestamp-key': {
      type: 'string',
      description: 'XES timestamp attribute key (default: time:timestamp)',
      default: 'time:timestamp',
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
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-save and BLAKE3 receipt',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    return withSpan(
      'temporal',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        timestamp_key: String(ctx.args['timestamp-key'] ?? ''),
        threshold: Number(ctx.args.threshold ?? 0),
        format,
      },
      async () => {
    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        const result = makeErrorResult(
          'temporal',
          'Input file required.\n\nUsage:  wpm temporal <log.xes>\n        wpm temporal <log.xes> --threshold 0.01\n\nRun "wpm temporal --help" for details.',
          EXIT_CODES.source_error,
          'MISSING_INPUT'
        );
        emitResult(result, { format, verbose, quiet });
        await exitWithFlush(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
      const threshold = parseFloat((ctx.args.threshold as string) || '0.05');

      await withLogSession(
        { inputPath, activityKey, commandName: 'temporal', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        const rawDfg = wasm.discover_dfg(logHandle, activityKey);
        const dfg = typeof rawDfg === 'string' ? JSON.parse(rawDfg) : rawDfg;

        let temporalProfile: Record<string, unknown> | null = null;
        try {
          const rawProfile = wasm.compute_temporal_profile(logHandle, activityKey, timestampKey);
          temporalProfile = typeof rawProfile === 'string' ? JSON.parse(rawProfile) : rawProfile;
        } catch {
          // Temporal profile not available
        }

        let violations: Array<Record<string, unknown>> = [];
        try {
          const rawViolations = wasm.check_temporal_conformance(
            logHandle,
            activityKey,
            timestampKey,
            threshold
          );
          const violationsResult =
            typeof rawViolations === 'string' ? JSON.parse(rawViolations) : rawViolations;
          violations = (violationsResult.violations as Array<Record<string, unknown>>) ?? [];
        } catch {
          // Temporal conformance not available
        }

        let performanceDfg: Record<string, unknown> | null = null;
        try {
          const rawPerf = wasm.compute_performance_dfg(logHandle, activityKey, timestampKey);
          performanceDfg = typeof rawPerf === 'string' ? JSON.parse(rawPerf) : rawPerf;
        } catch {
          // Performance DFG not available
        }

        let activityDurations: Record<string, unknown> | null = null;
        try {
          const rawDurations = wasm.compute_activity_durations(logHandle, activityKey, timestampKey);
          activityDurations =
            typeof rawDurations === 'string' ? JSON.parse(rawDurations) : rawDurations;
        } catch {
          // Activity durations not available
        }

        const payload = {
          input: inputPath,
          activityKey,
          timestampKey,
          threshold,
          dfg: {
            nodes: (dfg as Record<string, unknown>).nodes ?? [],
            edges: (dfg as Record<string, unknown>).edges ?? [],
          },
          temporalProfile,
          violations: {
            count: violations.length,
            threshold,
            items: violations,
          },
          performanceDfg,
          activityDurations,
        };

        const result = makeResult('temporal', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          printHumanTemporal(projection, res.payload as typeof payload);
        });

        if (!ctx.args['no-save']) {
          try {
            const inputBytes = await fs.readFile(inputPath!).catch(() => Buffer.from(inputPath!));
            const activitiesAnalyzed = Array.isArray(payload.dfg.nodes)
              ? (payload.dfg.nodes as unknown[]).length
              : 0;
            const receipt: CommandReceipt = {
              ...newReceipt('temporal'),
              command: 'temporal',
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                activities_analyzed: activitiesAnalyzed,
                bottleneck_count: payload.violations.count,
                threshold,
              },
            };
            saveCommandReceipt(receipt);
          } catch {
            /* receipt write must never break the command */
          }
        }

        await exitWithFlush(result.exit_code);
      });  // end withLogSession
    } catch (error) {
      const result = makeErrorResult('temporal', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

function printHumanTemporal(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    timestampKey: string;
    threshold: number;
    violations: { count: number; threshold: number; items: Array<Record<string, unknown>> };
    performanceDfg: Record<string, unknown> | null;
    activityDurations: Record<string, unknown> | null;
  }
): void {
  const { violations, performanceDfg, activityDurations } = payload;

  projection.log('');
  projection.success(`Temporal Analysis — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Timestamp key: ${payload.timestampKey}`);
  projection.log(`  Threshold: ${payload.threshold.toFixed(3)}`);
  projection.log('');

  if (violations.count > 0) {
    projection.warn(`Found ${violations.count} temporal violation(s):`);
    for (const v of violations.items.slice(0, 10)) {
      const activity = v.activity as string;
      const expected = v.expected as number;
      const actual = v.actual as number;
      const diff = v.diff as number;
      projection.log(
        `  - ${activity}: expected ${expected.toFixed(2)}ms, got ${actual.toFixed(2)}ms (diff: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}ms)`
      );
    }
    if (violations.items.length > 10) {
      projection.log(`  ... and ${violations.items.length - 10} more violations`);
    }
  } else {
    projection.success('No temporal violations found');
  }
  projection.log('');

  if (activityDurations) {
    projection.log('  Activity durations (ms):');
    const durations = activityDurations.durations as Record<
      string,
      { mean: number; min: number; max: number; median: number }
    >;
    if (durations) {
      for (const [activity, stats] of Object.entries(durations).slice(0, 10)) {
        projection.log(
          `    ${activity}: mean=${stats.mean.toFixed(1)}, min=${stats.min.toFixed(1)}, max=${stats.max.toFixed(1)}, median=${stats.median.toFixed(1)}`
        );
      }
    }
    projection.log('');
  }

  if (performanceDfg) {
    const edges = performanceDfg.edges as Array<{
      from: string;
      to: string;
      avgDuration: number;
      minDuration: number;
      maxDuration: number;
    }>;
    if (edges && edges.length > 0) {
      projection.log('  Performance DFG (top 10 edges by duration):');
      const sortedEdges = [...edges].sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 10);
      for (const edge of sortedEdges) {
        projection.log(
          `    ${edge.from} → ${edge.to}: avg=${edge.avgDuration.toFixed(1)}ms (min: ${edge.minDuration.toFixed(1)}, max: ${edge.maxDuration.toFixed(1)})`
        );
      }
    }
    projection.log('');
  }
}
