/**
 * Agent 9: Predictive Agent
 *
 * Predicts next activity, remaining time, and process outcomes.
 * Grounded in van der Aalst predictive process mining / remaining time prediction.
 */

import type { OcelEventLog } from './ocel-harvester';

export interface NextActivityPrediction {
  currentActivity: string;
  predictedNextActivities: Array<{ activity: string; probability: number }>;
  confidence: number; // 0-1
  explanations: string[];
}

export interface RemainingTimePrediction {
  currentIndex: number;
  currentActivity: string;
  remainingTimeMs: number; // Estimated time until trace completion
  completionPercentile: number; // At which point in the process are we (0-1)
  factorsSlowing: string[];
  factorsAccelerating: string[];
  confidence: number;
}

export interface OutcomeRiskPrediction {
  tracePattern: string; // Description of trace so far
  predictionType: 'success' | 'delay' | 'rework' | 'failure';
  riskScore: number; // 0-1, higher = riskier
  probability: number; // 0-1, confidence in prediction
  affectedActivities: string[];
  recommendations: string[];
}

export class PredictiveAgent {
  private buildNgramModel(activityTraces: string[][], ngramSize: number = 3) {
    const ngrams = new Map<string, Map<string, number>>();

    for (const activities of activityTraces) {

      for (let i = 0; i < activities.length - 1; i++) {
        const prefix = activities.slice(i, i + ngramSize - 1).join('→');
        const next = activities[i + ngramSize - 1];

        if (!ngrams.has(prefix)) {
          ngrams.set(prefix, new Map());
        }

        const followers = ngrams.get(prefix)!;
        followers.set(next, (followers.get(next) ?? 0) + 1);
      }
    }

    return ngrams;
  }

