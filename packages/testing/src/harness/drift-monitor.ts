/**
 * Agent 7: Drift Monitor
 *
 * Detects when discovered process diverges from trained model.
 * EWMA-smoothed trend analysis + early warning system.
 */

import type { OcelEventLog } from './ocel-harvester';

export interface DriftResult {
  driftDetected: boolean;
  driftType: 'none' | 'control-flow' | 'performance' | 'resource' | 'data';
  driftSeverity: number; // 0-1
  warningLevel: 'green' | 'yellow' | 'red';
  newActivities: string[];
  performanceDegradationPercent?: number;
  ewmaValue: number;
  recommendation: string;
}

export class DriftMonitor {
  private ewmaAlpha = 0.3; // Smoothing factor for EWMA

  async detectDrift(baseline: OcelEventLog, current: OcelEventLog): Promise<DriftResult> {
    const baselineActivities = new Set(baseline.events.map((e) => e.activity));
    const currentActivities = new Set(current.events.map((e) => e.activity));

    // Check control-flow drift
    const newActivities = Array.from(currentActivities).filter((a) => !baselineActivities.has(a));
    const removedActivities = Array.from(baselineActivities).filter((a) => !currentActivities.has(a));

    let driftType: 'none' | 'control-flow' | 'performance' | 'resource' | 'data' = 'none';
    let driftSeverity = 0;

    // Control-flow drift
    if (newActivities.length > 0 || removedActivities.length > 0) {
      driftType = 'control-flow';
      driftSeverity = Math.max(
        newActivities.length / (currentActivities.size + 1),
        removedActivities.length / (baselineActivities.size + 1)
      );
    }

    // Performance drift
    const baseDuration = this.calculateMeanDuration(baseline);
    const currentDuration = this.calculateMeanDuration(current);
    const perfDegradation = (currentDuration - baseDuration) / (baseDuration + 0.001);

    if (perfDegradation > 0.2) {
      if (driftType === 'none') driftType = 'performance';
      driftSeverity = Math.max(driftSeverity, Math.min(1, perfDegradation));
    }

    // Resource drift
    const baselineResources = this.extractResources(baseline);
    const currentResources = this.extractResources(current);
    const newResources = currentResources.filter((r) => !baselineResources.includes(r));

    if (newResources.length > 0) {
      if (driftType === 'none') driftType = 'resource';
      driftSeverity = Math.max(driftSeverity, 0.3);
    }

    // EWMA smoothing
    const ewmaValue = this.ewmaAlpha * driftSeverity + (1 - this.ewmaAlpha) * 0;

    // Warning level
    let warningLevel: 'green' | 'yellow' | 'red';
    if (driftSeverity < 0.2) {
      warningLevel = 'green';
    } else if (driftSeverity < 0.7) {
      warningLevel = 'yellow';
    } else {
      warningLevel = 'red';
    }

    // Recommendation
    let recommendation = 'No action needed';
    if (warningLevel === 'yellow') {
      recommendation = 'Monitor process. Consider retraining model if drift persists.';
    } else if (warningLevel === 'red') {
      recommendation = 'CRITICAL: Process has drifted significantly. Retrain model immediately.';
    }

    return {
      driftDetected: driftType !== 'none',
      driftType,
      driftSeverity: Math.min(1, driftSeverity),
      warningLevel,
      newActivities,
      performanceDegradationPercent: perfDegradation > 0 ? perfDegradation * 100 : undefined,
      ewmaValue,
      recommendation,
    };
  }

  private calculateMeanDuration(ocel: OcelEventLog): number {
    const durations = ocel.events
      .map((e) => e.attributes?.['duration_ms'])
      .filter((d) => typeof d === 'number') as number[];

    if (durations.length === 0) return 0;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  private extractResources(ocel: OcelEventLog): string[] {
    const resources = new Set<string>();
    for (const event of ocel.events) {
      const resource = event.attributes?.['resource'] as string | undefined;
      if (resource) {
        resources.add(resource);
      }
    }
    return Array.from(resources);
  }
}
