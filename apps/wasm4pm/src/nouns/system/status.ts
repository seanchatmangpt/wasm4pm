/**
 * wpm system status — bridged to `commands/status.ts` (617 lines of WASM
 * module status / memory usage reporting; not re-derived in this pass).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { status } from '../../commands/status.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const statusVerb = defineVerb({
  noun: 'system',
  verb: 'status',
  summary: 'Show WASM module status and memory usage (was: wpm status)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(status, [...ctx.rawArgs]),
});
