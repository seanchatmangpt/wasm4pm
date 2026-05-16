//! ZERO decision logic — verifies a ContractResult via WASM.

import { WasmLoader } from '../init.js';
import { CognitionError } from '../errors.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import type { ContractResult, VerifyResult } from '../types.js';
import { assertVerifyResult } from './guard.js';

export interface VerifyOptions {
  spanSink?: SpanSink;
}

export async function verifyContract(
  result: ContractResult,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;

  try {
    let resultJson: string;
    try {
      resultJson = JSON.stringify(result);
    } catch (e) {
      throw new CognitionError(
        'Failed to serialize ContractResult',
        'INPUT_SERIALIZE_FAILED',
        { cause: e },
      );
    }

    const raw = wasm.cognition_verify(resultJson);

    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse cognition_verify output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    // Field-contract guard — refuses phantom 'rejected' status.
    return assertVerifyResult(parsed);
  } catch (err) {
    status = 'ERROR';
    errMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof CognitionError) throw err;
    throw new CognitionError(errMsg, 'VERIFY_FAILED', { cause: err });
  } finally {
    try {
      const sink = options.spanSink ?? defaultSpanSink;
      const endMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'cognition.verify',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'verify',
          'cognition.duration_ms': endMs - startMs,
        },
      });
    } catch {
      /* never block on OTEL */
    }
  }
}
