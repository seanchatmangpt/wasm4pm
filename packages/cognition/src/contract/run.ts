//! ZERO decision logic — only WASM forwarding + OTEL span emission.

import { WasmLoader } from '../init.js';
import { CognitionError } from '../errors.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import type { BreedInput, ContractResult } from '../types.js';

export interface RunOptions {
  spanSink?: SpanSink;
  /** Optional profile string forwarded to Rust `ValidatedRunOptions.profile`. */
  profile?: string;
}

export async function runContract(
  breed: string,
  input: BreedInput,
  options: RunOptions = {},
): Promise<ContractResult> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();

  const startNs = Date.now() * 1_000_000;
  const startMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let errMsg: string | undefined;
  // Captured after successful parse so the finally block can include
  // 'cognition.run_id' in the span — critical for Jaeger traceability.
  let capturedRunId: string | undefined;

  try {
    let inputJson: string;
    try {
      // Rust expects `{ breed, contract, options? }` with `deny_unknown_fields`.
      // Sending a bare `BreedInput` here is rejected with "missing field 'breed'".
      const wrapped: {
        breed: string;
        contract: BreedInput;
        options?: { profile?: string };
      } = { breed, contract: input };
      if (options.profile !== undefined) {
        wrapped.options = { profile: options.profile };
      }
      inputJson = JSON.stringify(wrapped);
    } catch (e) {
      throw new CognitionError(
        'Failed to serialize BreedInput',
        'INPUT_SERIALIZE_FAILED',
        { cause: e },
      );
    }

    const raw = wasm.cognition_run(inputJson);

    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      throw new CognitionError(
        'Failed to parse cognition_run output',
        'OUTPUT_PARSE_FAILED',
        { cause: e },
      );
    }
    // Capture run_id before returning so the finally span can carry it.
    const result = parsed as ContractResult;
    capturedRunId = result.run_id;
    return result;
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
        name: 'cognition.run',
        kind: 'INTERNAL',
        start_time: startNs,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errMsg },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'run',
          'cognition.duration_ms': endMs - startMs,
          // Breed name is always known at call site; run_id is captured after
          // successful WASM parse (undefined on error — still informative).
          'cognition.breed': breed,
          ...(capturedRunId !== undefined
            ? { 'cognition.run_id': capturedRunId }
            : {}),
        },
      });
    } catch {
      /* never block on OTEL */
    }
  }
}
