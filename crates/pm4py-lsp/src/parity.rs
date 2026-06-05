use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ParityFixture {
    pub snapshot_id: String,
    pub csv_path: String,
    pub parameters: HashMap<String, String>,
    pub expected_outcome: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum EquivalenceKind {
    /// Exact match of the resulting model/discovery.
    Exact,
    /// Semantic equivalence (e.g. isomorphic graphs).
    Semantic,
    /// Statistical equivalence (e.g. same fitness/precision).
    Statistical,
    /// No equivalence.
    None,
    /// Unsupported equivalence kind.
    Unsupported,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum ParityVerdictDecision {
    Admitted,
    Refused,
    Unsupported,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ParityVerdict {
    pub fixture_id: String,
    pub equivalence: EquivalenceKind,
    pub decision: ParityVerdictDecision,
    pub gap_analysis: Option<String>,
}

pub fn classify_parity_gap(expected: &str, actual: &str) -> String {
    if expected == actual {
        "No gap detected.".to_string()
    } else {
        format!("Gap detected: expected '{}', got '{}'", expected, actual)
    }
}

pub fn evaluate_parity(
    fixture_id: &str,
    expected: &str,
    actual: &str,
    kind: EquivalenceKind,
) -> ParityVerdict {
    let gap = classify_parity_gap(expected, actual);
    let decision = match kind {
        EquivalenceKind::Unsupported => ParityVerdictDecision::Unsupported,
        _ => {
            if expected == actual {
                ParityVerdictDecision::Admitted
            } else {
                ParityVerdictDecision::Refused
            }
        }
    };

    ParityVerdict {
        fixture_id: fixture_id.to_string(),
        equivalence: kind,
        decision,
        gap_analysis: Some(gap),
    }
}

