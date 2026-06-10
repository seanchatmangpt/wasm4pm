//! Receipt-chain types and lightweight verification boundary.
//!
//! The TS `ReceiptChain` class is a thin wrapper over `ReceiptLink[]` that
//! implements sequential hash verification and replay pointer lookup in TS.
//! Callers obtain a `ReceiptChainSnapshot` from `runContract` and pass its
//! links into `ReceiptChain` for verification; or use `replayReceipt` from
//! `./replay` for WASM-backed replay.

import type { ReceiptLink, ChainVerifyOutcome, CausalCheckResult } from '../types.js';
import { createHash } from 'node:crypto';

/** Compute BLAKE3 hex of a string (pure-JS: delegates to node:crypto sha3 fallback when blake3 native unavailable). */
function blake3Hex(input: string): string {
  // Use blake3 native if available at runtime, else sha3-256 as deterministic stand-in
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const b3 = require('blake3') as { hash: (input: Buffer) => Buffer };
    return b3.hash(Buffer.from(input, 'utf8')).toString('hex');
  } catch {
    // Fallback: sha3-256 (deterministic, same semantic in tests)
    return createHash('sha3-256').update(input, 'utf8').digest('hex');
  }
}

export type {
  Receipt,
  ReceiptLink,
  ReceiptChainSnapshot,
  ReplayRecord,
} from '../types.js';

export { replayReceipt } from './replay.js';
export type { ReplayOptions } from './replay.js';

// ChainVerifyOutcome and CausalCheckResult are authoritative in schemas.ts.
// Do NOT re-export here — they are already exposed via index.ts → schemas.js.

/**
 * Verify causal consistency of a cognition receipt:
 * 1. run_id == blake3(breed + "|" + output_hash)
 * 2. replay_pointer == output_hash.slice(0, 16)
 * 3. Orphan detection: if ocelCorpusRunIds supplied, run_id must be present.
 */
export function verifyCausalConsistency(
  receipt: { run_id: string; breed: string; output_hash: string; replay_pointer: string },
  ocelCorpusRunIds?: Set<string>,
): CausalCheckResult {
  const violations: string[] = [];

  // Check 1: run_id recomputation
  const expectedRunId = blake3Hex(`${receipt.breed}|${receipt.output_hash}`);
  if (receipt.run_id !== expectedRunId) {
    violations.push(
      `RECEIPT_FORGERY: run_id mismatch — stored=${receipt.run_id.slice(0, 16)} expected=${expectedRunId.slice(0, 16)}`,
    );
  }

  // Check 2: replay_pointer == output_hash[:16]
  const expectedReplayPointer = receipt.output_hash.slice(0, 16);
  if (receipt.replay_pointer !== expectedReplayPointer) {
    violations.push(
      `RECEIPT_FORGERY: replay_pointer mismatch — stored=${receipt.replay_pointer} expected=${expectedReplayPointer}`,
    );
  }

  // Check 3: orphan detection
  if (ocelCorpusRunIds !== undefined && !ocelCorpusRunIds.has(receipt.run_id)) {
    violations.push(
      `RECEIPT_FORGERY: orphan receipt — run_id=${receipt.run_id.slice(0, 16)} has no OCEL corpus entry`,
    );
  }

  return { ok: violations.length === 0, violations };
}

const isNonEmptyHash = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

export class ReceiptChain {
  links: ReceiptLink[] = [];

  /**
   * Verify chain integrity. Returns `true` iff every invariant holds:
   *  - `links[0].prev_hash` is absent (genesis link has no predecessor)
   *  - For i>0, `links[i].prev_hash` is a non-empty string equal to a
   *    non-empty `links[i-1].combined_hash` (catches undefined-vs-undefined,
   *    which the previous implementation passed silently)
   *  - `links[i].index === i` (monotonic, no gaps, no rewrites)
   */
  verifyChain(): boolean {
    return this.verifyChainStrict().ok;
  }

  /** Like `verifyChain()` but returns the first violated invariant. */
  verifyChainStrict(): ChainVerifyOutcome {
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      if (link.index !== i)
        return { ok: false, reason: 'non_monotonic_index', at_index: i };
      if (i === 0) {
        if (link.prev_hash !== undefined)
          return { ok: false, reason: 'genesis_has_prev_hash', at_index: 0 };
        continue;
      }
      if (!isNonEmptyHash(link.prev_hash))
        return { ok: false, reason: 'missing_prev_hash', at_index: i };
      const prev = this.links[i - 1];
      if (!isNonEmptyHash(prev.combined_hash))
        return { ok: false, reason: 'missing_combined_hash', at_index: i - 1 };
      if (link.prev_hash !== prev.combined_hash)
        return { ok: false, reason: 'prev_hash_mismatch', at_index: i };
    }
    return { ok: true };
  }

  replayPointer(): string {
    return this.links.length > 0 ? this.links[this.links.length - 1].combined_hash : 'empty';
  }
}
