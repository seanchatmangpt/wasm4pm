import { afterEach, describe, expect, it } from 'vitest';
import domainPackJson from '../../../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';
import { WasmLoader, type CognitionWasmModule } from '../init.js';
import { DomainPackSchema, type SessionState } from './schemas.js';
import { verifySessionState } from './verify.js';

const HASH = 'a'.repeat(64);
const POINTER = 'b'.repeat(16);
const domainPack = DomainPackSchema.parse(domainPackJson);

const observation = {
  id: 'observation-1',
  source: 'test',
  text: 'x and y',
  retract_evidence_ids: [],
};

const state: SessionState = {
  schema_version: '2',
  turn: 1,
  domain_pack_hash: HASH,
  previous_state_hash: null,
  turns: [{ observation, confirmation: null }],
  observations: [observation],
  evidence: [],
  rejected_tracks: [],
  hypotheses: [],
  committed_track: null,
  phase: 'track_identification',
  covered_concepts: [],
  missing_concepts: [],
  pending_confirmation: null,
  state_hash: HASH,
};

function moduleWithVerification(result: unknown): CognitionWasmModule {
  return {
    cognition_show: () => '{}',
    cognition_run: () => '{}',
    cognition_session_turn: () => '{}',
    cognition_session_verify: () => result,
    cognition_session_code: () => '{}',
    cognition_verify: () => '{}',
    cognition_replay: () => '{}',
    system_build: () => '{}',
    system_verify: () => '{}',
  };
}

afterEach(() => WasmLoader.reset());

describe('verifySessionState', () => {
  it('returns receipted verification evidence', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () =>
        moduleWithVerification(
          JSON.stringify({
            status: 'verified',
            run_id: HASH,
            input_hash: HASH,
            state_hash: HASH,
            domain_pack_hash: HASH,
            attested_hash: HASH,
            replay_pointer: POINTER,
            attestation: {
              kind: 'blake3-only',
              signature: null,
              public_key: null,
            },
          }),
        ),
    });

    await expect(verifySessionState(domainPack, state)).resolves.toMatchObject({
      status: 'verified',
      state_hash: HASH,
      replay_pointer: POINTER,
    });
  });

  it('preserves verifier refusals', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () =>
        moduleWithVerification(
          JSON.stringify({
            status: 'refused',
            run_id: HASH,
            input_hash: HASH,
            refusal_hash: HASH,
            attested_hash: HASH,
            replay_pointer: POINTER,
            refusal: { code: 'INVALID_STATE', reason: 'forged ledger' },
            message: 'invalid prior state: forged ledger',
            attestation: {
              kind: 'blake3-only',
              signature: null,
              public_key: null,
            },
          }),
        ),
    });

    await expect(verifySessionState(domainPack, state)).rejects.toMatchObject({
      code: 'SESSION_REFUSED',
      details: {
        refusal_code: 'INVALID_STATE',
        refusal_hash: HASH,
      },
    });
  });
});
