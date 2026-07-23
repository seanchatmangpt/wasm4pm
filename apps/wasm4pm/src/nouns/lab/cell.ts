/**
 * wpm lab cell — experimental forwarding shim over `commands/cell.ts`
 * (584 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { cell } from '../../commands/cell.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const cellVerb = defineVerb({
  noun: 'lab',
  verb: 'cell',
  summary: 'Cell/actor lifecycle experiments (was: wpm cell)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(cell, [...ctx.rawArgs]),
});
