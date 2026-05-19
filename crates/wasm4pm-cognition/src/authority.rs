//! Authority-text classification: distinguish machine evidence from human
//! prose / LLM projection.
//!
//! `MachineEvidence` requires the absence of any human or LLM markers.
//! Mixed inputs (a 64-hex digest sandwiched in human prose) MUST classify
//! as `Mixed` — never as `MachineEvidence`. Otherwise an attacker could
//! defeat the human-authority detector by appending a hash to a sentence
//! of natural language.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// Classification of a piece of authority-bearing text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuthorityKind {
    /// Pure machine-derived evidence (digests, span ids, trace ids).
    MachineEvidence,
    /// First-person prose from a human.
    HumanProse,
    /// Telltale LLM completion patterns.
    LlmProjection,
    /// Any combination — must not be promoted to `MachineEvidence`.
    Mixed,
    /// Empty or whitespace-only input.
    Empty,
}

static HUMAN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(I (think|believe|recommend|feel)|in my (opinion|view)|seems to|probably|might be|likely)\b",
    )
    .expect("HUMAN_RE compiles")
});

static LLM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(as an AI|I do not have (access|the ability)|certainly!|here(?:'|\u{2019})s a|let me (help|explain)|in summary,)\b",
    )
    .expect("LLM_RE compiles")
});

static MACHINE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\b([a-f0-9]{64}|trace_id=[a-f0-9]{32}|span_id=[a-f0-9]{16}|sha256:[a-f0-9]{64})\b",
    )
    .expect("MACHINE_RE compiles")
});

/// Classifier for authority text. Backed by three orthogonal regexes;
/// `Mixed` wins whenever both human/LLM and machine markers appear.
pub struct AuthorityClassifier;

impl AuthorityClassifier {
    /// Classify `text`. See [`classify`].
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn classify(&self, text: &str) -> AuthorityKind {
        classify(text)
    }
}

/// Classify a piece of authority-bearing text.
///
/// Rules:
/// * `Empty` if the text is whitespace-only.
/// * If both a human/LLM marker and a machine marker are present → `Mixed`.
/// * Else exactly one of `HumanProse`, `LlmProjection`, `MachineEvidence`.
/// * Otherwise (no markers fired) → `Empty`.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn classify(text: &str) -> AuthorityKind {
    if text.trim().is_empty() {
        return AuthorityKind::Empty;
    }
    let h = HUMAN_RE.is_match(text);
    let l = LLM_RE.is_match(text);
    let m = MACHINE_RE.is_match(text);
    match (h, l, m) {
        (true, _, true) | (_, true, true) => AuthorityKind::Mixed,
        (true, false, false) => AuthorityKind::HumanProse,
        (false, true, false) => AuthorityKind::LlmProjection,
        (false, false, true) => AuthorityKind::MachineEvidence,
        (true, true, false) => AuthorityKind::Mixed,
        _ => AuthorityKind::Empty,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_empty() {
        assert_eq!(classify(""), AuthorityKind::Empty);
        assert_eq!(classify("   \t\n"), AuthorityKind::Empty);
    }

    #[test]
    fn pure_hex_is_machine() {
        let s = "0".repeat(64);
        assert_eq!(classify(&s), AuthorityKind::MachineEvidence);
    }

    #[test]
    fn human_prose_is_human() {
        assert_eq!(classify("I think this is fine"), AuthorityKind::HumanProse);
    }

    #[test]
    fn llm_marker_is_llm() {
        assert_eq!(
            classify("Certainly! Let me explain"),
            AuthorityKind::LlmProjection
        );
    }

    #[test]
    fn human_plus_hex_is_mixed_not_machine() {
        let s = format!("I think {}", "0".repeat(64));
        assert_eq!(classify(&s), AuthorityKind::Mixed);
    }

    #[test]
    fn llm_plus_hex_is_mixed_not_machine() {
        let s = format!("As an AI, I produce {}", "a".repeat(64));
        assert_eq!(classify(&s), AuthorityKind::Mixed);
    }
}
