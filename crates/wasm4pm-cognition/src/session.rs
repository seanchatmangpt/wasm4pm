//! Receipted, state-carrying cognition sessions.
//!
//! A session turn is a pure transformation over a declarative domain pack,
//! the explicitly supplied prior state, and one new observation. The kernel
//! owns all inference, gating, state transitions, hashing, and refusal logic.

mod analysis;
mod hash;
mod matcher;
mod model;
mod turn;
mod validate;

pub use hash::{hash_domain_pack, hash_session_state};
pub use model::*;
pub use turn::run_session_turn;
pub use validate::validate_domain_pack;

#[cfg(test)]
mod tests;
