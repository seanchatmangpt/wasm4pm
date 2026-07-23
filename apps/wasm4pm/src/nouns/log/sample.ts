/**
 * wpm log sample — take a sample of N traces from an XES/CSV log.
 * New, small implementation over the existing `get_traces` WASM export
 * (reused, not reimplemented).
 */
import * as fs from 'node:fs/promises';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { detectFormat, isOcelFormat } from '../../engines/conformance/readers/detect.js';
import { loadLog } from '../../engines/load-log.js';

interface SampleWasm {
  get_traces(handle: string, activityKey: string): unknown;
  delete_object?(handle: string): void;
}

export const sampleVerb = defineVerb({
  noun: 'log',
  verb: 'sample',
  summary: 'Sample N traces from an XES/CSV log',
  args: {
    input: { type: 'positional', description: 'Path to the event log', required: true },
    count: { type: 'string', description: 'Number of traces to sample (default: 10)', alias: 'n' },
    strategy: { type: 'string', description: 'first | random (default: first)' },
    'activity-key': { type: 'string', description: 'Event attribute key for activity names (default: concept:name)' },
  } as const,
  handler: async (args) => {
    const inputPath = args.input as string;
    const count = args.count ? Number(args.count) : 10;
    if (!Number.isFinite(count) || count <= 0) {
      throw NounVerbError.invalidInput(`--count must be a positive number, got '${args.count}'`);
    }
    const strategy = (args.strategy as string | undefined) ?? 'first';
    if (strategy !== 'first' && strategy !== 'random') {
      throw NounVerbError.invalidInput(`--strategy must be 'first' or 'random', got '${strategy}'`);
    }

    let content: string;
    try {
      content = await fs.readFile(inputPath, 'utf-8');
    } catch (e) {
      throw NounVerbError.invalidInput(`Input file not found or unreadable: ${inputPath}`, {
        cause: e instanceof Error ? e.message : String(e),
      });
    }

    const format = detectFormat(content);
    if (isOcelFormat(format)) {
      throw NounVerbError.invalidInput('log sample supports XES/CSV logs only (OCEL episode sampling is not yet supported)');
    }

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as unknown as SampleWasm;
    const activityKey = (args['activity-key'] as string | undefined) ?? 'concept:name';
    const loaded = loadLog(wasm as never, content, { format, activityKey });

    try {
      const raw = wasm.get_traces(loaded.handle, activityKey);
      const traces: string[][] = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[][]);

      let sampled: string[][];
      if (strategy === 'first') {
        sampled = traces.slice(0, count);
      } else {
        const pool = [...traces];
        sampled = [];
        for (let i = 0; i < Math.min(count, pool.length); i++) {
          const idx = Math.floor(Math.random() * pool.length);
          sampled.push(pool.splice(idx, 1)[0]);
        }
      }

      return {
        format,
        totalTraces: traces.length,
        sampledCount: sampled.length,
        strategy,
        traces: sampled.map((activities, i) => ({ id: `trace-${i}`, activities })),
      };
    } finally {
      try {
        wasm.delete_object?.(loaded.handle);
      } catch {
        /* best-effort cleanup */
      }
    }
  },
});
