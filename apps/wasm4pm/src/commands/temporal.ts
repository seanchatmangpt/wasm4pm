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
import * as path from 'path';

function extractTimestamps(logContent: string, timestampKey: string): Date[] {
  const dates: Date[] = [];
  try {
    const parsed = JSON.parse(logContent);
    const traverse = (obj: any) => {
      if (!obj) return;
      if (typeof obj === 'object') {
        if (obj[timestampKey]) {
          const d = new Date(obj[timestampKey]);
          if (!isNaN(d.getTime())) dates.push(d);
        }
        for (const k of Object.keys(obj)) {
          traverse(obj[k]);
        }
      }
    };
    traverse(parsed);
    if (dates.length > 0) return dates;
  } catch {}

  try {
    const lines = logContent.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj[timestampKey]) {
          const d = new Date(obj[timestampKey]);
          if (!isNaN(d.getTime())) dates.push(d);
        } else if (obj.attributes && obj.attributes[timestampKey]) {
          const d = new Date(obj.attributes[timestampKey]);
          if (!isNaN(d.getTime())) dates.push(d);
        } else if (Array.isArray(obj.events)) {
          for (const ev of obj.events) {
            if (ev[timestampKey]) {
              const d = new Date(ev[timestampKey]);
              if (!isNaN(d.getTime())) dates.push(d);
            } else if (ev.attributes && ev.attributes[timestampKey]) {
              const d = new Date(ev.attributes[timestampKey]);
              if (!isNaN(d.getTime())) dates.push(d);
            }
          }
        }
      } catch {}
    }
    if (dates.length > 0) return dates;
  } catch {}

  const escapedKey = timestampKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`<date\\s+key="${escapedKey}"\\s+value="([^"]+)"`, 'g');
  let match;
  while ((match = regex.exec(logContent)) !== null) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) {
      dates.push(d);
    }
  }
  return dates;
}

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
    if (dur < 0) continue;

    if (!caseMap.has(cid)) caseMap.set(cid, { steps: [], totalMs: 0 });
    const entry = caseMap.get(cid)!;
    entry.steps.push({ from, to, dur_ms: dur });
    entry.totalMs += dur;
  }

  void activityKey;
  const caseDurationsMs = Array.from(caseMap.values()).map((v) => v.totalMs);
  return { caseDurationsMs, caseMap };
}

/**
 * Compute sojourn-time breakdown per activity.
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
  result.sort((a, b) => b.avg_sojourn_ms - a.avg_sojourn_ms);
  return result;
}

/**
 * Compute SLA compliance from per-case durations.
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
 * Build a Gantt event list from temporal conformance details.
 */
function buildGanttEvents(
  steps: Array<{ from: string; to: string; dur_ms: number }>
): GanttEvent[] {
  if (steps.length === 0) return [];
  const events: GanttEvent[] = [];
  let cursor = 0;
  for (let i = 0; i < steps.length; i++) {
    const start = cursor;
    const end = cursor + steps[i].dur_ms;
    events.push({ activity: steps[i].from, start_ms: start, end_ms: end });
    cursor = end;
  }
  if (steps.length > 0) {
    events.push({ activity: steps[steps.length - 1].to, start_ms: cursor, end_ms: cursor });
  }
  return events;
}

