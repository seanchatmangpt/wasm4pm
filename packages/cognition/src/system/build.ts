//! ZERO decision logic — proposes architectures via WASM `system_build`.

import { WasmLoader } from '../init.js';
import { CognitionError } from '../errors.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import type { SystemBuildResult, SystemIntent } from '../types.js';
import { assertSystemBuildResult } from '../contract/guard.js';

export interface SystemBuildOptions {
  spanSink?: SpanSink;
}

export async function buildSystem(
  intent: SystemIntent,
  options: SystemBuildOptions = {},
): Promise<SystemBuildResult> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  try {
    let intentJson: string;
    try {
      intentJson = JSON.stringify(intent);
    } catch (e) {
      throw new CognitionError(
        'Failed to serialize SystemIntent',
        'INPUT_SERIALIZE_FAILED',
        { cause: e },
      );
    }

    const raw = wasm.system_build(intentJson);

    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse system_build output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    // Refuses legacy `candidates` shape per wasm.rs:287-290.
    return assertSystemBuildResult(parsed);
  } catch (err) {
    status = 'ERROR';
    errMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof CognitionError) throw err;
    throw new CognitionError(errMsg, 'SYSTEM_BUILD_FAILED', { cause: err });
  } finally {
    try {
      const sink = options.spanSink ?? defaultSpanSink;
      const endMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'system.build',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'system_build',
          'cognition.duration_ms': endMs - startMs,
        },
      });
    } catch {
      /* never block on OTEL */
    }
  }
}
