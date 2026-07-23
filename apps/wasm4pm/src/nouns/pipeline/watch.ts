/**
 * wpm pipeline watch — bridged to `commands/watch.ts` (631 lines of
 * chokidar-based file-watch + re-run loop; not re-derived in this pass).
 * Note: this is a long-running/streaming command — the bridge captures
 * its JSONL event stream as accumulated stdout text and returns it once
 * the process is interrupted, rather than truly streaming through the new
 * framework's output layer. See the migration report.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { watch } from '../../commands/watch.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const watchVerb = defineVerb({
  noun: 'pipeline',
  verb: 'watch',
  summary: 'Watch a log file and re-run discovery on change (was: wpm watch)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(watch, [...ctx.rawArgs]),
});
