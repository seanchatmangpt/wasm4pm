/**
 * wpm system cache — bridged to `commands/cache.ts` (534 lines managing
 * the discovery cache; not re-derived in this pass).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import cache from '../../commands/cache.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const cacheVerb = defineVerb({
  noun: 'system',
  verb: 'cache',
  summary: 'Show discovery cache stats, or clear cache entries (was: wpm cache)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(cache, [...ctx.rawArgs]),
});
