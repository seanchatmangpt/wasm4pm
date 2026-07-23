/**
 * wpm log convert — normalize any supported log format to JSON.
 *
 * Scope note: this converts INTO JSON (OCEL v1 -> OCEL v2 JSON via the
 * conformance engine's reader; XES/CSV -> a `{traces: [...]}` JSON
 * document via the existing `get_traces` WASM export). It does not (yet)
 * write XES or CSV as an output target — see the migration report.
 */
import * as fs from 'node:fs/promises';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { detectFormat, isOcelFormat } from '../../engines/conformance/readers/detect.js';
import { parseOcelV1Json, ocelV1ToV2Json } from '../../engines/conformance/readers/ocel-v1.js';
import { loadLog } from '../../engines/load-log.js';

interface ConvertWasm {
  get_traces(handle: string, activityKey: string): unknown;
  delete_object?(handle: string): void;
}

export const convertVerb = defineVerb({
  noun: 'log',
  verb: 'convert',
  summary: 'Normalize a log to JSON (OCEL v1 -> v2 JSON; XES/CSV -> {traces:[...]} JSON)',
  args: {
    input: { type: 'positional', description: 'Path to the event log', required: true },
    output: { type: 'string', description: 'Write JSON to this path instead of returning it inline', alias: 'o' },
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
    let outputJson: string;
    let convertedTo: string;

    if (format === 'ocel-v1') {
      outputJson = ocelV1ToV2Json(parseOcelV1Json(content));
      convertedTo = 'ocel-v2';
    } else if (format === 'ocel-v2') {
      outputJson = JSON.stringify(JSON.parse(content));
      convertedTo = 'ocel-v2';
    } else if (isOcelFormat(format)) {
      throw NounVerbError.invalidInput(`log convert does not yet support converting from '${format}'`);
    } else {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as unknown as ConvertWasm;
      const activityKey = (args['activity-key'] as string | undefined) ?? 'concept:name';
      const loaded = loadLog(wasm as never, content, { format, activityKey });
      try {
        const raw = wasm.get_traces(loaded.handle, activityKey);
        const traces: string[][] = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[][]);
        outputJson = JSON.stringify({ traces });
        convertedTo = 'traces-json';
      } finally {
        try {
          wasm.delete_object?.(loaded.handle);
        } catch {
          /* best-effort cleanup */
        }
      }
    }

    if (args.output) {
      await fs.writeFile(args.output as string, outputJson, 'utf-8');
      return { sourceFormat: format, convertedTo, outputPath: args.output };
    }
    return { sourceFormat: format, convertedTo, json: JSON.parse(outputJson) };
  },
});
