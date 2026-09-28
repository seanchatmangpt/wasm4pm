//! Fixed whole-system objective for deterministic continuation selection.
//!
//! The objective is intentionally not caller-configurable. Callers contribute
//! observations and candidate continuations; they do not supply weights, personas,
//! stakeholder preferences, or claimed authority that can redefine the telos.
//!
//! Design rule: teleologically closed, epistemically open.
//! - The objective is fixed.
//! - Evidence may challenge any model or candidate.
//! - Preference and self-asserted authority remain observations, not authority.
//! - DfCM preserves the conformant feasible set until admitted evidence supports
//!   one deterministic continuation.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::fmt;

/// Stable identifier for the canonical whole-system objective.
pub const CANONICAL_OBJECTIVE_ID: &str = "spaceship-earth-v1";

/// Fixed, non-configurable whole-system objective.
///
/// Construction is sealed so downstream callers cannot inject alternate weights
/// while still claiming this objective identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CanonicalObjective {
    _sealed: (),
}

impl CanonicalObjective {
    /// Return the one canonical objective used by this planner surface.
    #[must_use]
    pub const fn spaceship_earth() -> Self {
        Self { _sealed: () }
    }

    /// Stable objective identifier bound into selection receipts.
    #[must_use]
    pub const fn id(self) -> &'static str {
        CANONICAL_OBJECTIVE_ID
    }

    /// Select exactly one continuation from an admitted candidate set.
    ///
    /// Ordering is lexicographic, not a caller-supplied weighted sum:
    /// viability > regeneration > humanity > optionality > ephemeralization > stability.
    /// Equal objective scores are resolved by canonical candidate id ordering so
    /// arbitrary human preference cannot leak into the decision.
    pub fn select(
        self,
        candidates: &[ContinuationCandidate],
        external_signals: &[ExternalSignal],
    ) -> Result<SelectionReceipt, SelectionRefusal> {
        validate_candidates(candidates)?;

        let candidate_ids: BTreeSet<&str> = candidates.iter().map(|c| c.id.as_str()).collect();
        let mut falsified_targets = BTreeSet::new();
        let mut admitted_falsifier_ids = Vec::new();

        for signal in external_signals {
            if !candidate_ids.contains(signal.target_candidate_id.as_str()) {
                continue;
            }
            if classify_external_signal(signal) == ExternalSignalDisposition::AdmittedFalsifier {
                falsified_targets.insert(signal.target_candidate_id.clone());
                admitted_falsifier_ids.push(signal.id.clone());
            }
        }
        admitted_falsifier_ids.sort();

        let selected = candidates
            .iter()
            .filter(|candidate| !falsified_targets.contains(&candidate.id))
            .max_by(|left, right| compare_candidate(left, right))
            .ok_or(SelectionRefusal::NoAdmissibleContinuation)?;

        let mut rejected_candidate_ids: Vec<String> = falsified_targets.into_iter().collect();
        rejected_candidate_ids.sort();

        let subject_hash = hash_selection_subject(
            self,
            candidates,
            external_signals,
            &selected.id,
            &admitted_falsifier_ids,
        );

        Ok(SelectionReceipt {
            objective_id: self.id().to_string(),
            selected_candidate_id: selected.id.clone(),
            selected_score: selected.score,
            rejected_candidate_ids,
            admitted_falsifier_ids,
            subject_hash,
        })
    }
}

/// Evidence standing. Only `Admitted` or stronger evidence may establish a
/// candidate or falsifier in the canonical selector.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum EvidenceStanding {
    /// Raw observation; useful for inquiry but not yet admissible for selection.
    Observed,
    /// Canonically admitted evidence.
    Admitted,
    /// Evidence tied to a qualified artifact or policy.
    Qualified,
    /// Executed consequence with verification evidence.
    Verified,
}

/// Provenance reference for one decision-relevant claim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceRef {
    /// Stable evidence/receipt identifier.
    pub id: String,
    /// Strongest standing actually reached.
    pub standing: EvidenceStanding,
}

