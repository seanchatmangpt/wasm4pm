import { afterEach, describe, expect, it } from 'vitest';
import domainPackJson from '../../../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';
import { WasmLoader, type CognitionWasmModule } from '../init.js';
import { projectSessionCode } from './code.js';
import { DomainPackSchema, type SessionState } from './schemas.js';

const HASH = 'a'.repeat(64);
const POINTER = 'b'.repeat(16);
const domainPack = DomainPackSchema.parse(domainPackJson);
const observation = {
  id: 'observation-1',
  source: 'test',
  text: 'x and y dictionary of moves north south east west iterate',
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

function moduleWithCode(result: unknown): CognitionWasmModule {
  return {
    cognition_show: () => '{}',
    cognition_run: () => '{}',
    cognition_session_turn: () => '{}',
    cognition_session_verify: () => '{}',
    cognition_session_code: () => result,
    cognition_verify: () => '{}',
    cognition_replay: () => '{}',
    system_build: () => '{}',
    system_verify: () => '{}',
  };
}

afterEach(() => WasmLoader.reset());

describe('projectSessionCode', () => {
  it('returns the exact cognition-selected Python artifact', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () =>
        moduleWithCode(
          JSON.stringify({
            status: 'ok',
            run_id: HASH,
            input_hash: HASH,
            attested_hash: HASH,
            replay_pointer: POINTER,
            code: {
              track_id: 'coordinate_traversal',
              track_label: 'Coordinate Traversal',
              selection_status: 'committed',
              language: 'python',
              filename: 'coordinate_traversal.py',
              source: 'def final_position(commands):\n    return 0, 0\n',
              source_hash: HASH,
            },
            attestation: {
              kind: 'blake3-only',
              signature: null,
              public_key: null,
            },
          }),
        ),
    });

    await expect(projectSessionCode(domainPack, state)).resolves.toMatchObject({
      code: {
        track_id: 'coordinate_traversal',
        language: 'python',
        filename: 'coordinate_traversal.py',
        source_hash: HASH,
      },
    });
  });

  it('admits a null artifact while cognition has no supported track', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () =>
        moduleWithCode(
          JSON.stringify({
            status: 'ok',
            run_id: HASH,
            input_hash: HASH,
            attested_hash: HASH,
            replay_pointer: POINTER,
            code: null,
            attestation: {
              kind: 'blake3-only',
              signature: null,
              public_key: null,
            },
          }),
        ),
    });

    await expect(projectSessionCode(domainPack, state)).resolves.toMatchObject({ code: null });
  });
});
