//! Pure data contracts for cognition sessions.

use crate::breeds::TraceStep;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

fn default_concept_coverage() -> f32 {
    0.25
}

/// Declarative bounded domain consumed by the session kernel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DomainPack {
    /// Domain-pack schema version.
    pub version: String,
    /// Stable domain identifier.
    pub id: String,
    /// Human guidance for every concept referenced by a track.
    pub concepts: BTreeMap<String, ConceptSpec>,
    /// Candidate tracks available in this domain.
    pub tracks: Vec<TrackSpec>,
    /// Deterministic all-match observation patterns.
    pub patterns: Vec<PatternSpec>,
    /// Forward-chaining domain rules.
    pub rules: Vec<SessionRule>,
    /// Ordered workflow phases.
    pub phases: Vec<PhaseSpec>,
    /// Phrase aliases applied before matching.
    #[serde(default)]
    pub aliases: BTreeMap<String, String>,
    /// Commitment thresholds.
    pub thresholds: ThresholdSpec,
    /// Resource caps enforced by the kernel.
    pub bounds: SessionBounds,
}

/// Human-readable ontology guidance for one concept.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConceptSpec {
    /// Human-readable concept label.
    pub label: String,
    /// Ontology-level prompt describing what a complete answer should cover.
    pub prompt: String,
}

/// A candidate interview or diagnostic track.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TrackSpec {
    /// Stable track identifier.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Concepts expected for this track.
    pub concepts: Vec<String>,
}

/// A deterministic phrase matcher that posts evidence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PatternSpec {
    /// Stable matcher identifier.
    pub id: String,
    /// Any phrase in this list activates the matcher.
    pub phrases: Vec<String>,
    /// Proposition posted when the matcher fires.
    pub proposition: String,
    /// Signed track weights. Positive values support; negative values contradict.
    #[serde(default)]
    pub track_weights: BTreeMap<String, f32>,
    /// Optional concept covered by this evidence.
    #[serde(default)]
    pub concept: Option<String>,
}

/// A MYCIN-style deterministic rule over posted propositions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionRule {
    /// Stable rule identifier.
    pub id: String,
    /// Propositions that must all be present positively.
    pub premises: Vec<String>,
    /// Track supported by the rule.
    pub track_id: String,
    /// Rule certainty in `[0, 1]`.
    pub certainty: f32,
    /// Optional concept established when the rule fires.
    #[serde(default)]
    pub concept: Option<String>,
}

/// One ordered state-machine phase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PhaseSpec {
    /// Stable phase identifier.
    pub id: String,
    /// Human-readable phase label.
    pub label: String,
    /// Whether a committed track is required to complete this phase.
    #[serde(default)]
    pub requires_committed_track: bool,
    /// Concepts that must be covered to complete this phase.
    #[serde(default)]
    pub required_concepts: Vec<String>,
}

/// Track commitment thresholds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThresholdSpec {
    /// Minimum top-track score.
    pub confidence: f32,
    /// Minimum lead over the second-ranked track.
    pub margin: f32,
    /// Minimum number of covered concepts.
    pub minimum_coverage: usize,
    /// Per-track concept support required for coverage.
    #[serde(default = "default_concept_coverage")]
    pub concept_coverage: f32,
    /// Whether a human confirmation is required before commitment.
    pub confirmation_required: bool,
    /// Maximum tolerated contradiction before commitment.
    pub maximum_contradiction: f32,
}

/// Resource bounds for a session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SessionBounds {
    /// Maximum retained turns, including confirmation-only turns.
    pub max_turns: usize,
    /// Maximum retained observations.
    pub max_observations: usize,
    /// Maximum retained evidence records.
    pub max_evidence: usize,
    /// Maximum bytes in one observation.
    pub max_observation_bytes: usize,
    /// Maximum tracks in the domain.
    pub max_tracks: usize,
    /// Maximum patterns in the domain.
    pub max_patterns: usize,
    /// Maximum rules in the domain.
    pub max_rules: usize,
}

/// One admitted transcript or other observation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    /// Host-assigned stable observation identifier.
    pub id: String,
    /// Speaker or source label.
    pub source: String,
    /// Raw observation text.
    pub text: String,
    /// Evidence identifiers to retract explicitly.
    #[serde(default)]
    pub retract_evidence_ids: Vec<String>,
}

