/**
 * Unified reader entrypoint — content-sniffs `content` (see `detect.ts`) and
 * dispatches to the matching dialect-specific reader, always returning the
 * same `EpisodeSet` shape. This is the single place `wpm model check` and
 * `wpm lab oracle` (legacy) should read logs through so both OCEL dialects
 * normalize identically (defect #2) and format detection never depends on
 * file extension (defect #4).
 */
import type { EpisodeSet } from '../types.js';
import { detectFormat, isOcelFormat, type LogFormat } from './detect.js';
import { parseOcelV2Json, ocelV2ToEpisodeSet } from './ocel-v2.js';
import { parseOcelV1Json, ocelV1ToEpisodeSet } from './ocel-v1.js';
import { parseOcelNdjson, ocelNdjsonToEpisodeSet } from './ocel-ndjson.js';
import { xesToEpisodeSet, type XesWasmModule } from './xes.js';
import { csvToEpisodeSet, type CsvWasmModule, type CsvColumnKeys } from './csv.js';

export type { LogFormat } from './detect.js';
export { detectFormat, isOcelFormat, UnrecognizedFormatError } from './detect.js';
export type { EpisodeSet, Episode, EpisodeVerdict } from '../types.js';

export interface ReadOptions extends CsvColumnKeys {
  /** OCEL grouping object type (default 'episode'). Ignored for xes/csv. */
  groupByObjectType?: string;
  /** Force a format instead of sniffing `content`. */
  format?: LogFormat;
}

export interface ConformanceWasmModule extends XesWasmModule, CsvWasmModule {}

/**
 * Read `content` into a dialect-erased `EpisodeSet`. `wasm` is only required
 * for the 'xes'/'csv' branches (OCEL parsing is pure TypeScript).
 */
export function readToEpisodeSet(
  content: string,
  wasm: ConformanceWasmModule | undefined,
  options: ReadOptions = {}
): EpisodeSet {
  const format = options.format ?? detectFormat(content);

  switch (format) {
    case 'ocel-v2':
      return ocelV2ToEpisodeSet(parseOcelV2Json(content), { groupByObjectType: options.groupByObjectType });
    case 'ocel-v1':
      return ocelV1ToEpisodeSet(parseOcelV1Json(content), { groupByObjectType: options.groupByObjectType });
    case 'ocel-ndjson':
      return ocelNdjsonToEpisodeSet(parseOcelNdjson(content), { groupByObjectType: options.groupByObjectType });
    case 'xes':
      if (!wasm) throw new Error('XES reading requires a live WASM module');
      return xesToEpisodeSet(wasm, content);
    case 'csv':
      if (!wasm) throw new Error('CSV reading requires a live WASM module');
      return csvToEpisodeSet(wasm, content, options);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unhandled log format: ${String(exhaustive)}`);
    }
  }
}

export { isOcelFormat as formatIsOcel };
export function formatIsObjectCentric(format: LogFormat): boolean {
  return isOcelFormat(format);
}
