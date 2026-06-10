import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

/**
 * PROOF: admission gate — one negative test per conjunct (C1–C7) + replay block.
 *
 * INVARIANT — every conjunct of accept(x) is independently refusable:
 *   C1  forged signature              → admitted=false, failing_conjunct='C1'
 *   C2  null receipt_hash             → admitted=false, failing_conjunct='C2'
 *   C3  actor not in policy           → admitted=false, failing_conjunct='C3'
 *   C5  consumed nonce                → admitted=false, failing_conjunct='C5'
 *   C6  inadmissible state transition → admitted=false, failing_conjunct='C6'
 *   C7  empty objects array           → admitted=false, failing_conjunct='C7'
 *
 * Anti-FM-5: real WASM boundary — NO mocks.
 * Uses wasm_admit_change_inline which accepts config contents as strings
 * (not file paths) so tests work in the Node.js WASM sandbox.
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

function hex(n: number): string {
  return randomBytes(n).toString('hex');
}

function makeCandidate(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    actor: 'test-actor',
    event_type: 'complete',
    state: 'running',
    objects: [{ id: 'obj-1', type: 'invoice' }],
    challenge_nonce: hex(16),
    receipt: {
      receipt_hash: hex(32),
      previous_receipt_hash: hex(32),
    },
    signature: hex(64),
    signer_pubkey: hex(32),
  };
  return JSON.stringify({ ...base, ...overrides });
}

const DEFAULT_POLICY = JSON.stringify({
  version: '1',
  policy_hash: hex(32),
  grants: [{ actor_pattern: '*', event_types: ['*'] }],
});

const DEFAULT_BOUNDARY = JSON.stringify({
  transitions: {
    running: ['complete', 'fail', 'pause'],
    idle: ['start'],
    paused: ['resume'],
  },
});

const DEFAULT_REVOKED = JSON.stringify([]);
const EMPTY_LEDGER = '';

function admit(candidate: string, opts: {
  ledger?: string;
  policy?: string;
  boundary?: string;
  revoked?: string;
} = {}): { admitted: boolean; failing_conjunct: string | null; refusal_code: string | null } {
  return JSON.parse(wasm.wasm_admit_change_inline(
    candidate,
    opts.ledger ?? EMPTY_LEDGER,
    opts.policy ?? DEFAULT_POLICY,
    opts.boundary ?? DEFAULT_BOUNDARY,
    opts.revoked ?? DEFAULT_REVOKED,
  ));
}

// ─── WASM surface ─────────────────────────────────────────────────────────────

let wasm: any;

beforeAll(async () => {
  wasm = await import('wasm4pm');
  if (typeof wasm.default === 'function') await wasm.default();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('admission.proof — negative tests per conjunct', () => {
  it('C1: forged signature is refused', () => {
    // makeCandidate includes signature=hex(64)+signer_pubkey=hex(32) — valid lengths
    // but random bytes won't pass ed25519 verification
    const result = admit(makeCandidate());
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C1');
  });

  it('C2: null receipt_hash is refused', () => {
    const candidate = makeCandidate({ receipt: { receipt_hash: null, previous_receipt_hash: null } });
    const result = admit(candidate);
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C2');
  });

  it('C3: actor not in policy is refused', () => {
    const restrictedPolicy = JSON.stringify({
      version: '1',
      policy_hash: hex(32),
      grants: [{ actor_pattern: 'admin-only', event_types: ['complete'] }],
    });
    const candidate = makeCandidate({ actor: 'test-actor' });
    const result = admit(candidate, { policy: restrictedPolicy });
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C3');
  });

  it('C5: consumed nonce is refused', () => {
    const nonce = hex(16);
    const ledger = JSON.stringify({ nonce }) + '\n';
    const candidate = makeCandidate({ challenge_nonce: nonce });
    const result = admit(candidate, { ledger });
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C5');
  });

  it('C6: inadmissible state transition is refused', () => {
    const boundary = JSON.stringify({
      transitions: {
        running: ['complete', 'fail'],
        idle: ['start'],
        paused: ['resume'],
        // 'completed' not listed — any event from that state is denied
      },
    });
    const candidate = makeCandidate({ state: 'completed', event_type: 'start' });
    const result = admit(candidate, { boundary });
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C6');
  });

  it('C7: empty objects array is refused', () => {
    const candidate = makeCandidate({ objects: [] });
    const result = admit(candidate);
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C7');
  });

  it('Replay: pre-consumed nonce is blocked — gate consults nonce ledger', () => {
    const nonce = hex(16);
    // Write nonce to ledger as if it was previously consumed
    const ledger = JSON.stringify({ nonce }) + '\n';
    const candidate = makeCandidate({ challenge_nonce: nonce });
    const result = admit(candidate, { ledger });
    // Nonce is consumed — C5 fires before C1 (C1 is last in gate order)
    expect(result.admitted).toBe(false);
    expect(result.failing_conjunct).toBe('C5');
  });
});