/// Lexicographic whole-system score for one continuation.
///
/// Larger is better in every dimension. Field order is semantic precedence:
/// viability > regeneration > humanity > optionality > ephemeralization > stability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ContinuationScore {
    /// Compatibility with physical and long-horizon system viability.
    pub viability: i64,
    /// Preservation or increase of regenerative capacity.
    pub regeneration: i64,
    /// Whole-humanity benefit rather than narrow subsystem advantage.
    pub humanity: i64,
    /// Future lawful maneuver preserved after commitment.
    pub optionality: i64,
    /// Useful consequence per unit matter, energy, time, complexity, and cognition.
    pub ephemeralization: i64,
    /// Conversion of recurring complexity into predictable infrastructure.
    pub stability: i64,
}

/// One candidate continuation presented to the fixed objective.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContinuationCandidate {
    /// Stable canonical identifier used for deterministic tie-breaking.
    pub id: String,
    /// Whole-system score under the fixed dimension order.
    pub score: ContinuationScore,
    /// Evidence supporting the candidate and its score.
    pub evidence: Vec<EvidenceRef>,
}

/// External information that may arrive from members, outsiders, institutions,
/// users, sensors, or any other source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExternalSignal {
    /// Stable signal identifier.
    pub id: String,
    /// Candidate whose model is being discussed or challenged.
    pub target_candidate_id: String,
    /// Semantic kind of signal.
    pub kind: ExternalSignalKind,
    /// Human-readable statement. This field has no authority by itself.
    pub statement: String,
    /// Evidence offered in support of the signal.
    pub evidence: Vec<EvidenceRef>,
}

/// External signal kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExternalSignalKind {
    /// Approval, disapproval, popularity, or stakeholder preference.
    Preference,
    /// A claim that the speaker possesses authority, including sacred or institutional language.
    ClaimedAuthority,
    /// A falsifiable claim that a candidate violates an invariant or is factually wrong.
    Falsifier,
}

/// How an external signal participates in selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExternalSignalDisposition {
    /// The signal may be observed or displayed but has no control authority.
    NonAuthoritative,
    /// A falsifier was asserted without admitted evidence.
    Unsupported,
    /// The falsifier carries admitted-or-stronger evidence and challenges the model.
    AdmittedFalsifier,
}

/// Classify an external signal without changing the fixed objective.
#[must_use]
pub fn classify_external_signal(signal: &ExternalSignal) -> ExternalSignalDisposition {
    match signal.kind {
        ExternalSignalKind::Preference | ExternalSignalKind::ClaimedAuthority => {
            ExternalSignalDisposition::NonAuthoritative
        }
        ExternalSignalKind::Falsifier => {
            if !signal.evidence.is_empty()
                && signal
                    .evidence
                    .iter()
                    .all(|evidence| evidence.standing >= EvidenceStanding::Admitted)
            {
                ExternalSignalDisposition::AdmittedFalsifier
            } else {
                ExternalSignalDisposition::Unsupported
            }
        }
    }
}

/// Deterministic receipt for one canonical selection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectionReceipt {
    /// Fixed objective identity.
    pub objective_id: String,
    /// Exactly one selected continuation.
    pub selected_candidate_id: String,
    /// Score of the selected continuation.
    pub selected_score: ContinuationScore,
    /// Candidates excluded by admitted falsifiers.
    pub rejected_candidate_ids: Vec<String>,
    /// Falsifier signals that actually affected selection.
    pub admitted_falsifier_ids: Vec<String>,
    /// BLAKE3 identity of the admitted selection subject.
    pub subject_hash: String,
}

/// Typed refusal from the canonical selector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionRefusal {
    /// No candidate was supplied.
    EmptyCandidateSet,
    /// Candidate identifiers must be non-empty.
    MissingCandidateId,
    /// Candidate identifiers must be unique.
    DuplicateCandidateId(String),
    /// Every candidate must have admitted-or-stronger evidence before final selection.
    UnadmittedCandidate(String),
    /// Every candidate must carry at least one evidence reference.
    MissingCandidateEvidence(String),
    /// All candidates were removed by admitted falsifiers.
    NoAdmissibleContinuation,
}

