/**
 * wpm model explain — bridged to the existing `commands/explain.ts` body
 * (2454 lines of algorithm/metric explanations; not re-derived in this pass
 * — see the migration report). Also absorbs the old `wpm interpret` command
 * (metric interpretation).
 *
 * NOTE: `compare` is NOT unambiguous — `explain.ts` has its OWN `compare
 * <alg1> <alg2>` subcommand (algorithm-vs-algorithm), which collides with
 * `interpret.ts`'s `compare <metric> <v1> <v2>` (metric-vs-metric). Both
 * are real, live subcommands, so routing must disambiguate on the token
 * that follows `compare` rather than always forwarding to `interpret`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { explain } from '../../commands/explain.js';
import { interpret } from '../../commands/interpret.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

/** `commands/interpret.ts`'s METRIC_SPECS keys — a bare first positional
 * ("wpm explain fitness 0.9") unambiguously means single-metric interpretation. */
const METRIC_NAMES = new Set([
  'fitness',
  'precision',
  'generalization',
  'simplicity',
  'silhouette',
  'drift_score',
  'anomaly_rate',
]);

export const explainVerb = defineVerb({
  noun: 'model',
  verb: 'explain',
  summary: 'Plain-English explanation of an algorithm, metric, or result (was: wpm explain, wpm interpret)',
  handler: async (_args, ctx) => {
    const positionals = ctx.rawArgs.filter((a) => !a.startsWith('-'));
    const firstPositional = positionals[0]?.toLowerCase();

    // "report" has no analog in explain.ts — always interpret's own report mode.
    if (firstPositional === 'report') {
      return invokeLegacyCommandAsJson(interpret, [...ctx.rawArgs]);
    }

    // "compare" is ambiguous — see the module doc comment. Disambiguate on
    // the token immediately after "compare": a known metric name means
    // interpret's compare; anything else (an algorithm id) means explain's.
    if (firstPositional === 'compare') {
      const second = positionals[1]?.toLowerCase();
      if (second && METRIC_NAMES.has(second)) {
        return invokeLegacyCommandAsJson(interpret, [...ctx.rawArgs]);
      }
      return invokeLegacyCommandAsJson(explain, [...ctx.rawArgs]);
    }

    if (firstPositional && METRIC_NAMES.has(firstPositional)) {
      return invokeLegacyCommandAsJson(interpret, [...ctx.rawArgs]);
    }
    return invokeLegacyCommandAsJson(explain, [...ctx.rawArgs]);
  },
});
