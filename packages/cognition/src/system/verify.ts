//! ZERO decision logic — verifies a target system via WASM `system_verify`.

import { WasmLoader } from '../init';
import { CognitionError } from '../errors';
import type { SpanSink } from '../observability-types';
import { defaultSpanSink, hexId } from '../span-utils';
import type { SystemArtifact, SystemVerifyResult } from '../types';

export interface SystemVerifyOptions {
  spanSink?: SpanSink;
}

export async function verifySystem(
  target: string,
  artifacts: SystemArtifact[],
  options: SystemVerifyOptions = {},
): Promise<SystemVerifyResult> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  try {
    let artifactsJson: string;
    try {
      artifactsJson = JSON.stringify(artifacts);
    } catch (e) {
      throw new CognitionError(
        'Failed to serialize artifacts',
        'INPUT_SERIALIZE_FAILED',
        { cause: e },
      );
    }

    const raw = wasm.system_verify(target, artifactsJson);

    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse system_verify output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    return parsed as SystemVerifyResult;
  } catch (err) {
    status = 'ERROR';
    errMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof CognitionError) throw err;
    throw new CognitionError(errMsg, 'SYSTEM_VERIFY_FAILED', { cause: err, details: { target } });
  } finally {
    try {
      const sink = options.spanSink ?? defaultSpanSink;
      const endMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'system.verify',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'system_verify',
          'cognition.duration_ms': endMs - startMs,
        },
      });
    } catch {
      /* never block on OTEL */
    }
  }
}
