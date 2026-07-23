//! Thin TypeScript boundary for the Rust/WASM cognition-session kernel.

import { CognitionError } from '../errors.js';
import { WasmLoader } from '../init.js';
import type { SpanSink } from '../observability-types.js';
import { defaultSpanSink, hexId } from '../span-utils.js';
import {
  SessionBoundaryResultSchema,
  SessionTurnInputSchema,
  type SessionSuccessResult,
  type SessionTurnInput,
} from './schemas.js';

export interface SessionTurnOptions {
  spanSink?: SpanSink;
}

/** Execute one admitted session turn through the Rust/WASM kernel. */
export async function runSessionTurn(
  input: SessionTurnInput,
  options: SessionTurnOptions = {},
): Promise<SessionSuccessResult> {
  const started = Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let runId: string | undefined;
  let errorMessage: string | undefined;
  let domainId = 'unknown';
  let turnNumber = 1;

  try {
    const admitted = SessionTurnInputSchema.safeParse(input);
    if (!admitted.success) {
      throw new CognitionError('Session input failed boundary validation.', 'SESSION_INPUT_INVALID', {
        cause: admitted.error,
        details: { issues: admitted.error.issues },
      });
    }
    domainId = admitted.data.domain_pack.id;
    turnNumber = (admitted.data.previous_state?.turn ?? 0) + 1;

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get();

    let raw: unknown;
    try {
      raw = wasm.cognition_session_turn(JSON.stringify(admitted.data));
    } catch (error) {
      throw new CognitionError('Session WASM execution failed.', 'SESSION_EXECUTION_FAILED', {
        cause: error,
      });
    }

    let decoded: unknown = raw;
    if (typeof raw === 'string') {
      try {
        decoded = JSON.parse(raw) as unknown;
      } catch (error) {
        throw new CognitionError('Session WASM returned malformed JSON.', 'OUTPUT_PARSE_FAILED', {
          cause: error,
          details: { raw },
        });
      }
    }

    const parsed = SessionBoundaryResultSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new CognitionError('Session WASM returned an invalid boundary shape.', 'OUTPUT_SHAPE_INVALID', {
        cause: parsed.error,
        details: { issues: parsed.error.issues },
      });
    }

    const result = parsed.data;
    runId = result.run_id;
    if (result.status === 'refused') {
      throw new CognitionError(result.message, 'SESSION_REFUSED', {
        details: {
          refusal_code: result.refusal.code,
          refusal: result.refusal,
          run_id: result.run_id,
          input_hash: result.input_hash,
          refusal_hash: result.refusal_hash,
          attested_hash: result.attested_hash,
          replay_pointer: result.replay_pointer,
          attestation: result.attestation,
        },
      });
    }
    return result;
  } catch (error) {
    status = 'ERROR';
    errorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof CognitionError) throw error;
    throw new CognitionError(errorMessage, 'SESSION_EXECUTION_FAILED', { cause: error });
  } finally {
    const sink = options.spanSink ?? defaultSpanSink;
    try {
      sink({
        trace_id: hexId(32),
        span_id: hexId(16),
        name: 'cognition.session.turn',
        kind: 'INTERNAL',
        start_time: started * 1_000_000,
        end_time: Date.now() * 1_000_000,
        status: { code: status, message: errorMessage },
        attributes: {
          'service.name': 'wasm4pm',
          'cognition.operation': 'session_turn',
          'cognition.domain_pack': domainId,
          'cognition.turn': turnNumber,
          ...(runId ? { 'cognition.run_id': runId } : {}),
        },
      });
    } catch {
      // Observability must not alter cognition semantics.
    }
  }
}
