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

  it('refuses a loaded module missing the session export', async () => {
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
});
