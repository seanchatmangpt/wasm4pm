//! Receipt-chain types and lightweight verification facade.
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
} from '../types';

export { replayReceipt } from './replay.js';
export type { ReplayOptions } from './replay.js';

export class ReceiptChain {
  links: ReceiptLink[] = [];

  verifyChain(): boolean {
    for (let i = 1; i < this.links.length; i++) {
      if (this.links[i].prev_hash !== this.links[i - 1].combined_hash) return false;
    }
    return true;
  }

  replayPointer(): string {
    return this.links.length > 0 ? this.links[this.links.length - 1].combined_hash : 'empty';
  }
}
