//! Rust↔Lean correspondence harnesses (W4PM-LEAN-GALL-010).
//!
//! Each submodule pairs one wasm4pm algorithm implementation with a Lean
//! theorem in `mfact`/`mfw`, per the carrier-map schema documented at
//! `wasm4pm/correspondence/maps/<algorithm-id>.json`. A harness in this
//! module is NOT a live Lean invocation — building mfact's Lean toolchain
//! from an empty `.lake` state requires a full Mathlib build, impractical
//! to run inline. Instead, each harness transcribes the Lean-proven
//! formula as a standalone exact-rational Rust function, cites the source
//! Lean file by content hash, and differentially checks it against the
//! real wasm4pm implementation. See `token_replay`'s module doc for the
//! full scope boundary of what this proves and does not prove.

pub mod alignment_cost;
pub mod causal_dependency_measure;
pub mod declare_semantics;
pub mod ocel_semantics;
pub mod petri_firing;
pub mod process_tree_semantics;
pub mod rework_detection;
pub mod token_replay;
pub mod wf_net_soundness;
