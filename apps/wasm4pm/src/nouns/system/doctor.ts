/**
 * wpm system doctor — bridged to the existing `commands/doctor/` tree
 * (index.ts + run.ts + render.ts + subcommands.ts + several thousand
 * lines of environment/pipeline/hook checks across checks-*.ts; not
 * re-derived in this pass — see the migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { doctor } from '../../commands/doctor.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const doctorVerb = defineVerb({
  noun: 'system',
  verb: 'doctor',
  summary: 'Diagnose environment, WASM, and config issues; JTBD hook verification (was: wpm doctor)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(doctor, [...ctx.rawArgs]),
});
