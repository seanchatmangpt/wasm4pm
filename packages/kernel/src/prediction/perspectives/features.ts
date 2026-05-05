/**
 * Features perspective.
 *
 * Extracts a fixed-shape numeric feature vector from a prefix that downstream
 * models (classify/regress/anomaly) can consume.
 *
 * Feature schema (all numeric, deterministic order):
 *   - prefix_length
 *   - distinct_activities
 *   - elapsed_ms             (timestamp[end] − timestamp[0])
 *   - mean_interevent_ms
 *   - max_interevent_ms
 *   - rework_count           (count of activity repetitions; only when includeRework)
 *   - rework_ratio           (rework_count / prefix_length; only when includeRework)
 *   - distinct_resources
 *
 * Output `prediction` shape:
 *   {
 *     features: Record<string, number>,
 *     schema: string[],   // ordered field names
 *   }
 */

import {
  FeaturesTask,
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface FeaturesState {
  schema: string[];
  includeRework: boolean;
}

function buildSchema(includeRework: boolean): string[] {
  const base = [
    'prefix_length',
    'distinct_activities',
    'elapsed_ms',
    'mean_interevent_ms',
    'max_interevent_ms',
    'distinct_resources',
  ];
  if (includeRework) base.splice(5, 0, 'rework_count', 'rework_ratio');
  return base;
}

function extract(trace: PredictionTrace, includeRework: boolean): Record<string, number> {
  const events = trace.events;
  const distinct = new Set<string>();
  const resources = new Set<string>();
  const counts: Record<string, number> = {};
  for (const e of events) {
    distinct.add(e.activity);
    if (e.resource) resources.add(e.resource);
    counts[e.activity] = (counts[e.activity] ?? 0) + 1;
  }
  let maxGap = 0;
  let totalGap = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - events[i - 1].timestamp;
    totalGap += gap;
    if (gap > maxGap) maxGap = gap;
  }
  const elapsed = events.length >= 2 ? events[events.length - 1].timestamp - events[0].timestamp : 0;
  const meanGap = events.length >= 2 ? totalGap / (events.length - 1) : 0;
  const result: Record<string, number> = {
    prefix_length: events.length,
    distinct_activities: distinct.size,
    elapsed_ms: elapsed,
    mean_interevent_ms: meanGap,
    max_interevent_ms: maxGap,
    distinct_resources: resources.size,
  };
  if (includeRework) {
    let rework = 0;
    for (const c of Object.values(counts)) if (c > 1) rework += c - 1;
    result.rework_count = rework;
    result.rework_ratio = events.length > 0 ? rework / events.length : 0;
  }
  return result;
}

export class FeaturesHandler implements PerspectiveHandler<FeaturesTask> {
  readonly perspective = 'features' as const;

  fit(task: FeaturesTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const includeRework = task.includeRework ?? true;
    const state: FeaturesState = { schema: buildSchema(includeRework), includeRework };
    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`ft|${state.schema.join(',')}`),
    };
  }

  predict(
    task: FeaturesTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[],
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as FeaturesState;
    return prefixes.map((prefix) => {
      const events = clipTrace(prefix, task.maxPrefixLength);
      const features = extract(events, state.includeRework);
      return {
        caseId: prefix.caseId,
        prefixLength: events.events.length,
        prediction: { features, schema: state.schema },
      };
    });
  }
}
