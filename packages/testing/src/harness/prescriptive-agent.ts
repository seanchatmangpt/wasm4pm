/**
 * Agent 8: Prescriptive Agent
 *
 * Recommends concrete actions to optimize the discovered process.
 * Grounded in van der Aalst prescriptive process mining.
 */

import type { OcelEventLog } from './ocel-harvester';

export interface OptimizationAction {
  id: string;
  activity: string;
  actionType: 'parallelize' | 'eliminate' | 'reorder' | 'automate' | 'batch' | 'prioritize';
  description: string;
  expectedImpactPercent: number; // % speedup or cost reduction
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  estimatedEffort: number; // hours to implement
  dependencyGroup: string; // group id for related actions
}

export interface ProcessOptimizationPlan {
  processName: string;
  currentThroughputPerMin: number;
  projectedThroughputPerMin: number;
  currentCostPerTrace: number;
  projectedCostPerTrace: number;
  actions: OptimizationAction[];
  totalExpectedGainPercent: number;
  executionRiskScore: number; // 0-1, higher = riskier
  recommendedPhasing: string[]; // recommended order
  timelineWeeks: number;
  businessValue: string;
}

export class PrescriptiveAgent {
  async generateOptimizationPlan(ocel: OcelEventLog): Promise<ProcessOptimizationPlan> {
    // Calculate baseline metrics
    const traces = new Map<string, OcelEventLog['events']>();
    for (const event of ocel.events) {
      const traceKey = event.objects[0] ?? 'unknown';
      if (!traces.has(traceKey)) {
        traces.set(traceKey, []);
      }
      traces.get(traceKey)!.push(event);
    }

    // Baseline throughput
    const avgTraceTimeMs = this.calculateAvgTraceTime(traces);
    const currentThroughputPerMin = avgTraceTimeMs > 0 ? 60000 / avgTraceTimeMs : 0;

    // Baseline cost
    const currentCostPerTrace = this.calculateTotalCost(ocel);

    // Identify optimization opportunities
    const actions: OptimizationAction[] = [];
    let totalGainPercent = 0;

    // 1. Identify bottleneck activities to optimize
    const activityTimings = this.getActivityTimings(traces);
    for (const [activity, timing] of activityTimings) {
      if (timing.avgMs > 1000) {
        // Activity takes >1s
        const actionId = `opt_${activity}_automate`;
        const expectedGain = Math.min(40, Math.ceil((timing.avgMs / 5000) * 30)); // Up to 40% gain

        actions.push({
          id: actionId,
          activity,
          actionType: 'automate',
          description: `Automate '${activity}' to reduce manual overhead (avg ${timing.avgMs}ms)`,
          expectedImpactPercent: expectedGain,
          complexity: 'medium',
          riskLevel: 'low',
          estimatedEffort: 16,
          dependencyGroup: 'automation',
        });

        totalGainPercent += expectedGain * 0.3; // 30% weighting per action
      }

      if (timing.variance > timing.avgMs) {
        // High variance in activity
        const actionId = `opt_${activity}_batch`;
        actions.push({
          id: actionId,
          activity,
          actionType: 'batch',
          description: `Batch process '${activity}' to stabilize execution time (variance: ${Math.ceil(timing.variance)}ms)`,
          expectedImpactPercent: 15,
          complexity: 'high',
          riskLevel: 'medium',
          estimatedEffort: 24,
          dependencyGroup: 'batching',
        });

        totalGainPercent += 15 * 0.15; // 15% weighting
      }
    }

    // 2. Identify parallelization opportunities
    const parallelizableGroups = this.identifyParallelizableActivities(ocel);
    for (const group of parallelizableGroups) {
      const actionId = `opt_parallelize_${group.join('_')}`;
      const expectedGain = Math.min(30, group.length * 10); // Up to 30% from parallelization

      actions.push({
        id: actionId,
        activity: `Group: ${group.join(', ')}`,
        actionType: 'parallelize',
        description: `Parallelize activities [${group.join(', ')}] currently running sequentially`,
        expectedImpactPercent: expectedGain,
        complexity: 'high',
        riskLevel: 'medium',
        estimatedEffort: 32,
        dependencyGroup: 'parallelization',
      });

      totalGainPercent += expectedGain * 0.2; // 20% weighting
    }

    // 3. Identify elimination opportunities (loop elimination, redundant steps)
    const loops = this.detectLoops(traces);
    for (const loop of loops) {
      if (loop.frequency > 1) {
        // This activity is repeated
        const actionId = `opt_eliminate_${loop.activity}_loop`;
        const expectedGain = Math.min(25, loop.frequency * 5);

        actions.push({
          id: actionId,
          activity: loop.activity,
          actionType: 'eliminate',
          description: `Reduce rework loops in '${loop.activity}' (occurs ${loop.frequency}x per trace on average)`,
          expectedImpactPercent: expectedGain,
          complexity: 'high',
          riskLevel: 'high',
          estimatedEffort: 40,
          dependencyGroup: 'quality',
        });

        totalGainPercent += expectedGain * 0.25; // 25% weighting
      }
    }

    // Cap total gain at 85%
    totalGainPercent = Math.min(85, totalGainPercent);

    // Project new metrics
    const projectedThroughputPerMin = currentThroughputPerMin * (1 + totalGainPercent / 100);
    const projectedCostPerTrace = currentCostPerTrace * (1 - totalGainPercent / 100);

    // Determine execution risk
    const highRiskCount = actions.filter((a) => a.riskLevel === 'high').length;
    const executionRiskScore = Math.min(1, highRiskCount * 0.15 + actions.length * 0.05);

    // Recommended phasing
    const recommendedPhasing = this.determinePhasingStrategy(actions);

    // Timeline estimate (weeks)
    const totalEffort = actions.reduce((sum, a) => sum + a.estimatedEffort, 0);
    const timelineWeeks = Math.ceil(totalEffort / 40); // 40h/week development

    return {
      processName: 'Discovered Process',
      currentThroughputPerMin,
      projectedThroughputPerMin,
      currentCostPerTrace,
      projectedCostPerTrace,
      actions: actions.sort((a, b) => b.expectedImpactPercent - a.expectedImpactPercent),
      totalExpectedGainPercent: totalGainPercent,
      executionRiskScore,
      recommendedPhasing,
      timelineWeeks,
      businessValue: `Throughput +${projectedThroughputPerMin > currentThroughputPerMin ? Math.ceil(((projectedThroughputPerMin / currentThroughputPerMin - 1) * 100)) : 0}%, Cost -${Math.ceil(((1 - projectedCostPerTrace / currentCostPerTrace) * 100))}%`,
    };
  }

