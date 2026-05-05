/**
 * Outcome perspective.
 *
 * Predicts a categorical end-of-case outcome from a partial prefix.
 *
 * Model: per-prefix-bigram → outcome → count table. At inference time the
 * most recent bigram of the prefix is used as the lookup key, falling back to
 * the most recent unigram and finally the global outcome distribution.
 *
 * Output `prediction` shape:
 *   {
 *     outcome: string | null,
 *     distribution: Record<string, number>,  // probability per outcome
 *   }
 */

import {
  OutcomeTask,
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface OutcomeState {
  /** key 'last|prev_last' → outcome → count */
  byBigram: Record<string, Record<string, number>>;
  /** key 'last' → outcome → count */
  byUnigram: Record<string, Record<string, number>>;
  /** outcome → count (global prior) */
  global: Record<string, number>;
  outcomes: string[];
}

function defaultLabeller(trace: PredictionTrace): string | undefined {
  const last = trace.events[trace.events.length - 1];
  return last?.activity;
}

function increment(map: Record<string, Record<string, number>>, key: string, label: string): void {
  if (map[key] === undefined) map[key] = {};
  map[key][label] = (map[key][label] ?? 0) + 1;
}

function distribution(counts: Record<string, number>, outcomes: string[]): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  if (total === 0) {
    const eq = outcomes.length > 0 ? 1 / outcomes.length : 0;
    for (const o of outcomes) out[o] = eq;
    return out;
  }
  for (const o of outcomes) out[o] = (counts[o] ?? 0) / total;
  return out;
}

export class OutcomeHandler implements PerspectiveHandler<OutcomeTask> {
  readonly perspective = 'outcome' as const;

  fit(task: OutcomeTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const labeller = task.labeller ?? defaultLabeller;
    const byBigram: Record<string, Record<string, number>> = {};
    const byUnigram: Record<string, Record<string, number>> = {};
    const global: Record<string, number> = {};
    const outcomes = new Set<string>(task.outcomes ?? []);

    for (const trace of log.traces) {
      const label = labeller(trace);
      if (label === undefined) continue;
      outcomes.add(label);
      const events = clipTrace(trace, task.maxPrefixLength).events;
      // We index by every prefix so the model can score short prefixes too.
      for (let i = 1; i <= events.length; i++) {
        const last = events[i - 1].activity;
        const prev = i >= 2 ? events[i - 2].activity : '';
        increment(byBigram, `${prev}|${last}`, label);
        increment(byUnigram, last, label);
      }
      global[label] = (global[label] ?? 0) + 1;
    }

    const state: OutcomeState = {
      byBigram,
      byUnigram,
      global,
      outcomes: Array.from(outcomes).sort(),
    };

    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`oc|${state.outcomes.length}|${log.traces.length}`),
    };
  }

  predict(
    task: OutcomeTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[]
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as OutcomeState;
    const out: PredictionRecord[] = [];

    for (const prefix of prefixes) {
      const events = clipTrace(prefix, task.maxPrefixLength).events;
      let counts: Record<string, number> = {};
      if (events.length >= 2) {
        const key = `${events[events.length - 2].activity}|${events[events.length - 1].activity}`;
        counts = state.byBigram[key] ?? {};
      }
      if (Object.keys(counts).length === 0 && events.length >= 1) {
        counts = state.byUnigram[events[events.length - 1].activity] ?? {};
      }
      if (Object.keys(counts).length === 0) counts = state.global;

      const dist = distribution(counts, state.outcomes);
      let bestLabel: string | null = null;
      let bestProb = -1;
      for (const [label, prob] of Object.entries(dist)) {
        if (prob > bestProb) {
          bestProb = prob;
          bestLabel = label;
        }
      }
      out.push({
        caseId: prefix.caseId,
        prefixLength: events.length,
        prediction: { outcome: bestLabel, distribution: dist },
        confidence: bestProb >= 0 ? bestProb : undefined,
      });
    }

    return out;
  }
}
