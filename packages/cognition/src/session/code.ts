//! Thin TypeScript boundary for cognition-selected canonical code.

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

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ReplayPointerSchema = z.string().regex(/^[0-9a-f]{16}$/);
const AttestationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ed25519-self-signed'),
      signature: z.string().regex(/^[0-9a-f]{128}$/),
      public_key: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('blake3-only'),
      signature: z.null(),
      public_key: z.null(),
    })
    .strict(),
]);

export const CodeProjectionSchema = z
  .object({
    track_id: z.string().min(1),
    track_label: z.string().min(1),
    selection_status: z.enum(['committed', 'leading_hypothesis']),
    language: z.literal('python'),
    filename: z.string().regex(/^[a-z0-9_]+\.py$/),
    source: z.string().min(1),
    source_hash: HashSchema,
  })
  .strict();
export type CodeProjection = z.infer<typeof CodeProjectionSchema>;

const SuccessSchema = z
  .object({
    status: z.literal('ok'),
    run_id: HashSchema,
    input_hash: HashSchema,
    attested_hash: HashSchema,
    replay_pointer: ReplayPointerSchema,
    code: CodeProjectionSchema.nullable(),
    attestation: AttestationSchema,
  })
  .strict();

const RefusalSchema = z
  .object({
    status: z.literal('refused'),
    run_id: HashSchema,
    input_hash: HashSchema,
    refusal_hash: HashSchema,
    attested_hash: HashSchema,
    replay_pointer: ReplayPointerSchema,
    refusal: z.object({ code: SessionRefusalCodeSchema }).passthrough(),
    message: z.string().min(1),
    attestation: AttestationSchema,
  })
  .strict();

const BoundarySchema = z.discriminatedUnion('status', [SuccessSchema, RefusalSchema]);
export type CodeProjectionResult = z.infer<typeof SuccessSchema>;

/** Replay-verify state and return the canonical Python artifact selected by Rust/WASM. */
export async function projectSessionCode(
  domainPack: DomainPack,
  state: SessionState,
): Promise<CodeProjectionResult> {
  const admittedDomain = DomainPackSchema.safeParse(domainPack);
  const admittedState = SessionStateSchema.safeParse(state);
  if (!admittedDomain.success || !admittedState.success) {
    throw new CognitionError('Code projection input failed boundary validation.', 'SESSION_INPUT_INVALID', {
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
    raw = loader.get().cognition_session_code(
      JSON.stringify({ domain_pack: admittedDomain.data, state: admittedState.data }),
    );
  } catch (error) {
    throw new CognitionError('Code projection execution failed.', 'SESSION_EXECUTION_FAILED', {
      cause: error,
    });
  }

  let decoded: unknown = raw;
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new CognitionError('Code projection returned malformed JSON.', 'OUTPUT_PARSE_FAILED', {
        cause: error,
        details: { raw },
      });
    }
  }

  const parsed = BoundarySchema.safeParse(decoded);
  if (!parsed.success) {
    throw new CognitionError('Code projection returned an invalid boundary shape.', 'OUTPUT_SHAPE_INVALID', {
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
