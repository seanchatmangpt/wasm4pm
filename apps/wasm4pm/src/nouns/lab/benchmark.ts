/**
 * wpm lab benchmark — experimental forwarding shim over
 * `commands/benchmark.ts` (1547 lines; build/replay/verify/export
 * subcommands; unchanged behavior). Also absorbs the retired
 * `wpm bench-data` corpus listing/leaderboard runner.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { benchmark } from '../../commands/benchmark.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const benchmarkVerb = defineVerb({
  noun: 'lab',
  verb: 'benchmark',
  summary: 'Benchmark corpus tooling: build | replay | verify | export (was: wpm benchmark, wpm bench-data)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(benchmark, [...ctx.rawArgs]),
});