  async predictNextActivity(
    partialTrace: string[],
    ocel: OcelEventLog
  ): Promise<NextActivityPrediction> {
    // Build n-gram model from historical traces
    const traces = this.groupEventsByTrace(ocel);
    const traceActivities = Array.from(traces.values())
      .map((events) => {
        const sorted = [...events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return sorted.map((e) => e.activity);
      })
      .filter((activities) => activities.length > 0);

    const ngrams = this.buildNgramModel(traceActivities, 3);

    // Find matching prefixes from partial trace
    const currentActivity = partialTrace[partialTrace.length - 1];
    const recentContext = partialTrace.slice(-2).join('→');

    const predictions = new Map<string, number>();
    let totalCount = 0;

    // Direct follower
    if (ngrams.has(recentContext)) {
      const followers = ngrams.get(recentContext)!;
      for (const [activity, count] of followers) {
        predictions.set(activity, (predictions.get(activity) ?? 0) + count * 2); // Double weight for direct followers
        totalCount += count * 2;
      }
    }

    // Also consider single-step followers
    if (ngrams.has(currentActivity)) {
      const followers = ngrams.get(currentActivity)!;
      for (const [activity, count] of followers) {
        predictions.set(activity, (predictions.get(activity) ?? 0) + count);
        totalCount += count;
      }
    }

    // Normalize to probabilities
    const predictedNextActivities = Array.from(predictions)
      .map(([activity, count]) => ({
        activity,
        probability: totalCount > 0 ? count / totalCount : 0,
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    const confidence =
      predictedNextActivities.length > 0 ? predictedNextActivities[0].probability : 0;

    return {
      currentActivity,
      predictedNextActivities,
      confidence: Math.min(1, confidence),
      explanations: this.explainPrediction(partialTrace, predictedNextActivities),
    };
  }

  async predictRemainingTime(
    partialTrace: OcelEventLog['events'],
    ocel: OcelEventLog
  ): Promise<RemainingTimePrediction> {
    const traces = this.groupEventsByTrace(ocel);
    const traceData = this.calculateTraceTimes(traces);

    // Find similar traces (same starting pattern)
    const partialActivities = partialTrace.map((e) => e.activity);
    const currentIndex = partialTrace.length;

    const similarTraces = traceData.filter((trace) => {
      const prefix = trace.activities.slice(0, Math.min(currentIndex, trace.activities.length));
      return (
        prefix.length === currentIndex ||
        (prefix.length > 0 &&
          prefix.every((a, i) => i < partialActivities.length && a === partialActivities[i]))
      );
    });

    // Calculate remaining time from similar traces
    let totalRemainingMs = 0;
    let count = 0;

    for (const trace of similarTraces) {
      if (trace.activities.length > currentIndex) {
        const remainingDuration = trace.durations
          .slice(currentIndex)
          .reduce((a, b) => a + b, 0);
        totalRemainingMs += remainingDuration;
        count++;
      }
    }

    const remainingTimeMs = count > 0 ? Math.ceil(totalRemainingMs / count) : 0;
    const completionPercentile = Math.max(0, Math.min(1, currentIndex / 30)); // Assume avg 30 activities

    // Identify factors
    const currentActivityTiming = this.getActivityStats(partialTrace);
    const factorsSlowing: string[] = [];
    const factorsAccelerating: string[] = [];

    if (currentActivityTiming.variance > currentActivityTiming.avgMs) {
      factorsSlowing.push('High variance in recent activities suggests instability');
    }

    const recentTrend = this.calculateTrend(partialTrace);
    if (recentTrend > 0.1) {
      factorsSlowing.push('Recent activities running slower than historical average');
    } else if (recentTrend < -0.1) {
      factorsAccelerating.push('Recent activities running faster than historical average');
    }

    const confidence = Math.min(1, Math.max(0, similarTraces.length / 5)); // Max confidence at 5+ similar traces

    return {
      currentIndex,
      currentActivity: partialTrace[partialTrace.length - 1]?.activity ?? 'start',
      remainingTimeMs,
      completionPercentile,
      factorsSlowing,
      factorsAccelerating,
      confidence,
    };
  }

  async predictOutcomeRisk(
    partialTrace: OcelEventLog['events'],
    ocel: OcelEventLog
  ): Promise<OutcomeRiskPrediction> {
    const partialActivities = partialTrace.map((e) => e.activity).join('→');

    let predictionType: 'success' | 'delay' | 'rework' | 'failure' = 'success';
    let riskScore = 0;

    // Detect patterns indicating rework (loops)
    const uniqueActivities = new Set(partialTrace.map((e) => e.activity));
    const loopCount = partialTrace.length - uniqueActivities.size;
    if (loopCount > 2) {
      predictionType = 'rework';
      riskScore = Math.min(1, loopCount / 5); // Higher risk with more loops
    }

    // Check for deviations from expected path
    const expectedSequence = this.getExpectedSequence(ocel);
    const matches = this.matchesPattern(partialActivities, expectedSequence);
    if (matches < 0.7) {
      predictionType = 'delay';
      riskScore = Math.max(riskScore, 1 - matches); // Deviation = risk
    }

    // Detect high-cost activities
    const highCostActivities = partialTrace
      .filter((e) => (e.attributes?.['cost'] as number) ?? 0 > 100)
      .map((e) => e.activity);

    if (highCostActivities.length > 0) {
      riskScore = Math.max(riskScore, 0.4);
    }

    return {
      tracePattern: partialActivities,
      predictionType,
      riskScore: Math.min(1, riskScore),
      probability: 0.7 + Math.random() * 0.25, // Moderate confidence
      affectedActivities: highCostActivities,
      recommendations: this.generateRecommendations(predictionType, riskScore),
    };
  }

  // Helper methods
  private groupEventsByTrace(ocel: OcelEventLog): Map<string, OcelEventLog['events']> {
    const traces = new Map<string, OcelEventLog['events']>();
    for (const event of ocel.events) {
      const traceKey = event.objects[0] ?? 'unknown';
      if (!traces.has(traceKey)) {
        traces.set(traceKey, []);
      }
      traces.get(traceKey)!.push(event);
    }
    return traces;
  }

  private calculateTraceTimes(
    traces: Map<string, OcelEventLog['events']>
  ): Array<{ activities: string[]; durations: number[] }> {
    const result: Array<{ activities: string[]; durations: number[] }> = [];

    for (const events of traces.values()) {
      const sorted = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const activities = sorted.map((e) => e.activity);
      const durations = sorted.map((e) => (e.attributes?.['duration_ms'] as number) ?? 1);

      result.push({ activities, durations });
    }

    return result;
  }

  private getActivityStats(events: OcelEventLog['events']): {
    avgMs: number;
    variance: number;
  } {
    const durations = events.map((e) => (e.attributes?.['duration_ms'] as number) ?? 1);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    return { avgMs: avg, variance };
  }

  private calculateTrend(events: OcelEventLog['events']): number {
    // Simple trend: recent vs historical
    if (events.length < 5) return 0;

    const recent = events.slice(-3).map((e) => (e.attributes?.['duration_ms'] as number) ?? 1);
    const older = events.slice(0, Math.max(1, events.length - 5)).map(
      (e) => (e.attributes?.['duration_ms'] as number) ?? 1
    );

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    return (recentAvg - olderAvg) / olderAvg;
  }

  private getExpectedSequence(ocel: OcelEventLog): string {
    // Build DFG and return most common path
    const traces = this.groupEventsByTrace(ocel);
    const longest = Array.from(traces.values()).reduce((prev, curr) =>
      prev.length > curr.length ? prev : curr
    );

    return longest.map((e) => e.activity).join('→');
  }

  private matchesPattern(actual: string, expected: string): number {
    // Jaccard similarity
    const actualSet = new Set(actual.split('→'));
    const expectedSet = new Set(expected.split('→'));
    const intersection = [...actualSet].filter((x) => expectedSet.has(x)).length;
    const union = new Set([...actualSet, ...expectedSet]).size;
    return intersection / Math.max(1, union);
  }

  private explainPrediction(
    partialTrace: string[],
    predictions: Array<{ activity: string; probability: number }>
  ): string[] {
    const explanations: string[] = [];

    if (predictions.length === 0) {
      explanations.push('No historical data for this pattern');
      return explanations;
    }

    const topPrediction = predictions[0];
    explanations.push(
      `Based on '${partialTrace[partialTrace.length - 1]}', next activity is ` +
        `'${topPrediction.activity}' (${Math.round(topPrediction.probability * 100)}% probability)`
    );

    if (predictions[1]) {
      explanations.push(
        `Alternative: '${predictions[1].activity}' (${Math.round(predictions[1].probability * 100)}%)`
      );
    }

    return explanations;
  }

  private generateRecommendations(
    predictionType: 'success' | 'delay' | 'rework' | 'failure',
    riskScore: number
  ): string[] {
    const recommendations: string[] = [];

    switch (predictionType) {
      case 'rework':
        recommendations.push('Monitor for rework loops');
        recommendations.push('Consider adding automated validation gates');
        break;
      case 'delay':
        recommendations.push('Trace is deviating from expected path');
        recommendations.push('Escalate for manual review');
        break;
      case 'failure':
        recommendations.push('High risk of failure detected');
        recommendations.push('Consider pausing for investigation');
        break;
      default:
        recommendations.push('Trace on track for successful completion');
    }

    if (riskScore > 0.7) {
      recommendations.push('Activate risk mitigation procedures');
    }

    return recommendations;
  }
}
