import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

export const temporal = defineCommand({
  meta: {
    name: 'temporal',
    description:
      'Analyze temporal profiles and performance patterns in event logs.\n' +
      '\n' +
      'Detects slow or unusually fast activity transitions, measures waiting times,\n' +
      'and identifies bottlenecks that may indicate process problems or data quality issues.\n' +
      '\n' +
      'Examples:\n' +
      '  wpm temporal log.xes                          # analyze all temporal patterns\n' +
      '  wpm temporal log.xes --threshold 0.01         # stricter detection (1% significance vs default 5%)\n' +
      '  wpm temporal -i log.xes --format json         # machine-readable output for automation\n' +
      '\n' +
      'Output includes:\n' +
      '  • Temporal conformance fitness (0–100%) — percentage of time transitions match the average pattern\n' +
      '  • Outlier transitions — activities that take >2 standard deviations from their mean duration\n' +
      '  • Waiting-time distribution per activity (median, P90, P99 percentiles)\n' +
      '  • Primary bottleneck — the single activity where work queues longest (P90 wait time)\n' +
      '  • Impossible timestamps — events where end time < start time (data quality issues)\n' +
      '\n' +
      'Exit codes: 0=success  1=config/arg error  2=source/file error  3=execution error',
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

    // Late attributes captured after WASM execution — output metrics unknown at span-open time.
    let lateViolationsCount = 0;
    let lateTemporalFitness = -1; // -1 = not computed (profile unavailable)
    let lateImpossibleTsCount = 0;
    let lateStatus = 'ok';

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
            return await exitWithFlush(result.exit_code);
          }

          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
          const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
          const rawThreshold = ctx.args.threshold as string | undefined;
          const threshold = parseFloat(rawThreshold || '0.05');
          if (rawThreshold !== undefined && rawThreshold !== '' && Number.isNaN(threshold)) {
            const result = makeErrorResult(
              'temporal',
              `Invalid --threshold value '${rawThreshold}': must be a number between 0.0 and 1.0.\n\n` +
                `  --threshold sets the significance threshold for temporal violations (default: 0.05).\n` +
                `  Lower values flag more violations; higher values flag only severe deviations.\n` +
                `  Example: wpm temporal log.xes --threshold 0.01`,
              EXIT_CODES.config_error,
              'INVALID_THRESHOLD'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          if (!Number.isNaN(threshold) && (threshold < 0 || threshold > 1)) {
            const result = makeErrorResult(
              'temporal',
              `Invalid --threshold value '${rawThreshold}': must be between 0.0 and 1.0, got ${threshold}.\n\n` +
                `  --threshold is a significance level (p-value) between 0.0 and 1.0.\n` +
                `  Typical values: 0.01 (strict), 0.05 (default), 0.10 (lenient).\n` +
                `  Example: wpm temporal log.xes --threshold 0.05`,
              EXIT_CODES.config_error,
              'INVALID_THRESHOLD'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'temporal',
              emitOptions: { format, verbose, quiet },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              const rawDfg = wasm.discover_dfg(logHandle, activityKey);
              const dfg = typeof rawDfg === 'string' ? JSON.parse(rawDfg) : rawDfg;

              // Discover temporal profile: two-step process required by the WASM API.
              // Step 1 — discover_temporal_profile returns an opaque handle to a stored
              //           TemporalProfile object (not inline data).
              // Step 2 — check_temporal_conformance takes (log_handle, profile_handle,
              //           activity_key, timestamp_key, zeta) and returns conformance details.
              // Earlier code passed activityKey as profile_handle, which always failed silently.
              let profileHandle: string | null = null;
              let temporalConformance: Record<string, unknown> | null = null;
              try {
                const rawProfileHandle = wasm.discover_temporal_profile(
                  logHandle,
                  activityKey,
                  timestampKey
                );
                profileHandle =
                  typeof rawProfileHandle === 'string'
                    ? rawProfileHandle
                    : String(rawProfileHandle);
              } catch {
                // WASM function not available in this build profile
              }

              let violations: Array<Record<string, unknown>> = [];
              let impossibleTimestampCount = 0;
              if (profileHandle) {
                try {
                  // zeta=2.0: flag transitions deviating more than 2 standard deviations from mean
                  const rawConformance = wasm.check_temporal_conformance(
                    logHandle,
                    profileHandle,
                    activityKey,
                    timestampKey,
                    2.0
                  );
                  temporalConformance =
                    typeof rawConformance === 'string'
                      ? JSON.parse(rawConformance)
                      : rawConformance;
                  const details =
                    (temporalConformance?.details as Array<Record<string, unknown>>) ?? [];
                  violations = details.filter((d) => d.deviation === true);
                  // Impossible timestamps: the Rust implementation uses `if t2 >= t1` to guard
                  // duration calculation. Any step where t2 < t1 was silently dropped — we now
                  // surface the count so the analyst knows the log has data-quality issues.
                  impossibleTimestampCount = details.filter(
                    (d) => typeof d.duration_ms === 'number' && (d.duration_ms as number) < 0
                  ).length;
                } catch {
                  // Conformance check failed or not available
                }
              }

              // Helper function to compute percentile statistics (reused for activity and resource analysis)
              const computePercentiles = (durations: number[]) => {
                const sorted = [...durations].sort((a, b) => a - b);
                const pct = (p: number) => {
                  const idx = Math.ceil((p / 100) * sorted.length) - 1;
                  return sorted[Math.max(0, idx)];
                };
                const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
                return {
                  p50: pct(50),
                  p90: pct(90),
                  p99: pct(99),
                  mean,
                  count: sorted.length,
                };
              };

              // Compute per-activity cycle-time distribution (P50/P90/P99) from the conformance
              // details already retrieved — no extra WASM call needed.
              // Sort by P90 descending to surface the slowest activities first.
              let cycleTimePercentiles: Record<
                string,
                { p50: number; p90: number; p99: number; mean: number; count: number }
              > | null = null;
              // NEW (Iteration 12e Gap T1): Per-resource cycle-time distribution
              let cycleTimeByResource: Record<
                string,
                { p50: number; p90: number; p99: number; mean: number; count: number }
              > | null = null;
              if (temporalConformance) {
                const details =
                  (temporalConformance.details as Array<Record<string, unknown>>) ?? [];
                const durationsByActivity: Record<string, number[]> = {};
                // NEW: Track durations per resource (from 'resource' field in conformance details)
                const durationsByResource: Record<string, number[]> = {};
                for (const d of details) {
                  const activity = d.from as string;
                  const resource = d.resource as string | undefined; // Requires WASM to emit 'resource' field
                  const dur = d.duration_ms as number;
                  if (typeof activity === 'string' && typeof dur === 'number' && dur >= 0) {
                    if (!durationsByActivity[activity]) durationsByActivity[activity] = [];
                    durationsByActivity[activity].push(dur);
                  }
                  // NEW: Accumulate by resource if available
                  if (
                    typeof resource === 'string' &&
                    typeof dur === 'number' &&
                    dur >= 0
                  ) {
                    if (!durationsByResource[resource]) durationsByResource[resource] = [];
                    durationsByResource[resource].push(dur);
                  }
                }
                if (Object.keys(durationsByActivity).length > 0) {
                  cycleTimePercentiles = {};
                  for (const [act, durations] of Object.entries(durationsByActivity)) {
                    cycleTimePercentiles[act] = computePercentiles(durations);
                  }
                }
                // NEW: Compute resource percentiles (Iteration 12e Gap T1)
                if (Object.keys(durationsByResource).length > 0) {
                  cycleTimeByResource = {};
                  for (const [res, durations] of Object.entries(durationsByResource)) {
                    cycleTimeByResource[res] = computePercentiles(durations);
                  }
                }
              }

              // NEW (Gap T1/T2): Bottleneck drift and stability analysis
              let bottleneckDrift: { trend: string; change_magnitude: number } | null = null;
              let bottleneckStability: Record<
                string,
                { p90: number; trend: string; coefficient_of_variation: number }
              > | null = null;

              if (violations.length > 4) {
                const mid = Math.floor(violations.length / 2);
                const earlyViolations = violations.slice(0, mid);
                const lateViolations = violations.slice(mid);
                const earlyMeanDuration =
                  earlyViolations.reduce((s, v) => s + ((v.duration_ms as number) || 0), 0) /
                  earlyViolations.length;
                const lateMeanDuration =
                  lateViolations.reduce((s, v) => s + ((v.duration_ms as number) || 0), 0) /
                  lateViolations.length;
                const changePercent =
                  earlyMeanDuration > 0
                    ? ((lateMeanDuration - earlyMeanDuration) / earlyMeanDuration) * 100
                    : 0;
                bottleneckDrift = {
                  trend: changePercent > 5 ? 'worsening' : changePercent < -5 ? 'improving' : 'stable',
                  change_magnitude: changePercent,
                };
              }

              if (cycleTimePercentiles && Object.keys(cycleTimePercentiles).length > 0) {
                bottleneckStability = {};
                for (const [act, stats] of Object.entries(cycleTimePercentiles)) {
                  const cv =
                    stats.mean > 0 ? Math.abs((stats.p90 - stats.mean) / stats.mean) : 0;
                  bottleneckStability[act] = {
                    p90: stats.p90,
                    trend: cv > 0.5 ? 'high-variance' : cv > 0.3 ? 'moderate-variance' : 'stable',
                    coefficient_of_variation: cv,
                  };
                }
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
                temporalConformance,
                violations: {
                  count: violations.length,
                  threshold,
                  items: violations,
                },
                impossibleTimestampCount,
                cycleTimePercentiles,
                // NEW (Iteration 12e, Gap T1): Per-resource duration metrics (Van der Aalst Resource perspective)
                cycleTimeByResource,
                // NEW (Gap T1): Bottleneck drift detection
                bottleneckDrift,
                // NEW (Gap T2): Bottleneck stability (variance)
                bottleneckStability,
              };

              // Capture output metrics for late OTEL span attributes
              lateViolationsCount = payload.violations.count;
              lateImpossibleTsCount = payload.impossibleTimestampCount;
              lateTemporalFitness =
                typeof (payload.temporalConformance as Record<string, unknown> | null)?.fitness === 'number'
                  ? ((payload.temporalConformance as Record<string, unknown>).fitness as number)
                  : -1;
              lateStatus = 'ok';

              const result = makeResult(
                'temporal',
                payload,
                performance.now() - t0,
                EXIT_CODES.success
              );
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                printHumanTemporal(projection, res.payload as typeof payload);
              });

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs
                    .readFile(inputPath!)
                    .catch(() => Buffer.from(inputPath!));
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
                      deviation_count: payload.violations.count,
                      impossible_timestamp_count: payload.impossibleTimestampCount,
                      percentile_activities: payload.cycleTimePercentiles
                        ? Object.keys(payload.cycleTimePercentiles).length
                        : 0,
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
          lateStatus = 'error';
          const result = makeErrorResult('temporal', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      // getLateAttrs: emit output metrics as OTEL span attributes.
      // temporal_fitness = -1 signals the profile was unavailable in this WASM build.
      () => ({
        violations_count: lateViolationsCount,
        temporal_fitness: lateTemporalFitness,
        impossible_timestamp_count: lateImpossibleTsCount,
        status: lateStatus,
      })
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
    impossibleTimestampCount: number;
    cycleTimePercentiles: Record<
      string,
      { p50: number; p90: number; p99: number; mean: number; count: number }
    > | null;
    temporalConformance: Record<string, unknown> | null;
  }
): void {
  const { violations, cycleTimePercentiles } = payload;

  projection.log('');
  projection.success(`Temporal Analysis — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Timestamp key: ${payload.timestampKey}`);
  projection.log('');

  // Impossible-timestamp validation errors — these are defects in the event log.
  // An end < start timestamp means the log was corrupted or clocks were not synchronised.
  if (payload.impossibleTimestampCount > 0) {
    projection.warn(
      `Validation error: ${payload.impossibleTimestampCount} event(s) with impossible timestamps (end < start) — skipped during analysis`
    );
    projection.log('');
  }

  // Temporal conformance summary
  if (payload.temporalConformance) {
    const tc = payload.temporalConformance as {
      fitness?: number;
      total_steps?: number;
      deviations?: number;
    };
    if (typeof tc.fitness === 'number') {
      const fitnessLabel = tc.fitness >= 0.85 ? 'good' : tc.fitness >= 0.7 ? 'fair' : 'poor';
      projection.log(
        `  Temporal conformance fitness: ${(tc.fitness * 100).toFixed(1)}% (${fitnessLabel})`
      );
      projection.log(
        `  Steps analysed: ${tc.total_steps ?? 0}  |  Deviations (>2σ): ${tc.deviations ?? 0}`
      );
      projection.log('');
    }
  }

  if (violations.count > 0) {
    projection.warn(`Found ${violations.count} temporal deviation(s) (>2σ from mean):`);
    for (const v of violations.items.slice(0, 10)) {
      const from = v.from as string;
      const to = v.to as string;
      const durMs = typeof v.duration_ms === 'number' ? (v.duration_ms as number) : 0;
      const meanMs = typeof v.mean_ms === 'number' ? (v.mean_ms as number) : 0;
      const zeta = typeof v.zeta === 'number' ? (v.zeta as number) : 0;
      projection.log(
        `  - ${from} → ${to}: ${durMs.toFixed(0)}ms (mean ${meanMs.toFixed(0)}ms, z=${zeta.toFixed(1)}σ)`
      );
    }
    if (violations.items.length > 10) {
      projection.log(`  ... and ${violations.items.length - 10} more deviations`);
    }
    projection.log('');
  } else if (payload.temporalConformance) {
    projection.success('No temporal deviations found (all steps within 2σ of mean)');
    projection.log('');
  }

  // Cycle time distribution — P50/P90/P99 per originating activity.
  // Van der Aalst performance perspective: these durations represent the WAITING TIME
  // (inter-activity gap) from an activity to its successor — NOT the service time spent
  // executing that activity. Service time = time consumed by the activity resource.
  // Waiting time = idle time between activity completion and next activity start.
  // Long waiting times indicate queuing, resource contention, or hand-off delays.
  // P90/P99 gap reveals tail-heavy distributions (outlier cases dominating cycle time).
  // Sorted by P90 descending to surface the worst-case bottleneck transitions first.
  if (cycleTimePercentiles && Object.keys(cycleTimePercentiles).length > 0) {
    const sorted = Object.entries(cycleTimePercentiles).sort(([, a], [, b]) => b.p90 - a.p90);
    // Identify the slowest activity by P90 — the primary bottleneck transition
    const [slowestActivity, slowestStats] = sorted[0];
    projection.warn(
      `Primary bottleneck: after "${slowestActivity}", 90% of cases wait >${(slowestStats.p90 / 1000).toFixed(1)}s for the next step (n=${slowestStats.count})`
    );
    projection.log(
      `    Action: investigate resource capacity or hand-off delays following "${slowestActivity}".`
    );
    projection.log('');
    projection.log(
      '  Waiting time after each activity (Van der Aalst: inter-activity gap = waiting time, not service time):'
    );
    projection.log(
      '    Activity                                 | count |   mean |    P50 |    P90 |    P99'
    );
    projection.log('    ' + '-'.repeat(90));
    for (const [act, stats] of sorted.slice(0, 10)) {
      const label = act.length > 40 ? act.slice(0, 37) + '...' : act.padEnd(40);
      projection.log(
        `    ${label} | ${String(stats.count).padStart(5)} | ${(stats.mean / 1000).toFixed(1).padStart(6)}s | ${(stats.p50 / 1000).toFixed(1).padStart(6)}s | ${(stats.p90 / 1000).toFixed(1).padStart(6)}s | ${(stats.p99 / 1000).toFixed(1).padStart(6)}s`
      );
    }
    if (sorted.length > 10) {
      projection.log(`    ... and ${sorted.length - 10} more activities`);
    }
    projection.log('');
    projection.log(
      '  Note: to separate service time from waiting time, enable lifecycle:transition'
    );
    projection.log('        events (start/complete pairs) in your event log capture.');
    projection.log('');
  }
}
