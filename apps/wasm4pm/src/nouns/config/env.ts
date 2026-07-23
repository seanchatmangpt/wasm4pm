/**
 * wpm config env — bridged to `commands/config/env.ts` (281 lines listing
 * all WASM4PM_* env vars with SET/NOT SET status).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configEnv } from '../../commands/config/env.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const envVerb = defineVerb({
  noun: 'config',
  verb: 'env',
  summary: 'Show all WASM4PM_* env vars with SET/NOT SET status (was: wpm config env)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configEnv, [...ctx.rawArgs]),
});
