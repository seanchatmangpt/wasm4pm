/**
 * Agent 5: Performance Analyzer
 *
 * Quantifies process execution time, resource usage, and bottlenecks.
 * Time perspective + cost perspective from van der Aalst framework.
 */

import type { OcelEventLog } from './ocel-harvester';

export interface ActivityMetrics {
  activity: string;
  count: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  stdDevMs: number;
  totalCostUnits: number;
  avgCostPerExecution: number;
}

export interface BottleneckAnalysis {
  activity: string;
  bottleneckScore: number; // 0-1, higher = more bottleneck
  totalTimeMs: number;
  contributionPercent: number; // % of total process time
  recommendation: string;
}

export interface PerformanceResult {
  totalProcessTimeMs: number; // End - Start of first trace
  avgTraceTimeMs: number;
  minTraceTimeMs: number;
  maxTraceTimeMs: number;
  activityMetrics: ActivityMetrics[];
  bottlenecks: BottleneckAnalysis[];
  criticalPath: string[]; // Longest path through activities
  criticalPathDurationMs: number;
  resourceUtilizationPercent: number; // 0-100, based on distributed execution
  parallelizationPotential: number; // 0-1, how much can run in parallel
  recommendation: string;
}

export class PerformanceAnalyzer {
  async analyzePerformance(ocel: OcelEventLog): Promise<PerformanceResult> {
    // Group events by trace
    const traces = new Map<string, OcelEventLog['events']>();
    for (const event of ocel.events) {
      const traceKey = event.objects[0] ?? 'unknown';
      if (!traces.has(traceKey)) {
        traces.set(traceKey, []);
      }
      traces.get(traceKey)!.push(event);
    }

    // Calculate activity metrics
    const activityStats = new Map<
      string,
      {
        durations: number[];
        count: number;
        totalCost: number;
      }
    >();

    const traceTimes: number[] = [];

    for (const [_, traceEvents] of traces) {
      const sorted = [...traceEvents].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (sorted.length > 0) {
        const traceStartTime = new Date(sorted[0].timestamp).getTime();
        const traceEndTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
        traceTimes.push(traceEndTime - traceStartTime);

        for (const event of sorted) {
          const activity = event.activity;
          const durationMs = event.attributes?.['duration_ms'] ?? 1;
          const cost = event.attributes?.['cost'] ?? 1;

          if (!activityStats.has(activity)) {
            activityStats.set(activity, { durations: [], count: 0, totalCost: 0 });
          }

          const stats = activityStats.get(activity)!;
          stats.durations.push(durationMs as number);
          stats.count++;
          stats.totalCost += (cost as number) ?? 1;
        }
      }
    }

    // Build ActivityMetrics array
    const activityMetrics: ActivityMetrics[] = [];
    for (const [activity, stats] of activityStats) {
      const durations = stats.durations;
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance =
        durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      activityMetrics.push({
        activity,
        count: stats.count,
        avgDurationMs: avg,
        minDurationMs: Math.min(...durations),
        maxDurationMs: Math.max(...durations),
        stdDevMs: stdDev,
        totalCostUnits: stats.totalCost,
        avgCostPerExecution: stats.totalCost / stats.count,
      });
    }

    // Calculate total process time
    const totalProcessTimeMs = traceTimes.reduce((a, b) => a + b, 0);
    const avgTraceTimeMs = traceTimes.length > 0 ? totalProcessTimeMs / traceTimes.length : 0;

    // Identify bottlenecks
    const totalActivityTimeMs = activityMetrics.reduce((sum, a) => sum + a.avgDurationMs * a.count, 0);
    const bottlenecks: BottleneckAnalysis[] = activityMetrics
      .map((m) => {
        const activityTotalTime = m.avgDurationMs * m.count;
        const contribution =
          totalActivityTimeMs > 0 ? (activityTotalTime / totalActivityTimeMs) * 100 : 0;
        const bottleneckScore = Math.min(1, contribution / 100); // Normalize to 0-1

        return {
          activity: m.activity,
          bottleneckScore,
          totalTimeMs: activityTotalTime,
          contributionPercent: contribution,
          recommendation:
            bottleneckScore > 0.3
              ? `Optimize '${m.activity}' (${contribution.toFixed(1)}% of total time)`
              : `Monitor '${m.activity}'`,
        };
      })
      .sort((a, b) => b.bottleneckScore - a.bottleneckScore);

    // Calculate critical path (simplified: longest sequence of activities)
    let criticalPath: string[] = [];
    let criticalPathDurationMs = 0;

    if (traceTimes.length > 0) {
      const sortedByTime = [...traces.entries()].sort(
        (a, b) =>
          (new Date(b[1][b[1].length - 1].timestamp).getTime() -
            new Date(b[1][0].timestamp).getTime()) -
          (new Date(a[1][a[1].length - 1].timestamp).getTime() -
            new Date(a[1][0].timestamp).getTime())
      );

      if (sortedByTime.length > 0) {
        const longestTrace = sortedByTime[0][1];
        const sorted = [...longestTrace].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        criticalPath = sorted.map((e) => e.activity);
        criticalPathDurationMs =
          new Date(sorted[sorted.length - 1].timestamp).getTime() -
          new Date(sorted[0].timestamp).getTime();
      }
    }

    // Resource utilization: approximate based on concurrent activities
    const concurrentActivities = this.estimateConcurrency(ocel);
    const resourceUtilizationPercent = Math.min(100, concurrentActivities * 20); // Heuristic scaling

    // Parallelization potential: how many activities can run concurrently
    const uniqueActivitiesInLog = new Set(ocel.events.map((e) => e.activity)).size;
    const parallelizationPotential = Math.min(1, concurrentActivities / uniqueActivitiesInLog);

    // Generate recommendation
    const topBottleneck = bottlenecks[0];
    const recommendation =
      topBottleneck && topBottleneck.bottleneckScore > 0.3
        ? `Focus on optimizing '${topBottleneck.activity}' which accounts for ${topBottleneck.contributionPercent.toFixed(1)}% of execution time. Potential speedup: ${(topBottleneck.bottleneckScore * 50).toFixed(0)}%`
        : `Process performance acceptable. Monitor activities with high variance: ${activityMetrics
            .filter((a) => a.stdDevMs > a.avgDurationMs * 0.5)
            .map((a) => a.activity)
            .join(', ') || 'none'}`;

    return {
      totalProcessTimeMs,
      avgTraceTimeMs,
      minTraceTimeMs: traceTimes.length > 0 ? Math.min(...traceTimes) : 0,
      maxTraceTimeMs: traceTimes.length > 0 ? Math.max(...traceTimes) : 0,
      activityMetrics: activityMetrics.sort((a, b) => b.avgDurationMs - a.avgDurationMs),
      bottlenecks,
      criticalPath,
      criticalPathDurationMs,
      resourceUtilizationPercent,
      parallelizationPotential,
      recommendation,
    };
  }

  private estimateConcurrency(ocel: OcelEventLog): number {
    // Simple heuristic: max number of objects active at same timestamp
    const timestamps = new Map<string, Set<string>>();

    for (const event of ocel.events) {
      const ts = event.timestamp;
      if (!timestamps.has(ts)) {
        timestamps.set(ts, new Set());
      }
      for (const obj of event.objects) {
        timestamps.get(ts)!.add(obj);
      }
    }

    let maxConcurrent = 0;
    for (const objects of timestamps.values()) {
      maxConcurrent = Math.max(maxConcurrent, objects.size);
    }

    return Math.max(1, maxConcurrent);
  }
}
