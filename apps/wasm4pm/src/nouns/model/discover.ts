/**
 * wpm model discover — process model discovery. Replaces `wpm run`.
 *
 * This is the defect-#1 fix: algorithm resolution and format compatibility
 * go through `engines/algorithms.ts` before any WASM call is made, and OCEL
 * inputs load through the same uniform `engines/load-log.ts` -> `Kernel`
 * dispatch as everything else — there is no more format-specific bypass
 * that silently substitutes a different algorithm than the one requested.
 */
import * as fs from 'node:fs/promises';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { discriminateWithSpan, DiscoveryShapeError } from '../../discriminator.js';
import { loadLog } from '../../engines/load-log.js';
import {
  resolveAlgorithm,
  assertFormatCompatible,
  discover as runDiscoverEngine,
  UnknownAlgorithmError,
  IncompatibleFormatError,
} from '../../engines/algorithms.js';

const DEFAULT_EVENT_LOG_ALGORITHM = 'heuristic_miner';
const DEFAULT_OCEL_ALGORITHM = 'ocel_dfg_per_type';

export interface DiscoverResult {
  algorithm: string;
  requestedAlgorithm: string;
  modelType: string;
  format: string;
  isObjectCentric: boolean;
  durationMs: number;
  shape: unknown;
  handle?: string;
}

async function readInput(inputPath: string): Promise<string> {
  try {
    return await fs.readFile(inputPath, 'utf-8');
  } catch (e) {
    throw NounVerbError.invalidInput(`Input file not found or unreadable: ${inputPath}`, {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

export const discoverVerb = defineVerb({
  noun: 'model',
  verb: 'discover',
  summary: 'Discover a process model from an event log or OCEL 2.0 log (was: wpm run)',
  args: {
    input: { type: 'positional', description: 'Path to the event log (XES, CSV, or OCEL JSON/NDJSON)', required: true },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm id or alias (run "wpm help algorithms" for the full list)',
      alias: 'a',
    },
    'activity-key': { type: 'string', description: 'Event attribute key for activity names (default: concept:name)' },
    'case-id-key': { type: 'string', description: 'CSV column holding the case id (default: case:concept:name)' },
    'timestamp-key': { type: 'string', description: 'CSV column holding the timestamp (default: time:timestamp)' },
  } as const,
  handler: async (args) => {
    const inputPath = args.input as string;
    const content = await readInput(inputPath);

    const loader = WasmLoader.getInstance();
    try {
      await loader.init();
    } catch (e) {
      throw NounVerbError.executionError(
        `WASM initialization failed: ${e instanceof Error ? e.message : String(e)}. Run "wpm system doctor" to diagnose.`
      );
    }
    const wasm = loader.get() as Record<string, unknown>;

    let loaded;
    try {
      loaded = loadLog(wasm as never, content, {
        activityKey: args['activity-key'],
        caseIdKey: args['case-id-key'],
        timestampKey: args['timestamp-key'],
      });
    } catch (e) {
      throw NounVerbError.invalidInput(e instanceof Error ? e.message : String(e));
    }

    const requestedAlgorithm =
      (args.algorithm as string | undefined) ??
      (loaded.isObjectCentric ? DEFAULT_OCEL_ALGORITHM : DEFAULT_EVENT_LOG_ALGORITHM);

    let descriptor;
    try {
      descriptor = resolveAlgorithm(requestedAlgorithm);
      assertFormatCompatible(descriptor, loaded.format);
    } catch (e) {
      if (e instanceof UnknownAlgorithmError || e instanceof IncompatibleFormatError) {
        throw NounVerbError.invalidInput(e.message);
      }
      throw e;
    }

    const activityKey = (args['activity-key'] as string | undefined) ?? 'concept:name';
    const { raw, elapsedMs } = await runDiscoverEngine(wasm, descriptor, loaded.handle, activityKey);

    let shape: unknown;
    try {
      shape = discriminateWithSpan(raw, descriptor.id);
    } catch (e) {
      if (e instanceof DiscoveryShapeError) {
        throw NounVerbError.internalError(e.message);
      }
      throw e;
    }

    const shapeObj = shape as { raw?: { handle?: string } };
    const result: DiscoverResult = {
      algorithm: descriptor.id,
      requestedAlgorithm,
      modelType: descriptor.modelType,
      format: loaded.format,
      isObjectCentric: loaded.isObjectCentric,
      durationMs: Math.round(elapsedMs),
      shape,
      handle: shapeObj.raw?.handle,
    };
    return result;
  },
  human: (result) =>
    `Discovered '${result.algorithm}' model (${result.modelType}) from ${result.format} input in ${result.durationMs}ms`,
});