impl fmt::Display for SelectionRefusal {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCandidateSet => formatter.write_str("canonical selection requires candidates"),
            Self::MissingCandidateId => formatter.write_str("candidate id must not be empty"),
            Self::DuplicateCandidateId(id) => write!(formatter, "duplicate candidate id: {id}"),
            Self::UnadmittedCandidate(id) => {
                write!(formatter, "candidate {id} contains evidence below Admitted standing")
            }
            Self::MissingCandidateEvidence(id) => {
                write!(formatter, "candidate {id} has no evidence")
            }
            Self::NoAdmissibleContinuation => {
                formatter.write_str("all candidates were removed by admitted falsifiers")
            }
        }
    }
}

impl std::error::Error for SelectionRefusal {}

fn validate_candidates(candidates: &[ContinuationCandidate]) -> Result<(), SelectionRefusal> {
    if candidates.is_empty() {
        return Err(SelectionRefusal::EmptyCandidateSet);
    }

    let mut ids = BTreeSet::new();
    for candidate in candidates {
        if candidate.id.trim().is_empty() {
            return Err(SelectionRefusal::MissingCandidateId);
        }
        if !ids.insert(candidate.id.clone()) {
            return Err(SelectionRefusal::DuplicateCandidateId(candidate.id.clone()));
        }
        if candidate.evidence.is_empty() {
            return Err(SelectionRefusal::MissingCandidateEvidence(candidate.id.clone()));
        }
        if candidate
            .evidence
            .iter()
            .any(|evidence| evidence.standing < EvidenceStanding::Admitted)
        {
            return Err(SelectionRefusal::UnadmittedCandidate(candidate.id.clone()));
        }
    }
    Ok(())
}

fn compare_candidate(left: &ContinuationCandidate, right: &ContinuationCandidate) -> Ordering {
    left.score
        .cmp(&right.score)
        // On exact score equality, the lexicographically smaller canonical id wins.
        .then_with(|| right.id.cmp(&left.id))
}

fn hash_selection_subject(
    objective: CanonicalObjective,
    candidates: &[ContinuationCandidate],
    signals: &[ExternalSignal],
    selected_candidate_id: &str,
    admitted_falsifier_ids: &[String],
) -> String {
    let mut hasher = blake3::Hasher::new();
    feed(&mut hasher, objective.id());

    let mut ordered_candidates: Vec<&ContinuationCandidate> = candidates.iter().collect();
    ordered_candidates.sort_by(|left, right| left.id.cmp(&right.id));
    for candidate in ordered_candidates {
        feed(&mut hasher, &candidate.id);
        for value in [
            candidate.score.viability,
            candidate.score.regeneration,
            candidate.score.humanity,
            candidate.score.optionality,
            candidate.score.ephemeralization,
            candidate.score.stability,
        ] {
            hasher.update(&value.to_le_bytes());
        }

        let mut evidence: Vec<&EvidenceRef> = candidate.evidence.iter().collect();
        evidence.sort_by(|left, right| left.id.cmp(&right.id));
        for item in evidence {
            feed(&mut hasher, &item.id);
            hasher.update(&[item.standing as u8]);
        }
    }

    // Only admitted falsifiers affect the decision subject. Preferences and
    // claimed authority are deliberately excluded from the control identity.
    let admitted: BTreeSet<&str> = admitted_falsifier_ids.iter().map(String::as_str).collect();
    let mut decision_signals: Vec<&ExternalSignal> = signals
        .iter()
        .filter(|signal| admitted.contains(signal.id.as_str()))
        .collect();
    decision_signals.sort_by(|left, right| left.id.cmp(&right.id));
    for signal in decision_signals {
        feed(&mut hasher, &signal.id);
        feed(&mut hasher, &signal.target_candidate_id);
        let mut evidence: Vec<&EvidenceRef> = signal.evidence.iter().collect();
        evidence.sort_by(|left, right| left.id.cmp(&right.id));
        for item in evidence {
            feed(&mut hasher, &item.id);
            hasher.update(&[item.standing as u8]);
        }
    }

    feed(&mut hasher, selected_candidate_id);
    hasher.finalize().to_hex().to_string()
}

fn feed(hasher: &mut blake3::Hasher, value: &str) {
    hasher.update(&(value.len() as u64).to_le_bytes());
    hasher.update(value.as_bytes());
}
