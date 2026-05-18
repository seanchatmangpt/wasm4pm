/**
 * relay-bridge: emit the 4 LIVE-10 relay span events required by the mcpp
 * AAT-Live cross-enterprise relay correlation rules.
 *
 * LIVE-10 requires exactly these 4 span names to be present in a correlated
 * span set for every cross-enterprise A2A relay:
 *   1. a2a.message             — message sent/received (base event)
 *   2. a2a.message.relay_send  — relay send initiated by originating enterprise
 *   3. a2a.message.relay_receive — relay receive confirmed by target enterprise
 *   4. a2a.message.relay_forward — relay forwarded (multi-hop routing)
 *
 * The actual cryptographic relay verification happens in the BEAM/Erlang runtime
 * (mcpp). This bridge models the relay event structure and emits correlated
 * SpineTraceRecords carrying the required attributes so mcpp can correlate
 * cross-enterprise relay events from the wasm4pm side.
 *
 * Required attributes for all relay spans:
 *   - relay.cross_enterprise    — boolean: true if relay crosses enterprise boundary
 *   - relay.id                  — string: stable relay identifier
 *   - relay.signature           — string: Ed25519 relay signature (hex or base64)
 *   - relay.signature_verified  — boolean: whether signature was verified
 *   - relay.freshness_valid     — boolean: whether relay timestamp is within window
 *
 * References:
 *   - mcpp relay correlation: mcpp-server/src/aat/relay.rs
 *   - SpineTraceRecord: observability/spine-bridge.ts
 */

import { SpineTraceRecord } from './spine-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// RelayMessageRecord — input type for all relay span emitters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input record for all LIVE-10 relay span emitters.
 *
 * Carries the relay correlation fields required by mcpp's cross-enterprise
 * relay verification rules. The actual cryptographic verification is performed
 * by the BEAM runtime; this record models the result of that verification for
 * wasm4pm bridge emission.
 */
export interface RelayMessageRecord {
  /** Stable relay identifier — correlates all 4 relay spans. */
  relayId: string;
  /** True if the relay crosses an enterprise boundary. */
  crossEnterprise: boolean;
  /** Ed25519 relay signature (hex or base64 encoded). */
  relaySignature: string;
  /** Whether the relay signature was verified by the BEAM runtime. */
  signatureVerified: boolean;
  /** Whether the relay timestamp is within the acceptable freshness window. */
  freshnessValid: boolean;
  /** Stable run identifier — required by all LIVE rules. */
  runId: string;
  /** Optional wall-clock nanoseconds override; defaults to Date.now() * 1_000_000. */
  tsNs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper: build relay attribute fields from a RelayMessageRecord
// ─────────────────────────────────────────────────────────────────────────────

function buildRelayFields(
  rec: RelayMessageRecord,
): SpineTraceRecord['fields'] {
  return {
    'run.id': rec.runId,
    'service.name': 'wasm4pm.spine',
    'relay.cross_enterprise': rec.crossEnterprise,
    'relay.id': rec.relayId,
    'relay.signature': rec.relaySignature,
    'relay.signature_verified': rec.signatureVerified,
    'relay.freshness_valid': rec.freshnessValid,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual emitters — one per LIVE-10 required span
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emits the a2a.message span (LIVE-10 relay event 1/4).
 *
 * Base A2A message event carrying relay correlation attributes. Emitted by
 * both originating and target enterprises to mark the message boundary.
 */
export function emitA2aMessage(rec: RelayMessageRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'a2a.message',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: buildRelayFields(rec),
  };
}

/**
 * Emits the a2a.message.relay_send span (LIVE-10 relay event 2/4).
 *
 * Emitted by the originating enterprise when a relay send is initiated.
 * Carries the relay signature to be verified by the target enterprise.
 */
export function emitA2aRelaySend(rec: RelayMessageRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'a2a.message.relay_send',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: buildRelayFields(rec),
  };
}

/**
 * Emits the a2a.message.relay_receive span (LIVE-10 relay event 3/4).
 *
 * Emitted by the target enterprise when a relayed message is received and
 * signature verification has been performed by the BEAM runtime.
 */
export function emitA2aRelayReceive(rec: RelayMessageRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'a2a.message.relay_receive',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: buildRelayFields(rec),
  };
}

/**
 * Emits the a2a.message.relay_forward span (LIVE-10 relay event 4/4).
 *
 * Emitted during multi-hop relay routing when a message is forwarded through
 * an intermediate relay node. The relay.id remains stable across hops.
 */
export function emitA2aRelayForward(rec: RelayMessageRecord): SpineTraceRecord {
  return {
    kind: 'event',
    name: 'a2a.message.relay_forward',
    ts_ns: rec.tsNs ?? Date.now() * 1_000_000,
    fields: buildRelayFields(rec),
  };
}