/// A human confirmation or rejection of one track.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Confirmation {
    /// Track being confirmed or rejected.
    pub track_id: String,
    /// `true` confirms; `false` rejects.
    pub accepted: bool,
}

/// Canonical input actions admitted together as one ordered turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SessionTurnRecord {
    /// Observation applied before the confirmation, when present.
    #[serde(default)]
    pub observation: Option<Observation>,
    /// Human decision applied after observation inference, when present.
    #[serde(default)]
    pub confirmation: Option<Confirmation>,
}

/// Input to one pure cognition-session turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionTurnInput {
    /// Bounded domain ontology and rules.
    pub domain_pack: DomainPack,
    /// Prior state supplied by the host. `None` starts a new session.
    #[serde(default)]
    pub previous_state: Option<SessionState>,
    /// Optional new observation.
    #[serde(default)]
    pub observation: Option<Observation>,
    /// Optional explicit human confirmation.
    #[serde(default)]
    pub confirmation: Option<Confirmation>,
}

/// Evidence polarity after local negation handling.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidencePolarity {
    /// Positive support.
    Positive,
    /// Explicit negation or contradiction.
    Negative,
}

/// One immutable evidence record derived from an observation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EvidenceRecord {
    /// Content-addressed evidence identifier.
    pub id: String,
    /// Source observation identifier.
    pub observation_id: String,
    /// Matcher that produced the evidence.
    pub pattern_id: String,
    /// Canonical phrase that matched the observation.
    pub matched_phrase: String,
    /// Posted proposition.
    pub proposition: String,
    /// Signed track weights declared by the matcher.
    pub track_weights: BTreeMap<String, f32>,
    /// Optional covered concept.
    #[serde(default)]
    pub concept: Option<String>,
    /// Whether the phrase was negated in the observation.
    pub polarity: EvidencePolarity,
    /// Whether the evidence remains active.
    pub active: bool,
}

/// Current scored hypothesis for one track.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TrackHypothesis {
    /// Track identifier.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Aggregated positive support.
    pub support: f32,
    /// Aggregated contradiction.
    pub contradiction: f32,
    /// Final score `support * (1 - contradiction)`.
    pub score: f32,
    /// Whether the track was explicitly rejected.
    pub eliminated: bool,
    /// Evidence identifiers contributing to the score.
    pub evidence_ids: Vec<String>,
    /// Rule identifiers that fired for this track.
    pub fired_rules: Vec<String>,
}

/// Persisted session state supplied on the next turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionState {
    /// State schema version.
    pub schema_version: String,
    /// Monotonic turn number.
    pub turn: u64,
    /// Hash of the domain pack used by the session.
    pub domain_pack_hash: String,
    /// Hash of the previous state, if any.
    #[serde(default)]
    pub previous_state_hash: Option<String>,
    /// Canonical ordered ledger from which the full state is replayed.
    pub turns: Vec<SessionTurnRecord>,
    /// Admitted observations in order, derived from the turn ledger.
    pub observations: Vec<Observation>,
    /// Immutable evidence records with explicit active flags.
    pub evidence: Vec<EvidenceRecord>,
    /// Explicitly rejected tracks, derived from confirmation turns.
    pub rejected_tracks: BTreeSet<String>,
    /// Current ranked hypotheses.
    pub hypotheses: Vec<TrackHypothesis>,
    /// Committed track, if the commitment gate passed.
    #[serde(default)]
    pub committed_track: Option<String>,
    /// Current workflow phase identifier.
    pub phase: String,
    /// Concepts covered for the current track.
    pub covered_concepts: Vec<String>,
    /// Concepts still missing for the current track.
    pub missing_concepts: Vec<String>,
    /// Track awaiting human confirmation.
    #[serde(default)]
    pub pending_confirmation: Option<String>,
    /// Content hash over the entire state with this field blanked.
    pub state_hash: String,
}

