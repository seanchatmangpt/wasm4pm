/**
 * Uniform log loader — content-sniffs (via the conformance engine's
 * `detectFormat`) and loads XES / CSV / any OCEL dialect into a WASM handle
 * through the correct existing loader, normalizing OCEL v1 to v2 JSON first
 * so there is exactly one OCEL load path (`load_ocel_from_json`) regardless
 * of source dialect. Used by `wpm model discover` so OCEL algorithm
 * dispatch can go through `engines/algorithms.ts` -> `Kernel.runRaw()`
 * uniformly instead of a format-specific bypass (defect #1).
 */
import { detectFormat, isOcelFormat, type LogFormat } from './conformance/readers/detect.js';
import { parseOcelV1Json, ocelV1ToV2Json } from './conformance/readers/ocel-v1.js';

export interface LoadLogWasmModule {
  load_eventlog_from_xes(content: string): string;
  load_eventlog_from_csv(content: string, activityKey: string, caseIdKey: string, timestampKey: string): string;
  load_ocel_from_json?(content: string): string;
  load_ocel2_from_ndjson?(content: string): string;
}

export interface LoadLogOptions {
  activityKey?: string;
  caseIdKey?: string;
  timestampKey?: string;
  /** Force a format instead of sniffing `content`. */
  format?: LogFormat;
}

export interface LoadedLog {
  readonly handle: string;
  readonly format: LogFormat;
  readonly isObjectCentric: boolean;
}

export function loadLog(wasm: LoadLogWasmModule, content: string, options: LoadLogOptions = {}): LoadedLog {
  const format = options.format ?? detectFormat(content);
  const activityKey = options.activityKey ?? 'concept:name';

  switch (format) {
    case 'xes':
      return { handle: wasm.load_eventlog_from_xes(content), format, isObjectCentric: false };

    case 'csv':
      return {
        handle: wasm.load_eventlog_from_csv(
          content,
          activityKey,
          options.caseIdKey ?? 'case:concept:name',
          options.timestampKey ?? 'time:timestamp'
        ),
        format,
        isObjectCentric: false,
      };

    case 'ocel-v2': {
      if (!wasm.load_ocel_from_json) {
        throw new Error('OCEL support is not available in this WASM build (requires feature-ocel)');
      }
      return { handle: wasm.load_ocel_from_json(content), format, isObjectCentric: true };
    }

    case 'ocel-v1': {
      if (!wasm.load_ocel_from_json) {
        throw new Error('OCEL support is not available in this WASM build (requires feature-ocel)');
      }
      const v2Json = ocelV1ToV2Json(parseOcelV1Json(content));
      return { handle: wasm.load_ocel_from_json(v2Json), format, isObjectCentric: true };
    }

    case 'ocel-ndjson': {
      if (!wasm.load_ocel2_from_ndjson) {
        throw new Error('OCEL NDJSON support is not available in this WASM build (requires feature-ocel)');
      }
      return { handle: wasm.load_ocel2_from_ndjson(content), format, isObjectCentric: true };
    }

    default: {
      const exhaustive: never = format;
      throw new Error(`Unhandled log format: ${String(exhaustive)}`);
    }
  }
}

export { isOcelFormat };
export type { LogFormat };
