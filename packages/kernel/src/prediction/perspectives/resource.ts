/**
 * Resource perspective.
 *
 * Recommends the next resource to assign for a given prefix using a UCB1
 * contextual-bandit style score over the historical (activity → resource →
 * outcome-quality) table.
 *
 * Reward proxy: 1 / (1 + service_time_ms / 60000). This rewards fast
 * completions and penalises slow ones without requiring an explicit label.
 *
 * Output `prediction` shape:
 *   {
 *     recommended: string | null,
 *     scores: Array<{ resource: string; score: number; pulls: number }>,
 *   }
 */

import {
  PredictionLog,
  PredictionModel,
  PredictionRecord,
  PredictionTrace,
  ResourceTask,
} from '../types.js';
import { PerspectiveHandler, clipTrace, fnv1a } from './handler.js';

interface ResourceArm {
  pulls: number;
  rewardSum: number;
}

interface ResourceState {
  /** activity → resource → arm. */
  byActivity: Record<string, Record<string, ResourceArm>>;
  totalPulls: number;
  ucbC: number;
}

function rewardFor(serviceMs: number): number {
  if (!Number.isFinite(serviceMs) || serviceMs < 0) return 0;
  return 1 / (1 + serviceMs / 60_000);
}

export class ResourceHandler implements PerspectiveHandler<ResourceTask> {
  readonly perspective = 'resource' as const;

  fit(task: ResourceTask, log: PredictionLog): PredictionModel {
    const start = Date.now();
    const ucbC = task.ucbC ?? Math.SQRT2;
    const byActivity: Record<string, Record<string, ResourceArm>> = {};
    let totalPulls = 0;

    for (const trace of log.traces) {
      const events = clipTrace(trace, task.maxPrefixLength).events;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (!ev.resource) continue;
        const serviceMs = i + 1 < events.length ? events[i + 1].timestamp - ev.timestamp : 0;
        if (byActivity[ev.activity] === undefined) byActivity[ev.activity] = {};
        const arms = byActivity[ev.activity];
        const arm = arms[ev.resource] ?? { pulls: 0, rewardSum: 0 };
        arm.pulls += 1;
        arm.rewardSum += rewardFor(serviceMs);
        arms[ev.resource] = arm;
        totalPulls += 1;
      }
    }

    const state: ResourceState = { byActivity, totalPulls, ucbC };
    return {
      perspective: this.perspective,
      state: state as unknown as Readonly<Record<string, unknown>>,
      trainedOn: log.traces.length,
      fitDurationMs: Date.now() - start,
      fingerprint: fnv1a(`rs|${Object.keys(byActivity).length}|${totalPulls}`),
    };
  }

  predict(
    task: ResourceTask,
    model: PredictionModel,
    prefixes: readonly PredictionTrace[],
  ): readonly PredictionRecord[] {
    const state = model.state as unknown as ResourceState;
    const ucbC = task.ucbC ?? state.ucbC;
    const out: PredictionRecord[] = [];

    for (const prefix of prefixes) {
      const events = clipTrace(prefix, task.maxPrefixLength).events;
      const last = events[events.length - 1];
      const arms = last ? state.byActivity[last.activity] ?? {} : {};
      const totalPullsForActivity = Object.values(arms).reduce((s, a) => s + a.pulls, 0) || 1;

      const scored = Object.entries(arms).map(([resource, arm]) => {
        const mean = arm.pulls > 0 ? arm.rewardSum / arm.pulls : 0;
        const explore = ucbC * Math.sqrt(Math.log(totalPullsForActivity + 1) / (arm.pulls + 1));
        return { resource, score: mean + explore, pulls: arm.pulls };
      });
      scored.sort((a, b) => b.score - a.score || (a.resource < b.resource ? -1 : 1));
      out.push({
        caseId: prefix.caseId,
        prefixLength: events.length,
        prediction: {
          recommended: scored[0]?.resource ?? null,
          scores: scored,
        },
        confidence: scored[0]?.score,
      });
    }

    return out;
  }
}
