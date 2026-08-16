//! Raw observation → admitted fact (ARD §3.3 Admission Engine).
//!
//! This is the literal bootstrap / first-mile / chicken-and-egg gate: an
//! empty blackboard is not an amnesty for a malformed first observation, and
//! nothing enters [`crate::interview::blackboard::Blackboard`] except through
//! [`AdmissionEngine::admit`].

/// A raw, unadmitted observation.
#[derive(Debug, Clone)]
pub struct RawObservation {
    /// Caller-assigned identifier.
    pub id: String,
    /// Observation source, e.g. `"transcript"`, `"editor"`.
    pub source: String,
    /// Observation text.
    pub text: String,
}

/// Why an observation was refused admission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefusalReason {
    /// The observation failed basic schema validity (e.g. empty text).
    SchemaInvalid,
    /// The observation's confidence fell below the admission floor.
    BelowConfidenceFloor,
    /// The observation id collides with one already admitted.
    ObservationIdConflict,
}

/// A successfully admitted fact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdmittedFact {
    /// 1-based position among admitted facts.
    pub sequence: u64,
    /// Original observation id.
    pub id: String,
    /// Observation source.
    pub source: String,
    /// Observation text.
    pub text: String,
    /// BLAKE3 hex digest of `(sequence, id, source, text)`.
    pub fact_hash: String,
}

const FACT_HASH_DOMAIN: &str = "wasm4pm.cognition.interview.admitted_fact.v1";

fn compute_fact_hash(sequence: u64, id: &str, source: &str, text: &str) -> String {
    let mut hasher = blake3::Hasher::new_derive_key(FACT_HASH_DOMAIN);
    hasher.update(&sequence.to_le_bytes());
    hasher.update(id.as_bytes());
    hasher.update(source.as_bytes());
    hasher.update(text.as_bytes());
    hasher.finalize().to_hex().to_string()
}

/// Gate between raw observations and admitted facts.
#[derive(Debug, Clone, Copy)]
pub struct AdmissionEngine {
    confidence_floor: f32,
}

impl Default for AdmissionEngine {
    fn default() -> Self {
        Self::new(0.0)
    }
}

impl AdmissionEngine {
    /// Construct an engine with the given minimum admissible confidence.
    pub fn new(confidence_floor: f32) -> Self {
        Self { confidence_floor }
    }

    /// Attempt to admit `observation` against `already_admitted` (the
    /// blackboard's current admitted-fact count and ids), independent of
    /// whether this is the very first admission (first mile) or the Nth.
    pub fn admit(
        &self,
        already_admitted: &[AdmittedFact],
        observation: &RawObservation,
        confidence: f32,
    ) -> Result<AdmittedFact, RefusalReason> {
        if observation.text.trim().is_empty() {
            return Err(RefusalReason::SchemaInvalid);
        }
        if confidence < self.confidence_floor {
            return Err(RefusalReason::BelowConfidenceFloor);
        }
        if already_admitted
            .iter()
            .any(|fact| fact.id == observation.id)
        {
            return Err(RefusalReason::ObservationIdConflict);
        }
        let sequence = already_admitted.len() as u64 + 1;
        let fact_hash = compute_fact_hash(
            sequence,
            &observation.id,
            &observation.source,
            &observation.text,
        );
        Ok(AdmittedFact {
            sequence,
            id: observation.id.clone(),
            source: observation.source.clone(),
            text: observation.text.clone(),
            fact_hash,
        })
    }
}
