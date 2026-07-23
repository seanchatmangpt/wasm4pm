/**
 * wpm evidence replay — bridged to `commands/prolog8.ts`'s `replay`
 * subcommand (verifies a receipt / detects tampering by replaying its
 * proof). Also absorbs `commands/cognition/replay.ts` conceptually (both
 * are "replay evidence to verify it"); only the prolog8 path is wired here
 * — see the migration report for the cognition-replay gap.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { prolog8 } from '../../commands/prolog8.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const replayVerb = defineVerb({
  noun: 'evidence',
  verb: 'replay',
  summary: 'Verify a receipt by replaying its proof, detecting tampering (was: wpm prolog8 replay)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(prolog8, ['replay', ...ctx.rawArgs]),
});
