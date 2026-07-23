/**
 * wpm model compare — bridged to the existing `commands/compare.ts` body
 * (1129 lines of side-by-side algorithm comparison/sparkline rendering;
 * not re-derived in this pass — see the migration report). The framework
 * still owns output: the legacy command's own `--format json` path is
 * invoked and its result parsed back into a plain object.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { compare } from '../../commands/compare.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const compareVerb = defineVerb({
  noun: 'model',
  verb: 'compare',
  summary: 'Compare discovery algorithms side-by-side (was: wpm compare)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(compare, [...ctx.rawArgs]),
});
