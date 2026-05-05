/**
 * Drift perspective.
 *
 * Detects concept drift by comparing the directly-follows-edge fingerprint of
 * a recent window of traces against an EWMA-smoothed reference fingerprint
 * built during fit. Jaccard similarity below `driftThreshold` flags drift.
 *
 * `predict` interprets each prefix as a streaming probe: the union of the
 * prefix's edges represents the "current" snapshot, compared against the
 * reference snapshot from training.
 *
 * Output `prediction` shape:
 *   {
 *     jaccard: number,           // similarity to reference (0..1)
 *     ewmaScore: number,         // smoothed similarity
 *     drift: boolean,            // jaccard < threshold
 *     novelEdges: string[],      // edges in prefix not in reference
 *   }
 */

import {
  DriftTask,
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface DriftState {
  referenceEdges: string[]; // sorted
  ewmaAlpha: number;
  driftThreshold: number;
  windowSize: number;
}

function edgesOfTrace(trace: PredictionTrace): Set<string> {
  const set = new Set<string>();
  const events = trace.events;
  for (let i = 1; i < events.length; i++) {
    set.add(`${events[i - 1].activity}>${events[i].activity}`);
  }
  return set;
}

function jaccard(a: ReadonlySet<string> | string[], b: ReadonlySet<string> | string[]): number {
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}

export class DriftHandler implements PerspectiveHandler<DriftTask> {
  readonly perspective = 'drift' as const;

  fit(task: DriftTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const referenceSet = new Set<string>();
    for (const trace of log.traces) {
      const clipped = clipTrace(trace, task.maxPrefixLength);
      for (const e of edgesOfTrace(clipped)) referenceSet.add(e);
    }
    const state: DriftState = {
      referenceEdges: Array.from(referenceSet).sort(),
      ewmaAlpha: task.ewmaAlpha ?? 0.3,
      driftThreshold: task.driftThreshold ?? 0.7,
      windowSize: task.windowSize ?? 50,
    };
    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`dr|${state.referenceEdges.length}|${state.driftThreshold}`),
    };
  }

  predict(
    task: DriftTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[]
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as DriftState;
    const reference = new Set(state.referenceEdges);
    const out: PredictionRecord[] = [];
    let ewma: number | null = null;

    for (const prefix of prefixes) {
      const events = clipTrace(prefix, task.maxPrefixLength);
      const edges = edgesOfTrace(events);
      const sim = jaccard(edges, reference);
      ewma = ewma === null ? sim : state.ewmaAlpha * sim + (1 - state.ewmaAlpha) * ewma;
      const novel: string[] = [];
      for (const e of edges) if (!reference.has(e)) novel.push(e);
      novel.sort();
      out.push({
        caseId: prefix.caseId,
        prefixLength: events.events.length,
        prediction: {
          jaccard: sim,
          ewmaScore: ewma,
          drift: ewma < state.driftThreshold,
          novelEdges: novel,
        },
        confidence: 1 - Math.abs(sim - state.driftThreshold),
      });
    }
    return out;
  }
}
