import { describe, expect, it } from 'vitest';
import { SessionStateSchema, type SessionState } from './schemas.js';

const HASH = 'a'.repeat(64);

const observation = {
  id: 'observation-1',
  source: 'test',
  text: 'x and y',
  retract_evidence_ids: [],
};

function validState(): SessionState {
  return {
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
}

// Chicken-and-egg guard: a session state that came from our own prior write
// (e.g. localStorage, or a ggen-emitted fixture) is not trusted merely because
// we wrote it — it must independently re-pass structural admission every time
// it is loaded, exactly like state from any other source.
describe('SessionStateSchema — structural admission of persisted/round-tripped state', () => {
  it('admits a well-formed round-tripped state unchanged', () => {
    const state = validState();
    const roundTripped = JSON.parse(JSON.stringify(state)) as unknown;

    const result = SessionStateSchema.safeParse(roundTripped);

    expect(result.success).toBe(true);
  });

  it('rejects a tampered turn counter that no longer matches the turn ledger length', () => {
    const tampered = { ...validState(), turn: 5 };

    const result = SessionStateSchema.safeParse(tampered);

    expect(result.success).toBe(false);
  });

  it('rejects a state hash that is not a well-formed BLAKE3 hex digest', () => {
    const tampered = { ...validState(), state_hash: 'not-a-real-hash' };

    const result = SessionStateSchema.safeParse(tampered);

    expect(result.success).toBe(false);
  });

  it('rejects an extra, unexpected field injected into persisted JSON', () => {
    const tampered = { ...validState(), injected_by_attacker: true };

    const result = SessionStateSchema.safeParse(tampered);

    expect(result.success).toBe(false);
  });

  it('rejects a turn ledger emptied while turn is left nonzero', () => {
    const tampered = { ...validState(), turns: [] };

    const result = SessionStateSchema.safeParse(tampered);

    expect(result.success).toBe(false);
  });
});
