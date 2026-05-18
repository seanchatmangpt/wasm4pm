/**
 * Tests for relay-bridge.ts — LIVE-10 partial coverage.
 *
 * Verifies that each of the 4 LIVE-10 relay span emitters:
 *   1. Returns the correct span name.
 *   2. Includes all 5 required relay attributes with correct values.
 *
 * Two tests per emitter (8 total):
 *   - Span name assertion
 *   - All 5 required attribute assertions (relay.cross_enterprise, relay.id,
 *     relay.signature, relay.signature_verified, relay.freshness_valid)
 */

import { describe, it, expect } from 'vitest';
import {
  emitA2aMessage,
  emitA2aRelaySend,
  emitA2aRelayReceive,
  emitA2aRelayForward,
  RelayMessageRecord,
} from '../relay-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture
// ─────────────────────────────────────────────────────────────────────────────

const BASE_RELAY: RelayMessageRecord = {
  relayId: 'relay-ent-a-to-ent-b-001',
  crossEnterprise: true,
  relaySignature: 'abc123def456relay',
  signatureVerified: true,
  freshnessValid: true,
  runId: 'run-live10-test-001',
};

/**
 * Asserts all 5 required LIVE-10 relay attributes are present and correct.
 */
function assertRelayAttributes(
  fields: Record<string, string | number | boolean>,
  rec: RelayMessageRecord,
): void {
  expect(fields['relay.cross_enterprise']).toBe(rec.crossEnterprise);
  expect(fields['relay.id']).toBe(rec.relayId);
  expect(fields['relay.signature']).toBe(rec.relaySignature);
  expect(fields['relay.signature_verified']).toBe(rec.signatureVerified);
  expect(fields['relay.freshness_valid']).toBe(rec.freshnessValid);
}

// ─────────────────────────────────────────────────────────────────────────────
// emitA2aMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('emitA2aMessage', () => {
  it('returns span with name a2a.message', () => {
    const rec = emitA2aMessage(BASE_RELAY);
    expect(rec.name).toBe('a2a.message');
  });

  it('includes all 5 required relay attributes with correct values', () => {
    const rec = emitA2aMessage(BASE_RELAY);
    assertRelayAttributes(rec.fields, BASE_RELAY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitA2aRelaySend
// ─────────────────────────────────────────────────────────────────────────────

describe('emitA2aRelaySend', () => {
  it('returns span with name a2a.message.relay_send', () => {
    const rec = emitA2aRelaySend(BASE_RELAY);
    expect(rec.name).toBe('a2a.message.relay_send');
  });

  it('includes all 5 required relay attributes with correct values', () => {
    const rec = emitA2aRelaySend(BASE_RELAY);
    assertRelayAttributes(rec.fields, BASE_RELAY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitA2aRelayReceive
// ─────────────────────────────────────────────────────────────────────────────

describe('emitA2aRelayReceive', () => {
  it('returns span with name a2a.message.relay_receive', () => {
    const rec = emitA2aRelayReceive(BASE_RELAY);
    expect(rec.name).toBe('a2a.message.relay_receive');
  });

  it('includes all 5 required relay attributes with correct values', () => {
    const rec = emitA2aRelayReceive(BASE_RELAY);
    assertRelayAttributes(rec.fields, BASE_RELAY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitA2aRelayForward
// ─────────────────────────────────────────────────────────────────────────────

describe('emitA2aRelayForward', () => {
  it('returns span with name a2a.message.relay_forward', () => {
    const rec = emitA2aRelayForward(BASE_RELAY);
    expect(rec.name).toBe('a2a.message.relay_forward');
  });

  it('includes all 5 required relay attributes with correct values', () => {
    const rec = emitA2aRelayForward(BASE_RELAY);
    assertRelayAttributes(rec.fields, BASE_RELAY);
  });
});
