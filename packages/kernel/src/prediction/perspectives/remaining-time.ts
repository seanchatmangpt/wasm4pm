/**
 * Remaining-time perspective.
 *
 * Estimates how much wall-clock time is left in an in-flight case.
 *
 * Model: per-prefix-length aggregator (mean/median) over training trace
 * remaining durations. For a prefix of length k we look up the historical
 * statistic for "remaining duration after k events".
 *
 * Output `prediction` shape:
 *   {
 *     remainingMs: number,
 *     elapsedMs: number,
 *     totalEstimateMs: number,
 *     basedOnSamples: number,
 *   }
 */

import {
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
  RemainingTimeTask,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface RemainingTimeState {
  /** prefixLength → sorted remaining durations (ms). */
  byPrefix: Record<number, number[]>;
  aggregator: 'mean' | 'median';
  /** Fallback statistic when prefix length unseen. */
  globalRemainingMs: number;
}

function aggregate(values: number[], how: 'mean' | 'median'): number {
  if (values.length === 0) return 0;
  if (how === 'mean') {
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
  }
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export class RemainingTimeHandler implements PerspectiveHandler<RemainingTimeTask> {
  readonly perspective = 'remaining_time' as const;

  fit(task: RemainingTimeTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const aggregator = task.aggregator ?? 'mean';
    const byPrefix: Record<number, number[]> = {};
    const allRemaining: number[] = [];

    for (const trace of log.traces) {
      const events = clipTrace(trace, task.maxPrefixLength).events;
      if (events.length < 2) continue;
      const lastTs = events[events.length - 1].timestamp;
      for (let k = 0; k < events.length; k++) {
        const remaining = lastTs - events[k].timestamp;
        if (remaining < 0) continue;
        if (byPrefix[k + 1] === undefined) byPrefix[k + 1] = [];
        byPrefix[k + 1].push(remaining);
        allRemaining.push(remaining);
      }
    }
    // Sort once so median is O(1) lookup.
    for (const k of Object.keys(byPrefix)) byPrefix[Number(k)].sort((a, b) => a - b);
    allRemaining.sort((a, b) => a - b);

    const state: RemainingTimeState = {
      byPrefix,
      aggregator,
      globalRemainingMs: aggregate(allRemaining, aggregator),
    };

    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`rt|${aggregator}|${log.traces.length}`),
    };
  }

  predict(
    task: RemainingTimeTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[],
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as RemainingTimeState;
    const out: PredictionRecord[] = [];
    for (const prefix of prefixes) {
      const events = clipTrace(prefix, task.maxPrefixLength).events;
      const k = events.length;
      const samples = state.byPrefix[k] ?? [];
      const remainingMs =
        samples.length > 0 ? aggregate(samples, state.aggregator) : state.globalRemainingMs;
      const elapsedMs = events.length >= 2 ? events[events.length - 1].timestamp - events[0].timestamp : 0;
      out.push({
        caseId: prefix.caseId,
        prefixLength: k,
        prediction: {
          remainingMs,
          elapsedMs,
          totalEstimateMs: elapsedMs + remainingMs,
          basedOnSamples: samples.length,
        },
        confidence: samples.length > 0 ? Math.min(1, samples.length / 30) : 0,
      });
    }
    return out;
  }
}
