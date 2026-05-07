//! ZERO decision logic — returns the breed catalogue from WASM.

import { WasmLoader } from '../init';
import { CognitionError } from '../errors';
import type { SpanSink } from '../observability-types';
import { defaultSpanSink, hexId } from '../span-utils';
import type { ShowReport } from '../types';

export interface ShowOptions {
  spanSink?: SpanSink;
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
    return parsed as ShowReport;
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
    } catch {
      /* never block on OTEL */
    }
  }
}
