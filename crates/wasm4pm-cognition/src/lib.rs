#![allow(clippy::type_complexity)]

//! # wasm4pm-cognition — AutoSystems old-AI cognition kernel
//!
//! Real implementations of foundational old-AI cognition systems, plus
//! the AutoSystems-specific manufacturing layer (cost laws, Pareto
//! dominance, BLAKE3 receipt chain, adversarial detectors).
//!
//! Doctrine: *"Old AI is the factory. LLMs are the brochure."* Every
//! verb8 command in `wpm <noun> <verb>` runs through this kernel and
//! refuses success without machine evidence.
//!
//! ## Modules
//!
//! - [`breeds::frame`] — Minsky-style frames (1974)
//! - [`breeds::production_rules`] — forward-chaining rule engine
//! - [`breeds::prolog`] — Horn-clause backward chaining with Robinson unification
//! - [`breeds::strips`] — STRIPS-style means-ends planner (Fikes & Nilsson 1971)
//! - [`breeds::hearsay`] — Hearsay-II blackboard architecture (Erman & Lesser 1980)
//! - [`gmrw`] — ontology-addressed admission, diagnosis, and real-time operator scheduling
//! - [`session`] — receipted, state-carrying compound cognition sessions
//! - [`autosystems::cost_law`] — traditional + replacement cost-law evaluators
//! - [`autosystems::dominance`] — Pareto dominance over scored candidates
//! - [`autosystems::receipt`] — BLAKE3-linked receipt chain with replay
//! - [`autosystems::adversarial`] — 8 false-pass detectors
//! - [`autosystems::contract`] — `run_contract`: the verb8 entry point
//!
//! ## Exposure to JavaScript / TypeScript
//!
//! Build with `--features wasm` and `wasm-pack build` to emit `.js` +
//! `.d.ts` bindings. The `wasm` and `session_wasm` modules re-export curated,
//! stable surfaces; everything else is intentionally not in the JS namespace.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

pub mod authority;
pub mod autoinstinct;
pub mod autosystems;
pub mod breeds;
pub mod evidence;
pub mod ghf;
pub mod gmrw;
pub mod interview;
pub mod log_adapter;
pub mod observability;
pub mod ocel;
pub mod registry;
pub mod session;

#[cfg(feature = "wasm")]
pub mod session_wasm;
#[cfg(feature = "wasm")]
pub mod wasm;
