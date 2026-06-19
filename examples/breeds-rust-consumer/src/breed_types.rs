// breed_types.rs — FIXED cognition WASM contract types (ship as-is; not generated).
// Mirrors crates/wasm4pm-cognition/src/wasm.rs. These types do NOT vary per breed.

use serde::{Deserialize, Serialize};

/// A single key/value fact in working memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub key: String,
    pub value: String,
}

/// A production / inference rule. `certainty` is REQUIRED (no serde default).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub premise: Vec<String>,
    pub conclusion: String,
    pub certainty: f64,
}

/// A goal predicate the breed should satisfy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub predicate: String,
    pub value: String,
}

/// One atom of declared world state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateAtom {
    pub predicate: String,
    pub value: String,
}

/// A candidate solution under consideration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub id: String,
    pub score: f64,
    pub eliminated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elimination_reason: Option<String>,
}

/// A historical case for case-based reasoning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Case {
    pub id: String,
    pub intent: String,
    pub architecture: String,
    pub outcome_score: f64,
    pub facts: Vec<Fact>,
}

/// The full input contract passed under `cognition_run.contract`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreedInput {
    pub intent: String,
    pub candidates: Vec<Candidate>,
    pub facts: Vec<Fact>,
    pub cases: Vec<Case>,
    pub rules: Vec<Rule>,
    pub goals: Vec<Goal>,
    pub state: Vec<StateAtom>,
}

/// Optional per-run options.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
}

/// The top-level argument to `cognition_run`.
/// `{ breed, contract, options? }` — NEVER send a bare `BreedInput`
/// (Rust `deny_unknown_fields` => "missing field 'breed'").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitionRunInput {
    pub breed: String,
    pub contract: BreedInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<RunOptions>,
}

/// The result returned by `cognition_run` (`ContractResult`).
/// Success check: `status == "ok"`. Receipt save uses `run_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractResult {
    pub status: String,
    pub breed: String,
    pub run_id: String,
    pub output_hash: String,
    pub replay_pointer: String,
    pub options_profile: Option<String>,
    pub output: serde_json::Value,
}
