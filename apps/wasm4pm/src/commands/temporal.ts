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

// ── Types ─────────────────────────────────────────────────────────────────────

interface PercentileStats {
  mean: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
}

interface SojournBreakdown {
  activity: string;
  avg_sojourn_ms: number;
  pct_of_case: number;
  is_bottleneck: boolean;
  bottleneck_type: 'SOJOURN' | null;
}

interface SlaCompliance {
  target_hours: number;
  compliant_cases: number;
  violated_cases: number;
  total_cases: number;
  compliance_rate: number;
  avg_violation_hours: number;
  max_violation_hours: number;
  max_violation_case: string;
  first_breach_by_activity: Array<{ activity: string; case_count: number }>;
}

interface GanttEvent {
  activity: string;
  start_ms: number;
  end_ms: number;
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Compute full percentile statistics for a list of numeric values.
 */
function computeFullPercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p: number) => {
    const idx = (p / 100) * n;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo >= n) return sorted[n - 1];
    if (hi >= n) return sorted[n - 1];
    // Linear interpolation between adjacent values
    return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  };
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  return {
    mean,
    median: pct(50),
    p75: pct(75),
    p90: pct(90),
    p95: pct(95),
    p99: pct(99),
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
  };
}

/**
 * Derive per-case duration arrays from temporal conformance details.
 *
 * Each detail record has: {case_id, from, to, duration_ms}
 * Case duration = sum of all step durations for that case.
 * Also returns per-case step list for Gantt/SLA analysis.
 */
function computeCaseDurations(
  details: Array<Record<string, unknown>>,
  activityKey: string
): {
  caseDurationsMs: number[];
  caseMap: Map<string, { steps: Array<{ from: string; to: string; dur_ms: number }>; totalMs: number }>;
} {
  const caseMap = new Map<
    string,
    { steps: Array<{ from: string; to: string; dur_ms: number }>; totalMs: number }
  >();

  for (const d of details) {
    const cid = (d['case_id'] as string | undefined) ?? 'unknown';
    const from = (d['from'] as string | undefined) ?? '';
    const to = (d['to'] as string | undefined) ?? '';
    const dur = typeof d['duration_ms'] === 'number' ? (d['duration_ms'] as number) : 0;
    if (dur < 0) continue; // skip impossible timestamps

    if (!caseMap.has(cid)) caseMap.set(cid, { steps: [], totalMs: 0 });
    const entry = caseMap.get(cid)!;
    entry.steps.push({ from, to, dur_ms: dur });
    entry.totalMs += dur;
  }

  void activityKey; // used by caller for labelling
  const caseDurationsMs = Array.from(caseMap.values()).map((v) => v.totalMs);
  return { caseDurationsMs, caseMap };
}

/**
 * Compute sojourn-time breakdown per activity.
 *
 * Without lifecycle:transition (start/complete) we cannot separate service from
 * waiting time. We approximate: sojourn for activity A = total time in steps
 * that start at A (i.e., step A→next). This is the waiting time perspective per
 * Van der Aalst §5.
 *
 * Bottleneck threshold: activity contributes > 30% of average case duration.
 */
function computeSojournBreakdown(
  details: Array<Record<string, unknown>>,
  caseDurationsMs: number[]
): SojournBreakdown[] {
  const avgCaseDurationMs =
    caseDurationsMs.length > 0
      ? caseDurationsMs.reduce((s, v) => s + v, 0) / caseDurationsMs.length
      : 0;

  const actSums: Map<string, number> = new Map();
  const actCounts: Map<string, number> = new Map();

  for (const d of details) {
    const from = (d['from'] as string | undefined) ?? '';
    const dur = typeof d['duration_ms'] === 'number' ? (d['duration_ms'] as number) : 0;
    if (dur < 0 || !from) continue;
    actSums.set(from, (actSums.get(from) ?? 0) + dur);
    actCounts.set(from, (actCounts.get(from) ?? 0) + 1);
  }

  const result: SojournBreakdown[] = [];
  for (const [activity, totalMs] of actSums.entries()) {
    const cnt = actCounts.get(activity) ?? 1;
    const avg = totalMs / cnt;
    const pct = avgCaseDurationMs > 0 ? avg / avgCaseDurationMs : 0;
    result.push({
      activity,
      avg_sojourn_ms: avg,
      pct_of_case: pct,
      is_bottleneck: pct > 0.3,
      bottleneck_type: pct > 0.3 ? 'SOJOURN' : null,
    });
  }
  // Sort by avg sojourn descending
  result.sort((a, b) => b.avg_sojourn_ms - a.avg_sojourn_ms);
  return result;
}

