//! Receipt-chain types and lightweight verification boundary.
//!
//! The TS `ReceiptChain` class is a thin wrapper over `ReceiptLink[]` that
//! implements sequential hash verification and replay pointer lookup in TS.
//! Callers obtain a `ReceiptChainSnapshot` from `runContract` and pass its
//! links into `ReceiptChain` for verification; or use `replayReceipt` from
//! `./replay` for WASM-backed replay.

import type { ReceiptLink } from '../types.js';

export type {
  Receipt,
  ReceiptLink,
  ReceiptChainSnapshot,
  ReplayRecord,
} from '../types.js';

export { replayReceipt } from './replay.js';
export type { ReplayOptions } from './replay.js';

/** Outcome of `verifyChainStrict`. `ok=true` iff every invariant held. */
export interface ChainVerifyOutcome {
  ok: boolean;
  reason?:
    | 'genesis_has_prev_hash'
    | 'missing_prev_hash'
    | 'prev_hash_mismatch'
    | 'missing_combined_hash'
    | 'non_monotonic_index';
  at_index?: number;
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
