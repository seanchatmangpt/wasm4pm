//! Receipted, state-carrying cognition sessions.
//!
//! A session turn is a pure transformation over a declarative domain pack,
//! the explicitly supplied prior state, and an observation, confirmation, or
//! both. The persisted state carries a bounded canonical turn ledger; the
//! kernel replays that ledger before admitting the next transition. All
//! inference, gating, state transitions, hashing, and refusal logic remain in
//! Rust.

mod analysis;
mod hash;
mod matcher;
mod model;
mod turn;
mod validate;

pub use hash::{hash_domain_pack, hash_session_state};
pub use model::*;
pub use turn::{run_session_turn, verify_session_state};
pub use validate::validate_domain_pack;

#[cfg(test)]
mod tests;