/**
 * Render ASCII Gantt chart for a trace.
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

export const temporal = defineCommand({
  meta: {
    name: 'temporal',
    description: 'Analyze temporal profiles and performance patterns in event logs.',
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

    let bucketSizeHours = 1;
    if (ctx.args['bucket-size']) {
      const rawBucket = ctx.args['bucket-size'] as string;
      bucketSizeHours = parseFloat(rawBucket);
      if (Number.isNaN(bucketSizeHours) || bucketSizeHours <= 0) {
        const result = makeErrorResult(
          'temporal',
          new Error(`--bucket-size must be a valid number, got: ${rawBucket}`),
          EXIT_CODES.config_error,
          'INVALID_BUCKET_SIZE'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    }

    let slaHours: number | null = null;
    if (ctx.args.sla) {
      const rawSla = ctx.args.sla as string;
      slaHours = parseFloat(rawSla);
      if (Number.isNaN(slaHours) || slaHours <= 0) {
        const result = makeErrorResult(
          'temporal',
          `Invalid --sla value '${rawSla}': must be a positive number of hours.`,
          EXIT_CODES.config_error,
          'INVALID_SLA'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    }

    let lateViolationsCount = 0;
    let lateTemporalFitness = -1;
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
          const inputPath: string | undefined =
            (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

          if (!inputPath) {
            const result = makeErrorResult(
              'temporal',
              'Input file required.\nUsage: wpm temporal -i <log.xes> [--threshold <val>]',
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
          if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
            const result = makeErrorResult(
              'temporal',
              `Invalid --threshold: must be a number between 0.0 and 1.0.`,
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
            async (wasmBase, logHandle) => {
              const wasm = wasmBase as Record<string, any>;

              const rawDfg = wasm.discover_dfg(logHandle, activityKey);
              const dfg = typeof rawDfg === 'string' ? JSON.parse(rawDfg) : rawDfg;

              let profileHandle: string | null = null;
              let temporalConformance: Record<string, unknown> | null = null;
              try {
                const rawProfileHandle = wasm.discover_temporal_profile(
                  logHandle,
                  activityKey,
                  timestampKey
                );
                profileHandle = String(rawProfileHandle);
              } catch { /* not available */ }

              let violations: Array<Record<string, unknown>> = [];
              let impossibleTimestampCount = 0;
              if (profileHandle) {
                try {
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
                  const details = (temporalConformance?.details as Array<Record<string, unknown>>) ?? [];
                  violations = details.filter((d) => d.deviation === true);
                  impossibleTimestampCount = details.filter(
                    (d) => typeof d.duration_ms === 'number' && (d.duration_ms as number) < 0
                  ).length;
                } catch { /* failed */ }
              }

              const computePercentiles = (durations: number[]) => {
                const sorted = [...durations].sort((a, b) => a - b);
                const pct = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
                return {
                  p50: pct(50),
                  p90: pct(90),
                  p99: pct(99),
                  mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
                  count: sorted.length,
                };
              };

              let cycleTimePercentiles: Record<string, any> | null = null;
              const allDetails = (temporalConformance?.details as Array<Record<string, unknown>>) ?? [];

              if (temporalConformance) {
                const durationsByActivity: Record<string, number[]> = {};
                for (const d of allDetails) {
                  const activity = d.from as string;
                  const dur = d.duration_ms as number;
                  if (activity && typeof dur === 'number' && dur >= 0) {
                    if (!durationsByActivity[activity]) durationsByActivity[activity] = [];
                    durationsByActivity[activity].push(dur);
                  }
                }
                if (Object.keys(durationsByActivity).length > 0) {
                  cycleTimePercentiles = {};
                  for (const [act, durations] of Object.entries(durationsByActivity)) {
                    cycleTimePercentiles[act] = computePercentiles(durations);
                  }
                }
              }

              const { caseDurationsMs, caseMap } = computeCaseDurations(allDetails, activityKey);
              const caseDurationStats = caseDurationsMs.length > 0
                  ? { ...computeFullPercentiles(caseDurationsMs.map((ms) => ms / 3600_000)), unit: 'hours' }
                  : null;

              const sojournBreakdown = showBreakdown ? computeSojournBreakdown(allDetails, caseDurationsMs) : null;
              const slaCompliance = slaHours !== null ? computeSlaCompliance(caseMap, slaHours) : null;

              // Extract timestamps from log file to compute buckets & trend
              let buckets: Array<{ start: string; end: string; count: number }> = [];
              let trendDirection = 'stable';
              try {
                const logContent = await fs.readFile(inputPath, 'utf8');
                const dates = extractTimestamps(logContent, timestampKey);
                if (dates.length > 0) {
                  const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
                  const minTime = sortedDates[0].getTime();
                  const maxTime = sortedDates[sortedDates.length - 1].getTime();
                  const bucketMs = bucketSizeHours * 3600 * 1000;
                  const numBuckets = Math.max(1, Math.ceil((maxTime - minTime) / bucketMs));
                  
                  buckets = Array.from({ length: numBuckets }, (_, i) => ({
                    start: new Date(minTime + i * bucketMs).toISOString(),
                    end: new Date(minTime + (i + 1) * bucketMs).toISOString(),
                    count: 0,
                  }));

                  for (const date of sortedDates) {
                    const t = date.getTime();
                    const bucketIdx = Math.min(numBuckets - 1, Math.floor((t - minTime) / bucketMs));
                    buckets[bucketIdx].count++;
                  }

                  if (numBuckets > 1) {
                    const half = Math.floor(numBuckets / 2);
                    let firstHalfSum = 0;
                    let secondHalfSum = 0;
                    for (let i = 0; i < numBuckets; i++) {
                      if (i < half) firstHalfSum += buckets[i].count;
                      else secondHalfSum += buckets[i].count;
                    }
                    const diff = secondHalfSum - firstHalfSum;
                    const thresholdPct = 0.05 * sortedDates.length;
                    if (diff > thresholdPct) {
                      trendDirection = 'accelerating';
                    } else if (diff < -thresholdPct) {
                      trendDirection = 'decelerating';
                    } else {
                      trendDirection = 'stable';
                    }
                  }
                }
              } catch (e) {
                // fallback
              }

              const bottlenecks = sojournBreakdown
                ? sojournBreakdown.filter((x) => x.is_bottleneck).map((x) => x.activity)
                : [];

              const payload = {
                input: inputPath,
                activityKey,
                timestampKey,
                threshold,
                bucketSizeHours,
                buckets,
                trendDirection,
                bottlenecks,
                dfg: { nodes: dfg.nodes ?? [], edges: dfg.edges ?? [] },
                temporalConformance,
                violations: { count: violations.length, threshold, items: violations },
                impossibleTimestampCount,
                cycleTimePercentiles,
                case_duration: caseDurationStats,
                sla_compliance: slaCompliance,
                sojourn_breakdown: sojournBreakdown,
              };

              lateViolationsCount = payload.violations.count;
              lateImpossibleTsCount = payload.impossibleTimestampCount;
              lateTemporalFitness = Number(temporalConformance?.fitness ?? -1);
              lateStatus = 'ok';

              const result = makeResult('temporal', payload, performance.now() - t0, EXIT_CODES.success);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const p = res.payload as any;
                projection.log('');
                projection.success(`Temporal Analysis Completed Successfully`);
                projection.log(`  Input file: ${p.input}`);
                projection.log(`  Activities: ${p.dfg?.nodes?.length ?? 0}`);
                projection.log(`  Violations: ${p.violations?.count ?? 0}`);
                projection.log(`  Bucket size: ${p.bucketSizeHours} hours`);
                projection.log(`  Trend:       ${p.trendDirection}`);
                projection.log('');

                if (p.sla_compliance) {
                  projection.log('SLA Compliance Summary:');
                  projection.log(`  Target:      ${p.sla_compliance.target_hours} hours`);
                  projection.log(`  Compliant:   ${p.sla_compliance.compliant_cases} / ${p.sla_compliance.total_cases} cases (${(p.sla_compliance.compliance_rate * 100).toFixed(1)}%)`);
                  projection.log(`  Violated:    ${p.sla_compliance.violated_cases} cases`);
                  if (p.sla_compliance.violated_cases > 0) {
                    projection.log(`  Avg Breach:  ${p.sla_compliance.avg_violation_hours.toFixed(1)} hours`);
                    projection.log(`  Max Breach:  ${p.sla_compliance.max_violation_hours.toFixed(1)} hours (case ${p.sla_compliance.max_violation_case})`);
                  }
                  projection.log('');
                }

                if (showBreakdown && p.sojourn_breakdown && p.sojourn_breakdown.length > 0) {
                  projection.log('Sojourn Time Breakdown & Bottlenecks:');
                  for (const b of p.sojourn_breakdown) {
                    const bn = b.is_bottleneck ? ' [BOTTLENECK]' : '';
                    projection.log(`  - ${b.activity}: avg sojourn = ${b.avg_sojourn_ms.toFixed(0)}ms (${(b.pct_of_case * 100).toFixed(1)}% of case)${bn}`);
                  }
                  projection.log('');
                }

                if (showGantt && p.temporalConformance?.details) {
                  const details = p.temporalConformance.details as any[];
                  const cases = new Map<string, any[]>();
                  for (const d of details) {
                    const cid = d.case_id ?? 'unknown';
                    if (!cases.has(cid)) cases.set(cid, []);
                    cases.get(cid)!.push(d);
                  }
                  const firstCaseId = Array.from(cases.keys())[0];
                  if (firstCaseId) {
                    const caseSteps = cases.get(firstCaseId)!;
                    const gEvents = buildGanttEvents(caseSteps);
                    const totalMs = caseSteps.reduce((s, e) => s + (e.duration_ms ?? 0), 0);
                    const ganttLines = renderGantt(firstCaseId, gEvents, totalMs);
                    projection.log('Gantt Chart:');
                    for (const line of ganttLines) {
                      projection.log(line);
                    }
                    projection.log('');
                  }
                }
              });

              if (!ctx.args['no-save']) {
                const inputBytes = await fs.readFile(inputPath!);
                const activitiesAnalyzed = Array.isArray(payload.dfg.nodes) ? payload.dfg.nodes.length : 0;
                const receipt: CommandReceipt = {
                  ...newReceipt('temporal'),
                  command: 'temporal',
                  input_hash: blake3Hex(inputBytes),
                  output_hash: blake3Hex(JSON.stringify(payload)),
                  status: 'success',
                  summary: {
                    activities_analyzed: activitiesAnalyzed,
                    deviation_count: payload.violations.count,
                    input_file: inputPath,
                  },
                };
                saveCommandReceipt(receipt);
              }

              return await exitWithFlush(result.exit_code);
            }
          );
        } catch (error) {
          lateStatus = 'error';
          const result = makeErrorResult('temporal', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      () => ({
        violations_count: lateViolationsCount,
        temporal_fitness: lateTemporalFitness,
        impossible_timestamp_count: lateImpossibleTsCount,
        status: lateStatus,
      })
    );
  },
});
