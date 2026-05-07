//! Receipt-chain types re-exported as a stable surface.
//!
//! ZERO logic — every chain operation lives in Rust (`crates/wasm4pm-cognition`).
//! The TS facade only re-exports types and the WASM-backed `replayReceipt`
//! wrapper from `./replay`. No append/verify methods are implemented in TS;
//! callers obtain a `ReceiptChainSnapshot` from `runContract` and a
//! `ReplayRecord` from `replayReceipt`.

export type {
  Receipt,
  ReceiptLink,
  ReceiptChainSnapshot,
  ReplayRecord,
} from '../types';

export { replayReceipt } from './replay';
export type { ReplayOptions } from './replay';