/**
 * Compute SLA compliance from per-case durations.
 *
 * For each case, sum its step durations to get total duration. Compare to SLA.
 * First-breach activity: the step whose cumulative sum first exceeds the SLA target.
 */
function computeSlaCompliance(
  caseMap: Map<string, { steps: Array<{ from: string; to: string; dur_ms: number }>; totalMs: number }>,
  slaHours: number
): SlaCompliance {
  const slaMs = slaHours * 3600_000;
  let compliant = 0;
  let violated = 0;
  let totalViolationMs = 0;
  let maxViolationMs = 0;
  let maxViolationCase = '';
  const firstBreachCounts: Map<string, number> = new Map();

  for (const [cid, { steps, totalMs }] of caseMap.entries()) {
    if (totalMs <= slaMs) {
      compliant++;
    } else {
      violated++;
      const violationMs = totalMs - slaMs;
      totalViolationMs += violationMs;
      if (violationMs > maxViolationMs) {
        maxViolationMs = violationMs;
        maxViolationCase = cid;
      }
      // Find first activity that pushed total over the SLA
      let cumulative = 0;
      for (const step of steps) {
        cumulative += step.dur_ms;
        if (cumulative > slaMs) {
          firstBreachCounts.set(step.from, (firstBreachCounts.get(step.from) ?? 0) + 1);
          break;
        }
      }
    }
  }

  const total = compliant + violated;
  const firstBreachByActivity = Array.from(firstBreachCounts.entries())
    .map(([activity, case_count]) => ({ activity, case_count }))
    .sort((a, b) => b.case_count - a.case_count);

  return {
    target_hours: slaHours,
    compliant_cases: compliant,
    violated_cases: violated,
    total_cases: total,
    compliance_rate: total > 0 ? compliant / total : 1,
    avg_violation_hours: violated > 0 ? totalViolationMs / violated / 3600_000 : 0,
    max_violation_hours: maxViolationMs / 3600_000,
    max_violation_case: maxViolationCase,
    first_breach_by_activity: firstBreachByActivity,
  };
}

/**
 * Build a Gantt event list from temporal conformance details for a single case.
 *
 * We reconstruct absolute timestamps from relative durations.
 * The first event starts at t=0, subsequent events start at the end of the previous.
 */
function buildGanttEvents(
  steps: Array<{ from: string; to: string; dur_ms: number }>
): GanttEvent[] {
  if (steps.length === 0) return [];
  const events: GanttEvent[] = [];
  let cursor = 0;
  // First activity occupies [0, dur_of_first_step)
  for (let i = 0; i < steps.length; i++) {
    const start = cursor;
    const end = cursor + steps[i].dur_ms;
    events.push({ activity: steps[i].from, start_ms: start, end_ms: end });
    cursor = end;
  }
  // Add the last "to" activity as a point event at the very end
  if (steps.length > 0) {
    events.push({ activity: steps[steps.length - 1].to, start_ms: cursor, end_ms: cursor });
  }
  return events;
}

/**
 * Render ASCII Gantt chart for a trace.
 *
 * Width: 60 characters = total case duration. Each █ represents one time unit.
 */