/// UI-facing projection produced by the kernel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionProjection {
    /// Current committed track or leading hypothesis.
    #[serde(default)]
    pub current_track: Option<String>,
    /// Ranked hypotheses.
    pub hypotheses: Vec<TrackHypothesis>,
    /// Covered concepts.
    pub covered_concepts: Vec<String>,
    /// Missing concepts.
    pub missing_concepts: Vec<String>,
    /// Current phase identifier.
    pub phase: String,
    /// Current phase label.
    pub phase_label: String,
    /// Track awaiting a yes/no confirmation.
    #[serde(default)]
    pub pending_confirmation: Option<String>,
    /// Whether the session has completed all phases.
    pub complete: bool,
}

/// Tamper-evident receipt for one session turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SessionReceipt {
    /// Hash of the full turn input.
    pub input_hash: String,
    /// Prior-state hash or all-zero genesis marker.
    pub previous_state_hash: String,
    /// Domain-pack hash.
    pub domain_pack_hash: String,
    /// Hash of the output payload before the receipt is attached.
    pub output_hash: String,
    /// Domain-separated receipt hash over all preceding fields.
    pub combined_hash: String,
}

/// Successful output from one session turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionTurnOutput {
    /// Next state to persist and supply on the next call.
    pub state: SessionState,
    /// UI-facing deterministic projection.
    pub projection: SessionProjection,
    /// Inference trace for the newly admitted turn.
    pub inference_trace: Vec<TraceStep>,
    /// OCEL 2.0 log derived from the new turn's inference trace.
    pub ocel_log: serde_json::Value,
    /// Tamper-evident turn receipt.
    pub receipt: SessionReceipt,
}

/// Typed refusal from the cognition-session kernel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, thiserror::Error)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionError {
    /// Boundary input was not valid session JSON.
    #[error("malformed session input: {reason}")]
    MalformedInput {
        /// Parser or schema error.
        reason: String,
    },
    /// Boundary input exceeded the hard WASM cap.
    #[error("session input exceeds the hard byte cap")]
    InputTooLarge,
    /// No observation or confirmation was supplied.
    #[error("a session turn requires an observation or confirmation")]
    EmptyTurn,
    /// An observation had no text and no evidence retractions.
    #[error("an observation requires text or evidence retractions")]
    EmptyObservation,
    /// Domain pack violates a declared invariant.
    #[error("invalid domain pack: {reason}")]
    InvalidDomain {
        /// Violation description.
        reason: String,
    },
    /// The prior state hash does not recompute.
    #[error("prior state hash mismatch")]
    StateHashMismatch,
    /// The prior state is internally inconsistent with its canonical turn ledger.
    #[error("invalid prior state: {reason}")]
    InvalidState {
        /// Invariant violation.
        reason: String,
    },
    /// The prior state belongs to another domain pack.
    #[error("prior state domain-pack hash mismatch")]
    DomainPackMismatch,
    /// An observation exceeds the configured bound.
    #[error("observation exceeds configured byte bound")]
    ObservationTooLarge,
    /// The session exceeded a declared resource bound.
    #[error("session resource cap exceeded: {resource}")]
    ResourceCap {
        /// Bounded resource name.
        resource: String,
    },
    /// An observation identifier was reused with different content.
    #[error("observation id reused with different content: {id}")]
    ObservationIdConflict {
        /// Conflicting observation identifier.
        id: String,
    },
    /// A retraction referred to unknown evidence.
    #[error("unknown evidence retraction: {id}")]
    UnknownEvidence {
        /// Missing evidence identifier.
        id: String,
    },
    /// A confirmation referred to an unknown track.
    #[error("unknown confirmation track: {id}")]
    UnknownTrack {
        /// Missing track identifier.
        id: String,
    },
    /// A confirmation or rejection did not target the pending or committed track.
    #[error("track is not pending or committed for confirmation: {id}")]
    ConfirmationNotPending {
        /// Track identifier that could not lawfully be confirmed or rejected.
        id: String,
    },
    /// A positive confirmation did not match the eligible pending track.
    #[error("track is not currently eligible for confirmation: {id}")]
    ConfirmationNotEligible {
        /// Ineligible track identifier.
        id: String,
    },
    /// Canonical serialization failed.
    #[error("canonical serialization failed: {reason}")]
    Serialization {
        /// Serialization error.
        reason: String,
    },
}
