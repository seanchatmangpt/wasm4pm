/**
 * wpm system doctor — bridged to the executable doctor tree.
 *
 * Key phase-change surfaces:
 *   wpm system doctor capabilities [--only <capability>]
 *   wpm system doctor fix --dry-run
 *   wpm system doctor fix --only <intent> --yes
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { doctor } from '../../commands/doctor.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const doctorVerb = defineVerb({
  noun: 'system',
  verb: 'doctor',
  summary:
    'Diagnose the environment, audit Vision 2030 capability standing, and execute receipt-gated structured repairs',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(doctor, [...ctx.rawArgs]),
});