function renderGantt(
  caseId: string,
  ganttEvents: GanttEvent[],
  totalMs: number
): string[] {
  const WIDTH = 60;
  const lines: string[] = [];

  if (ganttEvents.length === 0 || totalMs <= 0) {
    lines.push('  (no events to render)');
    return lines;
  }

  const maxLabelLen = 20;
  const toHours = (ms: number) => ms / 3600_000;

  lines.push(`Process Gantt (case ${caseId}, ${ganttEvents.length} activities)`);
  lines.push('='.repeat(72));

  // Build tick header
  const numTicks = 5;
  const tickMs = totalMs / numTicks;
  let tickRow = ' '.repeat(maxLabelLen + 2);
  for (let i = 0; i <= numTicks; i++) {
    const label = `${toHours(i * tickMs).toFixed(0)}h`;
    if (i === 0) {
      tickRow += label;
    } else {
      const pos = Math.round((i * tickMs / totalMs) * WIDTH);
      const currentLen = tickRow.length - (maxLabelLen + 2);
      const padNeeded = pos - currentLen;
      if (padNeeded > 0) {
        tickRow += ' '.repeat(padNeeded) + label;
      }
    }
  }
  lines.push(tickRow);
  lines.push(' '.repeat(maxLabelLen + 2) + '|' + ' '.repeat(WIDTH - 1) + '|');

  for (const ev of ganttEvents) {
    const label =
      ev.activity.length > maxLabelLen
        ? ev.activity.slice(0, maxLabelLen - 1) + '…'
        : ev.activity.padEnd(maxLabelLen);

    const startPos = Math.round((ev.start_ms / totalMs) * WIDTH);
    const endPos = Math.round((ev.end_ms / totalMs) * WIDTH);
    const barLen = Math.max(1, endPos - startPos);

    const bar = ' '.repeat(startPos) + '█'.repeat(barLen);
    lines.push(`  ${label}  ${bar}`);
  }

  lines.push('');
  const serviceMs = ganttEvents.reduce((s, e) => s + (e.end_ms - e.start_ms), 0);
  const waitMs = totalMs - serviceMs;
  lines.push(
    `Total: ${toHours(totalMs).toFixed(1)}h | Service: ${toHours(serviceMs).toFixed(1)}h | Wait: ${toHours(Math.max(0, waitMs)).toFixed(1)}h`
  );

  return lines;
}