  private calculateAvgTraceTime(traces: Map<string, OcelEventLog['events']>): number {
    const times: number[] = [];
    for (const events of traces.values()) {
      if (events.length > 1) {
        const sorted = [...events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const duration =
          new Date(sorted[sorted.length - 1].timestamp).getTime() -
          new Date(sorted[0].timestamp).getTime();
        times.push(duration);
      }
    }
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }

  private calculateTotalCost(ocel: OcelEventLog): number {
    let total = 0;
    for (const event of ocel.events) {
      total += (event.attributes?.['cost'] as number) ?? 1;
    }
    return total / Math.max(1, ocel.events.length);
  }

  private getActivityTimings(
    traces: Map<string, OcelEventLog['events']>
  ): Map<string, { avgMs: number; variance: number }> {
    const activityData = new Map<string, number[]>();

    for (const events of traces.values()) {
      for (const event of events) {
        const duration = (event.attributes?.['duration_ms'] as number) ?? 1;
        if (!activityData.has(event.activity)) {
          activityData.set(event.activity, []);
        }
        activityData.get(event.activity)!.push(duration);
      }
    }

    const result = new Map<string, { avgMs: number; variance: number }>();
    for (const [activity, durations] of activityData) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance =
        durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
      result.set(activity, { avgMs: avg, variance });
    }

    return result;
  }

  private identifyParallelizableActivities(ocel: OcelEventLog): string[][] {
    // Simple heuristic: activities that never directly follow each other can be parallelized
    const directlyFollows = new Set<string>();

    const traces = new Map<string, OcelEventLog['events']>();
    for (const event of ocel.events) {
      const traceKey = event.objects[0] ?? 'unknown';
      if (!traces.has(traceKey)) {
        traces.set(traceKey, []);
      }
      traces.get(traceKey)!.push(event);
    }

    for (const events of traces.values()) {
      const sorted = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        directlyFollows.add(`${sorted[i - 1].activity}->${sorted[i].activity}`);
      }
    }

    // Find groups of 2-3 activities that can be parallelized
    const allActivities = new Set(ocel.events.map((e) => e.activity));
    const parallelGroups: string[][] = [];

    const activities = Array.from(allActivities);
    for (let i = 0; i < activities.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 3, activities.length); j++) {
        const a1 = activities[i];
        const a2 = activities[j];
        if (!directlyFollows.has(`${a1}->${a2}`) && !directlyFollows.has(`${a2}->${a1}`)) {
          parallelGroups.push([a1, a2]);
        }
      }
    }

    return parallelGroups.slice(0, 2); // Return top 2 parallelization opportunities
  }

  private detectLoops(
    traces: Map<string, OcelEventLog['events']>
  ): Array<{ activity: string; frequency: number }> {
    const loopData = new Map<string, number[]>();

    for (const events of traces.values()) {
      const sorted = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const activitySequence = sorted.map((e) => e.activity);
      for (const activity of new Set(activitySequence)) {
        const count = activitySequence.filter((a) => a === activity).length;
        if (!loopData.has(activity)) {
          loopData.set(activity, []);
        }
        loopData.get(activity)!.push(count);
      }
    }

    const loops: Array<{ activity: string; frequency: number }> = [];
    for (const [activity, frequencies] of loopData) {
      const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
      if (avgFreq > 1.3) {
        // More than 30% of traces have this activity repeated
        loops.push({ activity, frequency: avgFreq });
      }
    }

    return loops.sort((a, b) => b.frequency - a.frequency);
  }

  private determinePhasingStrategy(actions: OptimizationAction[]): string[] {
    // Group by dependency, then order by impact and complexity
    const phasing: string[] = [];

    // Phase 1: Low-risk automation
    const autoActions = actions
      .filter((a) => a.actionType === 'automate' && a.riskLevel === 'low')
      .map((a) => a.id);
    if (autoActions.length > 0) {
      phasing.push(`Phase 1: Quick wins (${autoActions.length} automation actions)`);
    }

    // Phase 2: Medium-complexity optimization
    const mediumActions = actions
      .filter((a) => a.complexity === 'medium' && a.riskLevel !== 'high')
      .map((a) => a.id);
    if (mediumActions.length > 0) {
      phasing.push(`Phase 2: Process improvements (${mediumActions.length} actions)`);
    }

    // Phase 3: High-impact, high-risk changes
    const highRiskActions = actions
      .filter((a) => a.riskLevel === 'high')
      .map((a) => a.id);
    if (highRiskActions.length > 0) {
      phasing.push(`Phase 3: Structural changes (${highRiskActions.length} high-risk actions)`);
    }

    return phasing.length > 0
      ? phasing
      : ['Phase 1: Baseline established, monitor for opportunities'];
  }
}
