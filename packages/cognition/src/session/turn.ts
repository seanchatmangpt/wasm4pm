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

export async function runSessionTurn(
  input: SessionTurnInput,
  options: SessionTurnOptions = {},
): Promise<SessionSuccessResult> {
  const admitted = SessionTurnInputSchema.parse(input);
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get();
  const started = Date.now();
  let status: 'OK' | 'ERROR' = 'OK';
  let runId: string | undefined;
  let errorMessage: string | undefined;

  try {
    const raw = wasm.cognition_session_turn(JSON.stringify(admitted));
    const decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const result = SessionBoundaryResultSchema.parse(decoded);
    runId = result.run_id;
    if (result.status === 'refused') {
      status = 'ERROR';
      errorMessage = result.message;
      throw new CognitionError(result.message, 'SESSION_REFUSED', {
        details: {
          refusal_code: result.refusal.code,
          run_id: result.run_id,
          refusal_hash: result.refusal_hash,
          replay_pointer: result.replay_pointer,
        },
      });
    }
    return result;
  } catch (error) {
    status = 'ERROR';
    errorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof CognitionError) throw error;
    throw new CognitionError(errorMessage, 'OUTPUT_SHAPE_INVALID', { cause: error });
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
          'cognition.domain_pack': input.domain_pack.id,
          'cognition.turn': (input.previous_state?.turn ?? 0) + 1,
          ...(runId ? { 'cognition.run_id': runId } : {}),
        },
      });
    } catch {
      // Observability must not alter cognition semantics.
    }
  }
}