// ── Command definition ────────────────────────────────────────────────────────

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
      '  wpm temporal log.xes --breakdown              # sojourn time decomposition per activity\n' +
      '  wpm temporal log.xes --sla 48                 # SLA compliance checking (48h target)\n' +
      '  wpm temporal log.xes --gantt                  # ASCII Gantt chart of sample trace\n' +
      '\n' +
      'Output includes:\n' +
      '  • Temporal conformance fitness (0–100%) — percentage of time transitions match the average pattern\n' +
      '  • Outlier transitions — activities that take >2 standard deviations from their mean duration\n' +
      '  • Waiting-time distribution per activity (median, P90, P99 percentiles)\n' +
      '  • Primary bottleneck — the single activity where work queues longest (P90 wait time)\n' +
      '  • Impossible timestamps — events where end time < start time (data quality issues)\n' +
      '  • Case duration percentiles (P50, P75, P90, P95, P99) in JSON output\n' +
      '  • SLA compliance report when --sla <hours> is specified\n' +
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
    'bucket-size': {
      type: 'string',
      description: 'Time window for aggregation in hours (default: 1)',
      default: '1',
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
    breakdown: {
      type: 'boolean',
      description: 'Show sojourn time decomposition per activity with bottleneck flags',
    },
    sla: {
      type: 'string',
      description: 'SLA target in hours — report compliance rate and violation details',
    },
    gantt: {
      type: 'boolean',
      description: 'Render ASCII Gantt chart of a sample trace',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const showBreakdown = Boolean(ctx.args.breakdown);
    const showGantt = Boolean(ctx.args.gantt);

    // SLA target validation
    let slaHours: number | null = null;
    if (ctx.args.sla) {
      const rawSla = ctx.args.sla as string;
      slaHours = parseFloat(rawSla);
      if (Number.isNaN(slaHours) || slaHours <= 0) {
        const result = makeErrorResult(
          'temporal',
          `Invalid --sla value '${rawSla}': must be a positive number of hours (e.g. --sla 48).`,
          EXIT_CODES.config_error,
          'INVALID_SLA'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    }

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
        breakdown: showBreakdown,
        sla_hours: slaHours ?? 0,
        gantt: showGantt,
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

              // Helper: fast percentile using same logic as before (for per-activity stats)
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

              // Per-activity cycle-time distribution (P50/P90/P99)
              let cycleTimePercentiles: Record<
                string,
                { p50: number; p90: number; p99: number; mean: number; count: number }
              > | null = null;
              // Per-resource cycle-time distribution
              let cycleTimeByResource: Record<
                string,
                { p50: number; p90: number; p99: number; mean: number; count: number }
              > | null = null;

              // All detail records for downstream analysis
              const allDetails: Array<Record<string, unknown>> =
                (temporalConformance?.details as Array<Record<string, unknown>>) ?? [];

              if (temporalConformance) {
                const durationsByActivity: Record<string, number[]> = {};
                const durationsByResource: Record<string, number[]> = {};
                for (const d of allDetails) {
                  const activity = d.from as string;
                  const resource = d.resource as string | undefined;
                  const dur = d.duration_ms as number;
                  if (typeof activity === 'string' && typeof dur === 'number' && dur >= 0) {
                    if (!durationsByActivity[activity]) durationsByActivity[activity] = [];
                    durationsByActivity[activity].push(dur);
                  }
                  if (typeof resource === 'string' && typeof dur === 'number' && dur >= 0) {
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
                if (Object.keys(durationsByResource).length > 0) {
                  cycleTimeByResource = {};
                  for (const [res, durations] of Object.entries(durationsByResource)) {
                    cycleTimeByResource[res] = computePercentiles(durations);
                  }
                }
              }

              // ── Case-level duration computation ──────────────────────────────
              const { caseDurationsMs, caseMap } = computeCaseDurations(allDetails, activityKey);

              // Full percentile statistics for case_duration JSON field (Task 5)
              const caseDurationStats: (PercentileStats & { unit: string }) | null =
                caseDurationsMs.length > 0
                  ? {
                      ...computeFullPercentiles(caseDurationsMs.map((ms) => ms / 3600_000)),
                      unit: 'hours',
                    }
                  : null;

              // ── Bottleneck drift/stability (existing logic preserved) ────────
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

              // ── New: Sojourn breakdown (Task 2) ──────────────────────────────
              const sojournBreakdown: SojournBreakdown[] | null = showBreakdown
                ? computeSojournBreakdown(allDetails, caseDurationsMs)
                : null;

              // ── New: SLA compliance (Task 3) ─────────────────────────────────
              const slaCompliance: SlaCompliance | null =
                slaHours !== null ? computeSlaCompliance(caseMap, slaHours) : null;

              // ── New: Gantt for longest trace (Task 4) ────────────────────────
              let ganttData: { caseId: string; events: GanttEvent[]; totalMs: number } | null =
                null;
              if (showGantt && caseMap.size > 0) {
                // Pick the longest case by total duration for maximum visual richness
                let longestId = '';
                let longestMs = -1;
                for (const [cid, { totalMs }] of caseMap.entries()) {
                  if (totalMs > longestMs) {
                    longestMs = totalMs;
                    longestId = cid;
                  }
                }
                if (longestId) {
                  const { steps } = caseMap.get(longestId)!;
                  ganttData = {
                    caseId: longestId,
                    events: buildGanttEvents(steps),
                    totalMs: longestMs,
                  };
                }
              }

              // ── Also include a top-bottleneck summary for JSON (Task 5) ──────
              const bottlenecks: Array<{ activity: string; avg_wait_hours: number; pct_of_case: number }> =
                sojournBreakdown
                  ? sojournBreakdown
                      .filter((b) => b.is_bottleneck)
                      .map((b) => ({
                        activity: b.activity,
                        avg_wait_hours: b.avg_sojourn_ms / 3600_000,
                        pct_of_case: b.pct_of_case,
                      }))
                  : [];

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
                // Van der Aalst Resource perspective
                cycleTimeByResource,
                // Bottleneck drift/stability
                bottleneckDrift,
                bottleneckStability,
                // ── New fields (Task 2-5) ──
                case_duration: caseDurationStats,
                bottlenecks,
                sla_compliance: slaCompliance,
                sojourn_breakdown: sojournBreakdown,
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
                printHumanTemporal(
                  projection,
                  res.payload as typeof payload,
                  showBreakdown,
                  showGantt,
                  ganttData
                );
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
                      sla_compliant: payload.sla_compliance?.compliance_rate ?? null,
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
          const result = makeErrorResult('temporal', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
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

// ── Human-readable output ─────────────────────────────────────────────────────

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
    case_duration: (PercentileStats & { unit: string }) | null;
    sojourn_breakdown: SojournBreakdown[] | null;
    sla_compliance: SlaCompliance | null;
  },
  showBreakdown: boolean,
  showGantt: boolean,
  ganttData: { caseId: string; events: GanttEvent[]; totalMs: number } | null
): void {
  const { violations, cycleTimePercentiles } = payload;

  projection.log('');
  projection.success(`Temporal Analysis — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Timestamp key: ${payload.timestampKey}`);
  projection.log('');

  // Impossible-timestamp validation errors
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

  // Case-duration summary
  if (payload.case_duration) {
    const cd = payload.case_duration;
    projection.log('  Case Duration Statistics:');
    projection.log(`    Mean:   ${cd.mean.toFixed(1)}h | Median: ${cd.median.toFixed(1)}h`);
    projection.log(
      `    P75:    ${cd.p75.toFixed(1)}h | P90:    ${cd.p90.toFixed(1)}h | P95: ${cd.p95.toFixed(1)}h | P99: ${cd.p99.toFixed(1)}h`
    );
    projection.log(`    Min:    ${cd.min.toFixed(1)}h | Max:    ${cd.max.toFixed(1)}h (n=${cd.count})`);
    projection.log('');
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

  // ── Sojourn breakdown (Task 2) ──────────────────────────────────────────────
  if (showBreakdown && payload.sojourn_breakdown && payload.sojourn_breakdown.length > 0) {
    const sb = payload.sojourn_breakdown;
    const avgCaseH =
      payload.case_duration ? payload.case_duration.mean : 0;

    projection.log('  Temporal Analysis — Sojourn Time Breakdown');
    projection.log('  ' + '='.repeat(70));
    const hdr =
      '  ' +
      'Activity'.padEnd(24) +
      'Avg Sojourn'.padStart(14) +
      'Pct of Case'.padStart(13) +
      '  Bottleneck';
    projection.log(hdr);
    projection.log('  ' + '─'.repeat(70));
    for (const b of sb.slice(0, 15)) {
      const label =
        b.activity.length > 22 ? b.activity.slice(0, 21) + '…' : b.activity.padEnd(23);
      const sojH = (b.avg_sojourn_ms / 3600_000).toFixed(1) + 'h';
      const pctStr = (b.pct_of_case * 100).toFixed(0) + '%';
      const flag = b.is_bottleneck ? '⚠ BOTTLENECK' : '';
      projection.log(
        `  ${label} ${sojH.padStart(12)} ${pctStr.padStart(12)}  ${flag}`
      );
    }
    projection.log('  ' + '─'.repeat(70));
    projection.log(`  Average case duration: ${avgCaseH.toFixed(1)}h`);
    projection.log('');

    const topBottleneck = sb.find((b) => b.is_bottleneck);
    if (topBottleneck) {
      projection.warn(
        `Top bottleneck: "${topBottleneck.activity}" — ${(topBottleneck.pct_of_case * 100).toFixed(0)}% of avg case time (${(topBottleneck.avg_sojourn_ms / 3600_000).toFixed(1)}h avg sojourn)`
      );
      projection.log('');
    }
  }

  // Cycle time distribution (existing behavior)
  if (cycleTimePercentiles && Object.keys(cycleTimePercentiles).length > 0) {
    const sorted = Object.entries(cycleTimePercentiles).sort(([, a], [, b]) => b.p90 - a.p90);
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

  // ── SLA compliance (Task 3) ────────────────────────────────────────────────
  if (payload.sla_compliance) {
    const sla = payload.sla_compliance;
    projection.log(`  SLA Compliance Report (target: ${sla.target_hours}h)`);
    projection.log('  ' + '='.repeat(50));
    projection.log(`  Compliant cases:   ${sla.compliant_cases}  (${(sla.compliance_rate * 100).toFixed(1)}%)`);
    projection.log(`  Violated cases:    ${sla.violated_cases}  (${((1 - sla.compliance_rate) * 100).toFixed(1)}%)`);
    if (sla.violated_cases > 0) {
      projection.log(`  Avg violation:     +${sla.avg_violation_hours.toFixed(1)}h over SLA`);
      projection.log(
        `  Max violation:     +${sla.max_violation_hours.toFixed(1)}h (case ${sla.max_violation_case})`
      );
      if (sla.first_breach_by_activity.length > 0) {
        projection.log('');
        projection.log('  By activity (first violation point):');
        for (const fb of sla.first_breach_by_activity.slice(0, 5)) {
          projection.log(`    "${fb.activity}" → ${fb.case_count} case(s) first breached SLA here`);
        }
      }
    }
    projection.log('');
  }

  // ── Gantt chart (Task 4) ───────────────────────────────────────────────────
  if (showGantt) {
    if (ganttData && ganttData.events.length > 0) {
      const lines = renderGantt(ganttData.caseId, ganttData.events, ganttData.totalMs);
      for (const line of lines) {
        projection.log(line);
      }
      projection.log('');
    } else {
      projection.log('  (no trace data available for Gantt chart)');
      projection.log('');
    }
  }
}
