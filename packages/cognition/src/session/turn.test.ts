import { afterEach, describe, expect, it } from 'vitest';
import domainPackJson from '../../../../crates/wasm4pm-cognition/examples/cognition/interview_session/domain.json';
import { CognitionError } from '../errors.js';
import { WasmLoader, type CognitionWasmModule } from '../init.js';
import {
  DomainPackSchema,
  type DomainPack,
  type SessionTurnInput,
} from './schemas.js';
import { runSessionTurn } from './turn.js';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const POINTER = 'c'.repeat(16);
const domainPack = DomainPackSchema.parse(domainPackJson);

function input(pack: DomainPack = domainPack): SessionTurnInput {
  return {
    domain_pack: pack,
    observation: {
      id: 'observation-1',
      source: 'test',
      text: 'x and y dictionary of moves',
      retract_evidence_ids: [],
    },
  };
}

function fakeModule(sessionResult: unknown): CognitionWasmModule {
  return {
    cognition_show: () => '{}',
    cognition_run: () => '{}',
    cognition_session_turn: () => sessionResult,
    cognition_session_verify: () => '{}',
    cognition_session_code: () => '{}',
    cognition_verify: () => '{}',
    cognition_replay: () => '{}',
    system_build: () => '{}',
    system_verify: () => '{}',
  };
}

afterEach(() => {
  WasmLoader.reset();
});

describe('runSessionTurn', () => {
  it('rejects invalid host input before invoking WASM', async () => {
    const invalid = input({ ...domainPack, version: '1' } as unknown as DomainPack);

    await expect(runSessionTurn(invalid)).rejects.toMatchObject({
      name: 'CognitionError',
      code: 'SESSION_INPUT_INVALID',
    });
  });

  it('preserves receipted refusal evidence', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () =>
        fakeModule(
          JSON.stringify({
            status: 'refused',
            run_id: HASH,
            input_hash: OTHER_HASH,
            refusal_hash: HASH,
            attested_hash: HASH,
            replay_pointer: POINTER,
            refusal: { code: 'EMPTY_TURN' },
            message: 'a session turn requires an observation or confirmation',
            attestation: {
              kind: 'blake3-only',
              signature: null,
              public_key: null,
            },
          }),
        ),
    });

    try {
      await runSessionTurn(input());
      throw new Error('expected session refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(CognitionError);
      expect(error).toMatchObject({
        code: 'SESSION_REFUSED',
        details: {
          refusal_code: 'EMPTY_TURN',
          refusal_hash: HASH,
          attested_hash: HASH,
          replay_pointer: POINTER,
        },
      });
    }
  });

  it('classifies malformed JSON separately from shape errors', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () => fakeModule('{'),
    });

    await expect(runSessionTurn(input())).rejects.toMatchObject({
      code: 'OUTPUT_PARSE_FAILED',
    });
  });

  it('refuses a loaded module missing the session exports', async () => {
    WasmLoader.getInstance({
      moduleLoader: async () => ({
        cognition_show: () => '{}',
        cognition_run: () => '{}',
      }),
    });

    await expect(runSessionTurn(input())).rejects.toMatchObject({
      code: 'WASM_INIT_FAILED',
    });
  });

  function successResult(overrides: { turn?: number; evidence?: unknown[] } = {}): string {
    const turn = overrides.turn ?? 1;
    return JSON.stringify({
      status: 'ok',
      run_id: HASH,
      input_hash: OTHER_HASH,
      output_hash: HASH,
      attested_hash: HASH,
      replay_pointer: POINTER,
      output: {
        state: {
          schema_version: '2',
          turn,
          domain_pack_hash: HASH,
          previous_state_hash: null,
          turns: Array.from({ length: turn }, () => ({
            observation: input().observation,
            confirmation: null,
          })),
          observations: [],
          evidence: overrides.evidence ?? [],
          rejected_tracks: [],
          hypotheses: [],
          committed_track: null,
          phase: 'clarification',
          covered_concepts: [],
          missing_concepts: [],
          pending_confirmation: null,
          state_hash: HASH,
        },
        projection: {
          current_track: null,
          hypotheses: [],
          covered_concepts: [],
          missing_concepts: [],
          phase: 'clarification',
          phase_label: 'Clarification',
          pending_confirmation: null,
          complete: false,
        },
        inference_trace: [{ step: 0, kind: 'admit', detail: 'first observation admitted', depth: 0, objects: [] }],
        ocel_log: null,
        receipt: {
          input_hash: OTHER_HASH,
          previous_state_hash: HASH,
          domain_pack_hash: HASH,
          output_hash: HASH,
          combined_hash: HASH,
        },
      },
      attestation: { kind: 'blake3-only', signature: null, public_key: null },
    });
  }

  function refusalResult(code: string, message: string): string {
    return JSON.stringify({
      status: 'refused',
      run_id: HASH,
      input_hash: OTHER_HASH,
      refusal_hash: HASH,
      attested_hash: HASH,
      replay_pointer: POINTER,
      refusal: { code },
      message,
      attestation: { kind: 'blake3-only', signature: null, public_key: null },
    });
  }

  describe('first mile — no previous_state', () => {
    it('resolves turn 1 from an undefined previous_state without fabricating prior evidence', async () => {
      WasmLoader.getInstance({
        moduleLoader: async () => fakeModule(successResult({ turn: 1, evidence: [] })),
      });

      const turnInput = input();
      expect(turnInput.previous_state).toBeUndefined();

      const result = await runSessionTurn(turnInput);

      expect(result.output.state.turn).toBe(1);
      expect(result.output.state.evidence).toEqual([]);
    });

    it('still refuses a malformed first observation — absence of prior state is not license to admit it', async () => {
      WasmLoader.getInstance({
        moduleLoader: async () =>
          fakeModule(refusalResult('EMPTY_OBSERVATION', 'first observation failed schema validation')),
      });

      await expect(runSessionTurn(input())).rejects.toMatchObject({
        code: 'SESSION_REFUSED',
        details: { refusal_code: 'EMPTY_OBSERVATION' },
      });
    });
  });

  describe('last mile — refusal must not be coerced into success', () => {
    it('never reinterprets a refused WASM result as status "ok"', async () => {
      WasmLoader.getInstance({
        moduleLoader: async () =>
          fakeModule(refusalResult('INVALID_STATE', 'obligation not satisfied')),
      });

      const outcome = await runSessionTurn(input()).catch((error: unknown) => error);

      expect(outcome).toBeInstanceOf(CognitionError);
      expect(outcome).toMatchObject({ code: 'SESSION_REFUSED' });
      // A last-mile guard: the thrown error carries the refusal receipt hashes,
      // it does not carry a fabricated `output` as if the turn had succeeded.
      expect((outcome as CognitionError & { output?: unknown }).output).toBeUndefined();
    });
  });
});
