/**
 * wpm system models — bridged to `commands/models.ts` (709 lines managing
 * the warm-start model cache; not re-derived in this pass).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import models from '../../commands/models.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const modelsVerb = defineVerb({
  noun: 'system',
  verb: 'models',
  summary: 'List, clear, or inspect cached process models (was: wpm models)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(models, [...ctx.rawArgs]),
});
