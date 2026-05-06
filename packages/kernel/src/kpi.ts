import type { PredictionLog, PredictionTrace } from './prediction/types.js';

export interface CaseKpi {
  caseId: string;
  cycleTimeMs: number;
  reworkRatio: number;
  slaBreached: boolean;
}

export interface LogKpiSummary {
  caseCount: number;
  median_cycle_time_ms: number;
  p95_cycle_time_ms: number;
  mean_rework_ratio: number;
  sla_breach_count: number;
  sla_breach_pct: number;
}

export function computeCaseKpis(log: PredictionLog, slaThresholdMs: number): CaseKpi[] {
  return log.traces.map((trace: PredictionTrace) => {
    const events = trace.events;
    const cycleTimeMs = events.length >= 2
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;

    const activityCounts: Record<string, number> = {};
    for (const ev of events)
      activityCounts[ev.activity] = (activityCounts[ev.activity] ?? 0) + 1;
    const repeated = Object.values(activityCounts).filter(c => c > 1).reduce((s, c) => s + (c - 1), 0);
    const reworkRatio = events.length > 0 ? repeated / events.length : 0;

    return {
      caseId: trace.caseId,
      cycleTimeMs,
      reworkRatio,
      slaBreached: cycleTimeMs > slaThresholdMs,
    };
  });
}

export function summarizeKpis(kpis: CaseKpi[]): LogKpiSummary {
  if (kpis.length === 0) {
    return { caseCount: 0, median_cycle_time_ms: 0, p95_cycle_time_ms: 0, mean_rework_ratio: 0, sla_breach_count: 0, sla_breach_pct: 0 };
  }
  const sorted = [...kpis].sort((a, b) => a.cycleTimeMs - b.cycleTimeMs);
  const median_cycle_time_ms = sorted[Math.floor(sorted.length / 2)].cycleTimeMs;
  const p95_cycle_time_ms = sorted[Math.floor(sorted.length * 0.95)].cycleTimeMs;
  const mean_rework_ratio = kpis.reduce((s, k) => s + k.reworkRatio, 0) / kpis.length;
  const sla_breach_count = kpis.filter(k => k.slaBreached).length;
  const sla_breach_pct = (sla_breach_count / kpis.length) * 100;
  return { caseCount: kpis.length, median_cycle_time_ms, p95_cycle_time_ms, mean_rework_ratio, sla_breach_count, sla_breach_pct };
}
