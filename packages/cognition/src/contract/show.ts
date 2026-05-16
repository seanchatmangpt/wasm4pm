//! ZERO decision logic — returns the breed catalogue from WASM.

import { WasmLoader } from '../init.js';
import { CognitionError } from '../errors.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import type { BreedDescriptor, ShowReport } from '../types.js';

export interface ShowOptions {
  spanSink?: SpanSink;
}

function assertShowReport(raw: unknown): ShowReport {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const reject = (reason: string): never => {
    throw new CognitionError(
      `cognition_show: WASM output rejected by field-contract guard: ${reason}`,
      'OUTPUT_PARSE_FAILED',
    );
  };
  if (!isObj(raw)) reject(`expected object, got ${typeof raw}`);
  if (!Array.isArray(raw.breeds)) reject('breeds must be an array');
  const breeds = raw.breeds as unknown[];
  for (let i = 0; i < breeds.length; i++) {
    const b = breeds[i];
    if (!isObj(b)) reject(`breeds[${i}] must be an object`);
    if (typeof b.id !== 'string' || b.id.length === 0)
      reject(`breeds[${i}].id must be non-empty string`);
    if (typeof b.name !== 'string' || b.name.length === 0)
      reject(`breeds[${i}].name must be non-empty string`);
    if (typeof b.year !== 'number' || !Number.isFinite(b.year))
      reject(`breeds[${i}].year must be finite number`);
  }
  return { breeds: breeds as BreedDescriptor[] };
}

export async function showCognition(
  options: ShowOptions = {},
): Promise<ShowReport> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  try {
    const raw = wasm.cognition_show();
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse cognition_show output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    return assertShowReport(parsed);
  } catch (err) {
    status = 'ERROR';
    errMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof CognitionError) throw err;
    throw new CognitionError(errMsg, 'BREED_FAILED', { cause: err });
  } finally {
    try {
      const sink = options.spanSink ?? defaultSpanSink;
      const endMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'cognition.show',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'show',
          'cognition.duration_ms': endMs - startMs,
        },
      });
    } catch {}
  }
}
