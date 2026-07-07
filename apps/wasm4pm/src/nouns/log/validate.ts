/**
 * wpm log validate — bridged to the existing `commands/validate.ts` body
 * (1641 lines of schema/data-quality validation; not re-derived in this
 * pass — see the migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { validate } from '../../commands/validate.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const validateVerb = defineVerb({
  noun: 'log',
  verb: 'validate',
  summary: 'Validate event log schema, required attributes, and data quality (was: wpm validate)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(validate, [...ctx.rawArgs]),
});
