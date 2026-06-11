//! Per-breed [`BreedOracle`](super::oracle::BreedOracle) implementations.
//!
//! Every input here uses fresh `uo_*` content that appears in no public
//! fixture (defeats A1/A2). A dedicated gate in `tests/registry_admission.rs`
//! asserts `uo_` names never leak into production breed sources.

pub mod dialogue;
pub mod learning;
pub mod logic;
pub mod planning;
pub mod rule_fact;

use crate::breeds::{BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom};

/// Minimal input scaffold shared by all oracle impls.
pub(crate) fn base(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

pub(crate) fn fact(key: &str, value: &str) -> Fact {
    Fact { key: key.to_string(), value: value.to_string() }
}

pub(crate) fn rule(id: &str, premise: &[&str], conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.to_string(),
        premise: premise.iter().map(|p| p.to_string()).collect(),
        conclusion: conclusion.to_string(),
        certainty,
    }
}

pub(crate) fn goal(id: &str, predicate: &str, value: &str) -> Goal {
    Goal { id: id.to_string(), predicate: predicate.to_string(), value: value.to_string() }
}

pub(crate) fn state_atom(predicate: &str, value: &str) -> StateAtom {
    StateAtom { predicate: predicate.to_string(), value: value.to_string() }
}

pub(crate) fn candidate(id: &str, score: f32) -> Candidate {
    Candidate { id: id.to_string(), score, eliminated: false, elimination_reason: None }
}

pub(crate) fn case(id: &str, intent: &str, architecture: &str, outcome_score: f32, facts: Vec<Fact>) -> Case {
    Case {
        id: id.to_string(),
        intent: intent.to_string(),
        architecture: architecture.to_string(),
        outcome_score,
        facts,
    }
}
