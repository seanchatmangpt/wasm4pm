import { describe, it, expect } from 'vitest';
import { computeCaseKpis, summarizeKpis } from '../kpi.js';
import type { PredictionLog } from '../prediction/types.js';

// Build a minimal PredictionLog for testing
function makeLog(traces: Array<{ caseId: string; events: Array<{ activity: string; timestamp: number }> }>): PredictionLog {
  return {
    traces: traces.map(t => ({ caseId: t.caseId, events: t.events })),
  } as PredictionLog;
}

describe('computeCaseKpis', () => {
  it('cycleTime is 0 for single-event trace', () => {
    const log = makeLog([{ caseId: 'c1', events: [{ activity: 'A', timestamp: 1000 }] }]);
    const kpis = computeCaseKpis(log, 5000);
    expect(kpis[0].cycleTimeMs).toBe(0);
  });

  it('cycleTime is max minus min timestamp', () => {
    const log = makeLog([{ caseId: 'c1', events: [
      { activity: 'A', timestamp: 0 },
      { activity: 'B', timestamp: 5000 },
      { activity: 'C', timestamp: 12000 },
    ]}]);
    const kpis = computeCaseKpis(log, 99999);
    expect(kpis[0].cycleTimeMs).toBe(12000);
  });

  it('reworkRatio is 0 for all distinct activities', () => {
    const log = makeLog([{ caseId: 'c1', events: [
      { activity: 'A', timestamp: 0 },
      { activity: 'B', timestamp: 1000 },
      { activity: 'C', timestamp: 2000 },
    ]}]);
    const kpis = computeCaseKpis(log, 99999);
    expect(kpis[0].reworkRatio).toBe(0);
  });

  it('reworkRatio is 1/3 for [A, B, A]', () => {
    const log = makeLog([{ caseId: 'c1', events: [
      { activity: 'A', timestamp: 0 },
      { activity: 'B', timestamp: 1000 },
      { activity: 'A', timestamp: 2000 },
    ]}]);
    const kpis = computeCaseKpis(log, 99999);
    expect(Math.abs(kpis[0].reworkRatio - 1/3)).toBeLessThan(1e-10);
  });

  it('slaBreached is true when cycleTime exceeds threshold', () => {
    const log = makeLog([{ caseId: 'c1', events: [
      { activity: 'A', timestamp: 0 },
      { activity: 'B', timestamp: 10001 },
    ]}]);
    const kpis = computeCaseKpis(log, 10000);
    expect(kpis[0].slaBreached).toBe(true);
  });

  it('slaBreached is false at exact threshold', () => {
    const log = makeLog([{ caseId: 'c1', events: [
      { activity: 'A', timestamp: 0 },
      { activity: 'B', timestamp: 10000 },
    ]}]);
    const kpis = computeCaseKpis(log, 10000);
    expect(kpis[0].slaBreached).toBe(false);
  });
});

describe('summarizeKpis', () => {
  it('median is middle value for odd-length array', () => {
    const kpis = [
      { caseId: 'c1', cycleTimeMs: 1000, reworkRatio: 0, slaBreached: false },
      { caseId: 'c2', cycleTimeMs: 3000, reworkRatio: 0, slaBreached: false },
      { caseId: 'c3', cycleTimeMs: 5000, reworkRatio: 0, slaBreached: false },
    ];
    const summary = summarizeKpis(kpis);
    expect(summary.median_cycle_time_ms).toBe(3000);
  });

  it('sla_breach_count is correct', () => {
    const kpis = [
      { caseId: 'c1', cycleTimeMs: 1000, reworkRatio: 0, slaBreached: true },
      { caseId: 'c2', cycleTimeMs: 2000, reworkRatio: 0, slaBreached: true },
      { caseId: 'c3', cycleTimeMs: 3000, reworkRatio: 0, slaBreached: false },
    ];
    const summary = summarizeKpis(kpis);
    expect(summary.sla_breach_count).toBe(2);
    expect(Math.abs(summary.sla_breach_pct - 66.667)).toBeLessThan(0.1);
  });
});
