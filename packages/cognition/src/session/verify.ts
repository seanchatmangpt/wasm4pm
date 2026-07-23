//! Non-mutating TypeScript boundary for persisted cognition-session verification.

import { z } from 'zod';
import { CognitionError } from '../errors.js';
import { WasmLoader } from '../init.js';
import {
  DomainPackSchema,
  SessionRefusalCodeSchema,
  SessionStateSchema,
  type DomainPack,
  type SessionState,
} from './schemas.js';

const AttestationSchema = z
  .object({
    kind: z.enum(['ed25519-self-signed', 'blake3-only']),
    signature: z.string().nullable(),
    public_key: z.string().nullable(),
  })
  .strict();

const VerifiedSchema = z
  .object({
    status: z.literal('verified'),
    run_id: z.string().min(1),
    input_hash: z.string().length(64),
    state_hash: z.string().length(64),
    domain_pack_hash: z.string().length(64),
    attested_hash: z.string().length(64),
    replay_pointer: z.string().min(1),
    attestation: AttestationSchema,
  })
  .strict();

const RefusedSchema = z
  .object({
    status: z.literal('refused'),
    run_id: z.string().min(1),
    input_hash: z.string().length(64),
    refusal_hash: z.string().length(64),
    attested_hash: z.string().length(64),
    replay_pointer: z.string().min(1),
    refusal: z
      .object({
        code: SessionRefusalCodeSchema,
      })
      .passthrough(),
    message: z.string().min(1),
    attestation: AttestationSchema,
  })
  .strict();

const VerificationBoundarySchema = z.discriminatedUnion('status', [VerifiedSchema, RefusedSchema]);

export type SessionVerificationResult = z.infer<typeof VerifiedSchema>;

/** Replay-verify persisted state through Rust/WASM without admitting a new turn. */
export async function verifySessionState(
  domainPack: DomainPack,
  state: SessionState,
): Promise<SessionVerificationResult> {
  const admittedDomain = DomainPackSchema.safeParse(domainPack);
  const admittedState = SessionStateSchema.safeParse(state);
  if (!admittedDomain.success || !admittedState.success) {
    throw new CognitionError('Session verification input failed boundary validation.', 'SESSION_INPUT_INVALID', {
      details: {
        domain_issues: admittedDomain.success ? [] : admittedDomain.error.issues,
        state_issues: admittedState.success ? [] : admittedState.error.issues,
      },
    });
  }

  const loader = WasmLoader.getInstance();
  await loader.init();
  let raw: unknown;
  try {
    raw = loader.get().cognition_session_verify(
      JSON.stringify({ domain_pack: admittedDomain.data, state: admittedState.data }),
    );
  } catch (error) {
    throw new CognitionError('Session state verification execution failed.', 'SESSION_EXECUTION_FAILED', {
      cause: error,
    });
  }

  let decoded: unknown = raw;
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new CognitionError('Session verifier returned malformed JSON.', 'OUTPUT_PARSE_FAILED', {
        cause: error,
        details: { raw },
      });
    }
  }

  const parsed = VerificationBoundarySchema.safeParse(decoded);
  if (!parsed.success) {
    throw new CognitionError('Session verifier returned an invalid boundary shape.', 'OUTPUT_SHAPE_INVALID', {
      cause: parsed.error,
      details: { issues: parsed.error.issues },
    });
  }
  if (parsed.data.status === 'refused') {
    throw new CognitionError(parsed.data.message, 'SESSION_REFUSED', {
      details: {
        refusal_code: parsed.data.refusal.code,
        refusal: parsed.data.refusal,
        run_id: parsed.data.run_id,
        input_hash: parsed.data.input_hash,
        refusal_hash: parsed.data.refusal_hash,
        attested_hash: parsed.data.attested_hash,
        replay_pointer: parsed.data.replay_pointer,
        attestation: parsed.data.attestation,
      },
    });
  }
  return parsed.data;
}
