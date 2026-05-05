/**
 * Next-activity perspective.
 *
 * Implements an n-gram language model over the activity stream. Given a
 * prefix `(a_{t-n+1}, ..., a_t)` the model returns the top-K candidates for
 * `a_{t+1}` ranked by Laplace-smoothed conditional probability.
 *
 * Output `prediction` shape:
 *   {
 *     candidates: Array<{ activity: string; probability: number }>,
 *     // most likely candidate hoisted for convenience
 *     top: { activity: string; probability: number } | null,
 *   }
 */

import {
  NextActivityTask,
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface NgramState {
  ngramOrder: number;
  /** Map context (joined by '') → activity → count. */
  counts: Record<string, Record<string, number>>;
  /** Activity universe (for Laplace smoothing denominator). */
  vocab: string[];
  topK: number;
}

const SEP = '';
const START = '__START__';

function contextKey(events: readonly { activity: string }[], order: number): string {
  const tail = events.slice(-order).map((e) => e.activity);
  while (tail.length < order) tail.unshift(START);
  return tail.join(SEP);
}

export class NextActivityHandler implements PerspectiveHandler<NextActivityTask> {
  readonly perspective = 'next_activity' as const;

  fit(task: NextActivityTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const order = task.ngramOrder ?? 2;
    const topK = task.topK ?? 3;
    const counts: Record<string, Record<string, number>> = {};
    const vocab = new Set<string>(log.activities ?? []);

    for (const trace of log.traces) {
      const events = clipTrace(trace, task.maxPrefixLength).events;
      for (const ev of events) vocab.add(ev.activity);
      for (let i = 0; i < events.length; i++) {
        const ctx = contextKey(events.slice(0, i), order);
        const next = events[i].activity;
        if (counts[ctx] === undefined) counts[ctx] = {};
        counts[ctx][next] = (counts[ctx][next] ?? 0) + 1;
      }
    }

    const state: NgramState = {
      ngramOrder: order,
      counts,
      vocab: Array.from(vocab).sort(),
      topK,
    };

    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`na|${order}|${topK}|${state.vocab.length}|${log.traces.length}`),
    };
  }

  predict(
    task: NextActivityTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[],
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as NgramState;
    const order = state.ngramOrder;
    const topK = task.topK ?? state.topK;
    const vocabSize = state.vocab.length || 1;
    const out: PredictionRecord[] = [];

    for (const prefix of prefixes) {
      const events = clipTrace(prefix, task.maxPrefixLength).events;
      const ctx = contextKey(events, order);
      const ctxCounts = state.counts[ctx] ?? {};
      const totalCount = Object.values(ctxCounts).reduce((a, b) => a + b, 0);
      // Laplace smoothing with α=1.
      const denom = totalCount + vocabSize;

      const scored = state.vocab.map((activity) => {
        const c = ctxCounts[activity] ?? 0;
        return { activity, probability: (c + 1) / denom };
      });
      scored.sort(
        (a, b) =>
          b.probability - a.probability ||
          (a.activity < b.activity ? -1 : a.activity > b.activity ? 1 : 0),
      );
      const candidates = scored.slice(0, topK);
      out.push({
        caseId: prefix.caseId,
        prefixLength: events.length,
        prediction: { candidates, top: candidates[0] ?? null },
        confidence: candidates[0]?.probability,
      });
    }

    return out;
  }
}
