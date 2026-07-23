/**
 * wpm log stats — basic log statistics (event/case/activity counts).
 * New implementation wrapping the existing `analyze_event_statistics` /
 * `analyze_ocel_statistics` WASM exports directly (reused, not
 * reimplemented) rather than the old `quality`/`bench-data` commands,
 * neither of which was actually a log-statistics profiler.
 */
import * as fs from 'node:fs/promises';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { detectFormat, isOcelFormat } from '../../engines/conformance/readers/detect.js';
import { loadLog } from '../../engines/load-log.js';

interface StatsWasm {
  analyze_event_statistics?(handle: string): unknown;
  analyze_ocel_statistics?(handle: string): unknown;
  delete_object?(handle: string): void;
}

export const statsVerb = defineVerb({
  noun: 'log',
  verb: 'stats',
  summary: 'Show basic log statistics: event/case/activity counts (was: wpm quality, in part)',
  args: {
    input: { type: 'positional', description: 'Path to the event log or OCEL log', required: true },
    'activity-key': { type: 'string', description: 'Event attribute key for activity names (default: concept:name)' },
  } as const,
  handler: async (args) => {
    const inputPath = args.input as string;
    let content: string;
    try {
      content = await fs.readFile(inputPath, 'utf-8');
    } catch (e) {
      throw NounVerbError.invalidInput(`Input file not found or unreadable: ${inputPath}`, {
        cause: e instanceof Error ? e.message : String(e),
      });
    }

    const format = detectFormat(content);
    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as unknown as StatsWasm;

    const loaded = loadLog(wasm as never, content, { format, activityKey: args['activity-key'] });
    try {
      const statsFn = isOcelFormat(format) ? wasm.analyze_ocel_statistics : wasm.analyze_event_statistics;
      if (!statsFn) {
        throw NounVerbError.executionError(
          `WASM build has no ${isOcelFormat(format) ? 'analyze_ocel_statistics' : 'analyze_event_statistics'} export`
        );
      }
      const raw = statsFn(loaded.handle);
      const stats = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { format, isObjectCentric: loaded.isObjectCentric, stats };
    } finally {
      try {
        wasm.delete_object?.(loaded.handle);
      } catch {
        /* best-effort cleanup */
      }
    }
  },
});
