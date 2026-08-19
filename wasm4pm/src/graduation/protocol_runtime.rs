//! Authority-separated federated consequence runtime.
//!
//! This is the execution-side machinery for the neutral protocol type law being
//! defined in `wasm4pm-compat`. The engine intentionally depends only on small
//! adapter traits here until that compat type law is published through the
//! repository's required crates.io boundary. The later compat adapter must be a
//! zero-policy mapping into these views.
//!
//! Runtime law:
//!
//! `SELECT != CONSTRUCT != DO`
//!
//! - SELECT and CONSTRUCT manufacture deterministic reversible evidence and
//!   have no broker in their call path.
//! - DO requires an externally verified authority decision for the exact
//!   capability and exact subject.
//! - A successful broker return is itself receipted; raw success is not a valid
//!   broker result.
//! - wasm4pm then manufactures a BLAKE3 protocol receipt and projects the
//!   observed consequence into OCEL.
//! - time is an explicit input. Hidden wall clocks do not influence receipt
//!   identity.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::models::{AttributeValue, OCELEvent, OCELEventObjectRef, OCEL};

/// Read-only engine view of a protocol intent.
///
/// The canonical concrete intent type lives in `wasm4pm-compat`; this trait is
/// only the runtime seam needed while wasm4pm remains bound to the currently
/// published crates.io release.
pub trait IntentView {
    fn capability_id(&self) -> &str;
    fn semantic_digest(&self) -> &str;
    fn subject_id(&self) -> &str;
    fn subject_digest(&self) -> &str;
    fn input_digest(&self) -> &str;
}

/// Read-only engine view of an externally supplied authority decision.
pub trait AuthorityDecisionView {
    fn authority_id(&self) -> &str;
    fn capability_id(&self) -> &str;
    fn subject_digest(&self) -> &str;
    fn decision_digest(&self) -> &str;
}

/// Read-only engine view of the receiptability contract required before DO.
pub trait ReceiptRequirementView {
    fn receipt_version(&self) -> &str;
    fn digest_algorithm(&self) -> &str;
    fn replay_contract(&self) -> &str;
    fn parent_receipt_digest(&self) -> Option<&str>;
}

/// Runtime phase for reversible evidence. DO never uses this record type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReversiblePhase {
    Select,
    Construct,
}

/// Deterministic evidence for a reversible SELECT or CONSTRUCT transition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReversibleReceipt {
    pub phase: ReversiblePhase,
    pub capability_id: String,
    pub semantic_digest: String,
    pub subject_id: String,
    pub subject_digest: String,
    pub input_digest: String,
    pub output_digest: String,
    pub observed_at: String,
    pub actuated: bool,
    pub receipt_digest: String,
}

impl ReversibleReceipt {
    #[must_use]
    pub fn verify(&self) -> bool {
        !self.actuated && self.receipt_digest == reversible_digest(self)
    }
}

/// Evidence returned by an external authority verifier.
///
/// There is intentionally no deserializer for this token. Runtime authority
/// evidence must be manufactured by a verifier through [`AuthorityEvidence::try_new`]
/// and is rebound to the exact intent before DO.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AuthorityEvidence {
    authority_id: String,
    capability_id: String,
    subject_digest: String,
    decision_digest: String,
    verification_digest: String,
}

impl AuthorityEvidence {
    pub fn try_new(
        authority_id: impl Into<String>,
        capability_id: impl Into<String>,
        subject_digest: impl Into<String>,
        decision_digest: impl Into<String>,
        verification_digest: impl Into<String>,
    ) -> Result<Self, RuntimeRefusal> {
        let value = Self {
            authority_id: authority_id.into(),
            capability_id: capability_id.into(),
            subject_digest: subject_digest.into(),
            decision_digest: decision_digest.into(),
            verification_digest: verification_digest.into(),
        };
        if value.authority_id.trim().is_empty() {
            return Err(RuntimeRefusal::MissingAuthorityId);
        }
        if value.capability_id.trim().is_empty() {
            return Err(RuntimeRefusal::MissingCapabilityId);
        }
        if value.subject_digest.trim().is_empty() {
            return Err(RuntimeRefusal::MissingSubjectDigest);
        }
        if value.decision_digest.trim().is_empty() {
            return Err(RuntimeRefusal::MissingAuthorityDecisionDigest);
        }
        if value.verification_digest.trim().is_empty() {
            return Err(RuntimeRefusal::MissingAuthorityVerificationDigest);
        }
        Ok(value)
    }

    #[must_use]
    pub fn authority_id(&self) -> &str {
        &self.authority_id
    }

    #[must_use]
    pub fn verification_digest(&self) -> &str {
        &self.verification_digest
    }
}

/// External authority-verification boundary.
///
/// Implementations may consult signatures, policy engines, brokers, or public
/// authority sources. The runtime never infers authority from a planner,
/// transport, generated artifact, or capability name.
pub trait AuthorityVerifier<I: IntentView, A: AuthorityDecisionView> {
    fn verify(&self, intent: &I, decision: &A) -> Result<AuthorityEvidence, String>;
}

/// Exact DO request admitted only after structural binding and external
/// authority verification.
#[derive(Debug)]
pub struct AdmittedDo<'a, I: IntentView> {
    intent: &'a I,
    authority: AuthorityEvidence,
}

impl<'a, I: IntentView> AdmittedDo<'a, I> {
    #[must_use]
    pub fn intent(&self) -> &'a I {
        self.intent
    }

    #[must_use]
    pub fn authority(&self) -> &AuthorityEvidence {
        &self.authority
    }
}

/// Broker-provided evidence for one observed consequence.
///
/// There is intentionally no deserializer. External broker implementations can
/// construct a success value only through [`BrokerReceipt::try_new`], which
/// requires both an observed consequence digest and a broker receipt digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BrokerReceipt {
    consequence_digest: String,
    broker_receipt_digest: String,
    changed: bool,
    cost_microunits: u64,
    external_reference: Option<String>,
}

impl BrokerReceipt {
    pub fn try_new(
        consequence_digest: impl Into<String>,
        broker_receipt_digest: impl Into<String>,
        changed: bool,
        cost_microunits: u64,
        external_reference: Option<String>,
    ) -> Result<Self, RuntimeRefusal> {
        let value = Self {
            consequence_digest: consequence_digest.into(),
            broker_receipt_digest: broker_receipt_digest.into(),
            changed,
            cost_microunits,
            external_reference,
        };
        value.validate()?;
        Ok(value)
    }

    fn validate(&self) -> Result<(), RuntimeRefusal> {
        if self.consequence_digest.trim().is_empty() {
            return Err(RuntimeRefusal::MissingConsequenceDigest);
        }
        if self.broker_receipt_digest.trim().is_empty() {
            return Err(RuntimeRefusal::MissingBrokerReceiptDigest);
        }
        Ok(())
    }

    #[must_use]
    pub fn consequence_digest(&self) -> &str {
        &self.consequence_digest
    }

    #[must_use]
    pub fn broker_receipt_digest(&self) -> &str {
        &self.broker_receipt_digest
    }

    #[must_use]
    pub const fn changed(&self) -> bool {
        self.changed
    }

    #[must_use]
    pub const fn cost_microunits(&self) -> u64 {
        self.cost_microunits
    }

    #[must_use]
    pub fn external_reference(&self) -> Option<&str> {
        self.external_reference.as_deref()
    }
}

/// Exclusive consequential boundary used by this protocol runtime.
///
/// Implementations are responsible for preserving their narrower BRCE law. A
/// successful return must already carry a [`BrokerReceipt`]; returning raw
/// effect bytes or an unreceipted success is not representable by this trait.
pub trait ConsequenceBroker<I: IntentView> {
    fn actuate(&mut self, request: &AdmittedDo<'_, I>) -> Result<BrokerReceipt, String>;
}

/// Protocol receipt manufactured over one observed consequential result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtocolReceipt {
    pub receipt_version: String,
    pub capability_id: String,
    pub semantic_digest: String,
    pub subject_id: String,
    pub subject_digest: String,
    pub input_digest: String,
    pub authority_id: String,
    pub authority_decision_digest: String,
    pub authority_verification_digest: String,
    pub broker_receipt_digest: String,
    pub consequence_digest: String,
    pub changed: bool,
    pub cost_microunits: u64,
    pub observed_at: String,
    pub replay_contract: String,
    pub parent_receipt_digest: Option<String>,
    pub receipt_digest: String,
}

impl ProtocolReceipt {
    pub fn verify(&self) -> Result<(), RuntimeRefusal> {
        for (field, value) in [
            ("receipt_version", self.receipt_version.as_str()),
            ("capability_id", self.capability_id.as_str()),
            ("semantic_digest", self.semantic_digest.as_str()),
            ("subject_id", self.subject_id.as_str()),
            ("subject_digest", self.subject_digest.as_str()),
            ("input_digest", self.input_digest.as_str()),
            ("authority_id", self.authority_id.as_str()),
            (
                "authority_decision_digest",
                self.authority_decision_digest.as_str(),
            ),
            (
                "authority_verification_digest",
                self.authority_verification_digest.as_str(),
            ),
            ("broker_receipt_digest", self.broker_receipt_digest.as_str()),
            ("consequence_digest", self.consequence_digest.as_str()),
            ("observed_at", self.observed_at.as_str()),
            ("replay_contract", self.replay_contract.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(RuntimeRefusal::PersistedReceiptMalformed {
                    field: field.to_owned(),
                });
            }
        }
        if !is_blake3_hex(&self.receipt_digest) {
            return Err(RuntimeRefusal::InvalidReceiptDigestEncoding);
        }
        if self.receipt_digest != protocol_receipt_digest(self) {
            return Err(RuntimeRefusal::ReceiptDigestMismatch);
        }
        Ok(())
    }
}

/// Completed consequential result. A successful runtime return always carries
/// the broker receipt, protocol receipt, and OCEL projection together.
#[derive(Debug, Clone, Serialize)]
pub struct DoOutcome {
    pub broker_receipt: BrokerReceipt,
    pub receipt: ProtocolReceipt,
    pub ocel_event: OCELEvent,
}

/// Authority-separated runtime kernel.
#[derive(Debug, Default, Clone, Copy)]
pub struct ProtocolRuntime;

impl ProtocolRuntime {
    /// Manufacture deterministic SELECT evidence. There is intentionally no
    /// broker or authority-verifier argument on this path.
    pub fn record_select<I: IntentView>(
        intent: &I,
        output_digest: impl Into<String>,
        observed_at: impl Into<String>,
    ) -> Result<ReversibleReceipt, RuntimeRefusal> {
        reversible_receipt(
            ReversiblePhase::Select,
            intent,
            output_digest.into(),
            observed_at.into(),
        )
    }

    /// Manufacture deterministic CONSTRUCT evidence. There is intentionally no
    /// broker or authority-verifier argument on this path.
    pub fn record_construct<I: IntentView>(
        intent: &I,
        output_digest: impl Into<String>,
        observed_at: impl Into<String>,
    ) -> Result<ReversibleReceipt, RuntimeRefusal> {
        reversible_receipt(
            ReversiblePhase::Construct,
            intent,
            output_digest.into(),
            observed_at.into(),
        )
    }

    /// Execute one consequential DO through the exclusive broker boundary.
    ///
    /// Fail-closed order: exact intent -> authority binding -> receiptability ->
    /// external authority verification -> verified binding -> one broker call ->
    /// broker receipt validation -> protocol receipt -> OCEL projection.
    pub fn execute_do<I, A, R, V, B>(
        intent: &I,
        decision: &A,
        receipt_requirement: &R,
        verifier: &V,
        broker: &mut B,
        observed_at: impl Into<String>,
    ) -> Result<DoOutcome, RuntimeRefusal>
    where
        I: IntentView,
        A: AuthorityDecisionView,
        R: ReceiptRequirementView,
        V: AuthorityVerifier<I, A>,
        B: ConsequenceBroker<I>,
    {
        validate_intent(intent)?;
        validate_decision_binding(intent, decision)?;
        validate_receipt_requirement(receipt_requirement)?;
        let observed_at = observed_at.into();
        if observed_at.trim().is_empty() {
            return Err(RuntimeRefusal::MissingObservedAt);
        }

        let authority = verifier.verify(intent, decision).map_err(|reason| {
            RuntimeRefusal::AuthorityVerifierRefused { reason }
        })?;
        validate_verified_authority(intent, decision, &authority)?;

        let request = AdmittedDo { intent, authority };
        let broker_receipt = broker
            .actuate(&request)
            .map_err(|reason| RuntimeRefusal::BrokerRefused { reason })?;
        broker_receipt.validate()?;

        let mut receipt = ProtocolReceipt {
            receipt_version: receipt_requirement.receipt_version().to_owned(),
            capability_id: intent.capability_id().to_owned(),
            semantic_digest: intent.semantic_digest().to_owned(),
            subject_id: intent.subject_id().to_owned(),
            subject_digest: intent.subject_digest().to_owned(),
            input_digest: intent.input_digest().to_owned(),
            authority_id: decision.authority_id().to_owned(),
            authority_decision_digest: decision.decision_digest().to_owned(),
            authority_verification_digest: request.authority.verification_digest.clone(),
            broker_receipt_digest: broker_receipt.broker_receipt_digest.clone(),
            consequence_digest: broker_receipt.consequence_digest.clone(),
            changed: broker_receipt.changed,
            cost_microunits: broker_receipt.cost_microunits,
            observed_at,
            replay_contract: receipt_requirement.replay_contract().to_owned(),
            parent_receipt_digest: receipt_requirement
                .parent_receipt_digest()
                .map(ToOwned::to_owned),
            receipt_digest: String::new(),
        };
        receipt.receipt_digest = protocol_receipt_digest(&receipt);
        receipt.verify()?;

        let ocel_event = protocol_receipt_to_ocel_event(&receipt);
        Ok(DoOutcome {
            broker_receipt,
            receipt,
            ocel_event,
        })
    }
}

/// Verify a complete receipt chain from genesis to tip.
pub fn verify_receipt_chain(chain: &[ProtocolReceipt]) -> Result<(), RuntimeRefusal> {
    for (index, receipt) in chain.iter().enumerate() {
        receipt.verify()?;
        match index {
            0 if receipt.parent_receipt_digest.is_some() => {
                return Err(RuntimeRefusal::ReceiptChainHasUnknownParent)
            }
            0 => {}
            _ => {
                let expected = &chain[index - 1].receipt_digest;
                if receipt.parent_receipt_digest.as_deref() != Some(expected.as_str()) {
                    return Err(RuntimeRefusal::ReceiptChainMismatch { index });
                }
            }
        }
    }
    Ok(())
}

/// Project a verified protocol receipt into a deterministic OCEL event.
#[must_use]
pub fn protocol_receipt_to_ocel_event(receipt: &ProtocolReceipt) -> OCELEvent {
    let mut attributes = BTreeMap::new();
    attributes.insert(
        "protocol:capability_id".to_owned(),
        AttributeValue::String(receipt.capability_id.clone()),
    );
    attributes.insert(
        "protocol:semantic_digest".to_owned(),
        AttributeValue::String(receipt.semantic_digest.clone()),
    );
    attributes.insert(
        "protocol:subject_digest".to_owned(),
        AttributeValue::String(receipt.subject_digest.clone()),
    );
    attributes.insert(
        "protocol:input_digest".to_owned(),
        AttributeValue::String(receipt.input_digest.clone()),
    );
    attributes.insert(
        "protocol:authority_id".to_owned(),
        AttributeValue::String(receipt.authority_id.clone()),
    );
    attributes.insert(
        "protocol:authority_decision_digest".to_owned(),
        AttributeValue::String(receipt.authority_decision_digest.clone()),
    );
    attributes.insert(
        "protocol:broker_receipt_digest".to_owned(),
        AttributeValue::String(receipt.broker_receipt_digest.clone()),
    );
    attributes.insert(
        "protocol:consequence_digest".to_owned(),
        AttributeValue::String(receipt.consequence_digest.clone()),
    );
    attributes.insert(
        "protocol:receipt_digest".to_owned(),
        AttributeValue::String(receipt.receipt_digest.clone()),
    );
    attributes.insert(
        "protocol:changed".to_owned(),
        AttributeValue::Boolean(receipt.changed),
    );
    attributes.insert(
        "protocol:cost_microunits".to_owned(),
        AttributeValue::Int(receipt.cost_microunits as i64),
    );
    if let Some(parent) = &receipt.parent_receipt_digest {
        attributes.insert(
            "protocol:parent_receipt_digest".to_owned(),
            AttributeValue::String(parent.clone()),
        );
    }

    OCELEvent {
        id: format!("receipt:{}", receipt.receipt_digest),
        event_type: "protocol.consequence.do".to_owned(),
        timestamp: receipt.observed_at.clone(),
        attributes,
        object_ids: vec![receipt.subject_id.clone()],
        object_refs: vec![OCELEventObjectRef {
            object_id: receipt.subject_id.clone(),
            qualifier: "subject".to_owned(),
        }],
    }
}

/// Append a protocol event only when the referenced subject already exists as
/// an OCEL object. The runtime never fabricates a domain object to make an event
/// appear valid. The event is regenerated from the verified receipt so callers
/// cannot tamper the cached projection inside [`DoOutcome`].
pub fn append_protocol_outcome(
    log: &mut OCEL,
    outcome: &DoOutcome,
) -> Result<(), RuntimeRefusal> {
    outcome.receipt.verify()?;
    if !log
        .objects
        .iter()
        .any(|object| object.id == outcome.receipt.subject_id)
    {
        return Err(RuntimeRefusal::OcelSubjectMissing {
            subject_id: outcome.receipt.subject_id.clone(),
        });
    }

    let event = protocol_receipt_to_ocel_event(&outcome.receipt);
    if log.events.iter().any(|existing| existing.id == event.id) {
        return Err(RuntimeRefusal::DuplicateOcelEvent { event_id: event.id });
    }
    if !log
        .event_types
        .iter()
        .any(|event_type| event_type == &event.event_type)
    {
        log.event_types.push(event.event_type.clone());
        log.event_types.sort();
    }
    log.events.push(event);
    log.events.sort_by(|left, right| {
        left.timestamp
            .cmp(&right.timestamp)
            .then(left.id.cmp(&right.id))
    });
    Ok(())
}

fn reversible_receipt<I: IntentView>(
    phase: ReversiblePhase,
    intent: &I,
    output_digest: String,
    observed_at: String,
) -> Result<ReversibleReceipt, RuntimeRefusal> {
    validate_intent(intent)?;
    if output_digest.trim().is_empty() {
        return Err(RuntimeRefusal::MissingOutputDigest);
    }
    if observed_at.trim().is_empty() {
        return Err(RuntimeRefusal::MissingObservedAt);
    }
    let mut receipt = ReversibleReceipt {
        phase,
        capability_id: intent.capability_id().to_owned(),
        semantic_digest: intent.semantic_digest().to_owned(),
        subject_id: intent.subject_id().to_owned(),
        subject_digest: intent.subject_digest().to_owned(),
        input_digest: intent.input_digest().to_owned(),
        output_digest,
        observed_at,
        actuated: false,
        receipt_digest: String::new(),
    };
    receipt.receipt_digest = reversible_digest(&receipt);
    Ok(receipt)
}

fn validate_intent<I: IntentView>(intent: &I) -> Result<(), RuntimeRefusal> {
    if intent.capability_id().trim().is_empty() {
        return Err(RuntimeRefusal::MissingCapabilityId);
    }
    if intent.semantic_digest().trim().is_empty() {
        return Err(RuntimeRefusal::MissingSemanticDigest);
    }
    if intent.subject_id().trim().is_empty() {
        return Err(RuntimeRefusal::MissingSubjectId);
    }
    if intent.subject_digest().trim().is_empty() {
        return Err(RuntimeRefusal::MissingSubjectDigest);
    }
    if intent.input_digest().trim().is_empty() {
        return Err(RuntimeRefusal::MissingInputDigest);
    }
    Ok(())
}

fn validate_decision_binding<I: IntentView, A: AuthorityDecisionView>(
    intent: &I,
    decision: &A,
) -> Result<(), RuntimeRefusal> {
    if decision.authority_id().trim().is_empty() {
        return Err(RuntimeRefusal::MissingAuthorityId);
    }
    if decision.decision_digest().trim().is_empty() {
        return Err(RuntimeRefusal::MissingAuthorityDecisionDigest);
    }
    if decision.capability_id() != intent.capability_id() {
        return Err(RuntimeRefusal::AuthorityCapabilityMismatch);
    }
    if decision.subject_digest() != intent.subject_digest() {
        return Err(RuntimeRefusal::AuthoritySubjectMismatch);
    }
    Ok(())
}

fn validate_verified_authority<I: IntentView, A: AuthorityDecisionView>(
    intent: &I,
    decision: &A,
    evidence: &AuthorityEvidence,
) -> Result<(), RuntimeRefusal> {
    if evidence.authority_id != decision.authority_id()
        || evidence.capability_id != intent.capability_id()
        || evidence.subject_digest != intent.subject_digest()
        || evidence.decision_digest != decision.decision_digest()
    {
        return Err(RuntimeRefusal::AuthorityVerificationBindingMismatch);
    }
    if evidence.verification_digest.trim().is_empty() {
        return Err(RuntimeRefusal::MissingAuthorityVerificationDigest);
    }
    Ok(())
}

fn validate_receipt_requirement<R: ReceiptRequirementView>(
    requirement: &R,
) -> Result<(), RuntimeRefusal> {
    if requirement.receipt_version().trim().is_empty() {
        return Err(RuntimeRefusal::MissingReceiptVersion);
    }
    if requirement.digest_algorithm().trim().is_empty() {
        return Err(RuntimeRefusal::MissingReceiptDigestAlgorithm);
    }
    if requirement.digest_algorithm() != "blake3" {
        return Err(RuntimeRefusal::UnsupportedReceiptDigestAlgorithm {
            algorithm: requirement.digest_algorithm().to_owned(),
        });
    }
    if requirement.replay_contract().trim().is_empty() {
        return Err(RuntimeRefusal::MissingReplayContract);
    }
    if matches!(requirement.parent_receipt_digest(), Some(parent) if parent.trim().is_empty()) {
        return Err(RuntimeRefusal::EmptyParentReceiptDigest);
    }
    Ok(())
}

fn reversible_digest(receipt: &ReversibleReceipt) -> String {
    let phase = match receipt.phase {
        ReversiblePhase::Select => "SELECT",
        ReversiblePhase::Construct => "CONSTRUCT",
    };
    digest_fields(
        "wasm4pm.protocol.reversible.v1",
        &[
            phase,
            &receipt.capability_id,
            &receipt.semantic_digest,
            &receipt.subject_id,
            &receipt.subject_digest,
            &receipt.input_digest,
            &receipt.output_digest,
            &receipt.observed_at,
            "actuated=false",
        ],
    )
}

fn protocol_receipt_digest(receipt: &ProtocolReceipt) -> String {
    let changed = if receipt.changed {
        "changed=true"
    } else {
        "changed=false"
    };
    let cost = receipt.cost_microunits.to_string();
    let parent = receipt.parent_receipt_digest.as_deref().unwrap_or("");
    digest_fields(
        "wasm4pm.protocol.receipt.v1",
        &[
            &receipt.receipt_version,
            &receipt.capability_id,
            &receipt.semantic_digest,
            &receipt.subject_id,
            &receipt.subject_digest,
            &receipt.input_digest,
            &receipt.authority_id,
            &receipt.authority_decision_digest,
            &receipt.authority_verification_digest,
            &receipt.broker_receipt_digest,
            &receipt.consequence_digest,
            changed,
            &cost,
            &receipt.observed_at,
            &receipt.replay_contract,
            parent,
        ],
    )
}

fn digest_fields(domain: &str, fields: &[&str]) -> String {
    let mut hasher = blake3::Hasher::new();
    hash_field(&mut hasher, domain);
    for field in fields {
        hash_field(&mut hasher, field);
    }
    hasher.finalize().to_hex().to_string()
}

fn hash_field(hasher: &mut blake3::Hasher, value: &str) {
    hasher.update(&(value.len() as u64).to_le_bytes());
    hasher.update(value.as_bytes());
}

fn is_blake3_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Typed runtime refusals. A lawful refusal is successful fail-closed behavior,
/// never generic transport success.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuntimeRefusal {
    MissingCapabilityId,
    MissingSemanticDigest,
    MissingSubjectId,
    MissingSubjectDigest,
    MissingInputDigest,
    MissingOutputDigest,
    MissingObservedAt,
    MissingAuthorityId,
    MissingAuthorityDecisionDigest,
    MissingAuthorityVerificationDigest,
    AuthorityCapabilityMismatch,
    AuthoritySubjectMismatch,
    AuthorityVerificationBindingMismatch,
    AuthorityVerifierRefused { reason: String },
    MissingReceiptVersion,
    MissingReceiptDigestAlgorithm,
    UnsupportedReceiptDigestAlgorithm { algorithm: String },
    MissingReplayContract,
    EmptyParentReceiptDigest,
    BrokerRefused { reason: String },
    MissingConsequenceDigest,
    MissingBrokerReceiptDigest,
    PersistedReceiptMalformed { field: String },
    InvalidReceiptDigestEncoding,
    ReceiptDigestMismatch,
    ReceiptChainHasUnknownParent,
    ReceiptChainMismatch { index: usize },
    OcelSubjectMissing { subject_id: String },
    DuplicateOcelEvent { event_id: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::OCELObject;

    #[derive(Debug, Clone)]
    struct Intent {
        capability: String,
        semantic: String,
        subject: String,
        subject_digest: String,
        input: String,
    }

    impl IntentView for Intent {
        fn capability_id(&self) -> &str {
            &self.capability
        }

        fn semantic_digest(&self) -> &str {
            &self.semantic
        }

        fn subject_id(&self) -> &str {
            &self.subject
        }

        fn subject_digest(&self) -> &str {
            &self.subject_digest
        }

        fn input_digest(&self) -> &str {
            &self.input
        }
    }

    struct Decision {
        authority: String,
        capability: String,
        subject_digest: String,
        digest: String,
    }

    impl AuthorityDecisionView for Decision {
        fn authority_id(&self) -> &str {
            &self.authority
        }

        fn capability_id(&self) -> &str {
            &self.capability
        }

        fn subject_digest(&self) -> &str {
            &self.subject_digest
        }

        fn decision_digest(&self) -> &str {
            &self.digest
        }
    }

    struct Requirement {
        parent: Option<String>,
    }

    impl ReceiptRequirementView for Requirement {
        fn receipt_version(&self) -> &str {
            "ce-receipt/1"
        }

        fn digest_algorithm(&self) -> &str {
            "blake3"
        }

        fn replay_contract(&self) -> &str {
            "ce-replay/1"
        }

        fn parent_receipt_digest(&self) -> Option<&str> {
            self.parent.as_deref()
        }
    }

    struct ExactVerifier;

    impl AuthorityVerifier<Intent, Decision> for ExactVerifier {
        fn verify(
            &self,
            intent: &Intent,
            decision: &Decision,
        ) -> Result<AuthorityEvidence, String> {
            AuthorityEvidence::try_new(
                decision.authority_id(),
                intent.capability_id(),
                intent.subject_digest(),
                decision.decision_digest(),
                "blake3:verified-authority",
            )
            .map_err(|refusal| format!("{refusal:?}"))
        }
    }

    struct RefusingVerifier;

    impl AuthorityVerifier<Intent, Decision> for RefusingVerifier {
        fn verify(
            &self,
            _intent: &Intent,
            _decision: &Decision,
        ) -> Result<AuthorityEvidence, String> {
            Err("NO_AUTHORITY".to_owned())
        }
    }

    struct Broker {
        calls: usize,
    }

    impl ConsequenceBroker<Intent> for Broker {
        fn actuate(
            &mut self,
            _request: &AdmittedDo<'_, Intent>,
        ) -> Result<BrokerReceipt, String> {
            self.calls += 1;
            BrokerReceipt::try_new(
                "blake3:consequence",
                "blake3:broker-receipt",
                true,
                17,
                Some("provider:operation:42".to_owned()),
            )
            .map_err(|refusal| format!("{refusal:?}"))
        }
    }

    fn intent() -> Intent {
        Intent {
            capability: "deploy.application".to_owned(),
            semantic: "blake3:semantic-v1".to_owned(),
            subject: "service:payments".to_owned(),
            subject_digest: "blake3:subject".to_owned(),
            input: "blake3:input".to_owned(),
        }
    }

    fn decision() -> Decision {
        Decision {
            authority: "authority:42".to_owned(),
            capability: "deploy.application".to_owned(),
            subject_digest: "blake3:subject".to_owned(),
            digest: "blake3:decision".to_owned(),
        }
    }

    #[test]
    fn select_and_construct_are_reversible_and_non_actuating() {
        let select = ProtocolRuntime::record_select(
            &intent(),
            "blake3:selected-candidate",
            "2026-08-19T10:00:00-07:00",
        )
        .unwrap();
        let construct = ProtocolRuntime::record_construct(
            &intent(),
            "blake3:constructed-artifact",
            "2026-08-19T10:00:01-07:00",
        )
        .unwrap();

        assert_eq!(select.phase, ReversiblePhase::Select);
        assert_eq!(construct.phase, ReversiblePhase::Construct);
        assert!(!select.actuated);
        assert!(!construct.actuated);
        assert!(select.verify());
        assert!(construct.verify());
    }

    #[test]
    fn missing_authority_refuses_before_broker() {
        let mut broker = Broker { calls: 0 };
        let refusal = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &RefusingVerifier,
            &mut broker,
            "2026-08-19T10:01:00-07:00",
        )
        .unwrap_err();

        assert_eq!(
            refusal,
            RuntimeRefusal::AuthorityVerifierRefused {
                reason: "NO_AUTHORITY".to_owned(),
            }
        );
        assert_eq!(broker.calls, 0);
    }

    #[test]
    fn authority_for_another_subject_refuses_before_verifier_and_broker() {
        let mut wrong = decision();
        wrong.subject_digest = "blake3:other-subject".to_owned();
        let mut broker = Broker { calls: 0 };
        let refusal = ProtocolRuntime::execute_do(
            &intent(),
            &wrong,
            &Requirement { parent: None },
            &ExactVerifier,
            &mut broker,
            "2026-08-19T10:01:00-07:00",
        )
        .unwrap_err();

        assert_eq!(refusal, RuntimeRefusal::AuthoritySubjectMismatch);
        assert_eq!(broker.calls, 0);
    }

    #[test]
    fn exact_do_is_single_broker_call_receipted_and_ocel_shaped() {
        let mut broker = Broker { calls: 0 };
        let outcome = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut broker,
            "2026-08-19T10:02:00-07:00",
        )
        .unwrap();

        assert_eq!(broker.calls, 1);
        assert!(outcome.receipt.verify().is_ok());
        assert_eq!(outcome.receipt.capability_id, "deploy.application");
        assert_eq!(outcome.receipt.cost_microunits, 17);
        assert_eq!(outcome.ocel_event.event_type, "protocol.consequence.do");
        assert_eq!(outcome.ocel_event.object_ids, vec!["service:payments"]);
        assert_eq!(
            outcome
                .ocel_event
                .attributes
                .get("protocol:receipt_digest"),
            Some(&AttributeValue::String(outcome.receipt.receipt_digest.clone()))
        );
    }

    #[test]
    fn identical_inputs_replay_to_identical_receipt() {
        let mut left_broker = Broker { calls: 0 };
        let mut right_broker = Broker { calls: 0 };
        let left = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut left_broker,
            "2026-08-19T10:03:00-07:00",
        )
        .unwrap();
        let right = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut right_broker,
            "2026-08-19T10:03:00-07:00",
        )
        .unwrap();

        assert_eq!(left.receipt.receipt_digest, right.receipt.receipt_digest);
        assert_eq!(left.ocel_event.id, right.ocel_event.id);
    }

    #[test]
    fn receipt_tamper_is_refused() {
        let mut broker = Broker { calls: 0 };
        let mut outcome = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut broker,
            "2026-08-19T10:04:00-07:00",
        )
        .unwrap();
        outcome.receipt.cost_microunits += 1;

        assert_eq!(
            outcome.receipt.verify(),
            Err(RuntimeRefusal::ReceiptDigestMismatch)
        );
    }

    #[test]
    fn receipt_chain_replay_is_exact_and_parent_bound() {
        let mut first_broker = Broker { calls: 0 };
        let first = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut first_broker,
            "2026-08-19T10:05:00-07:00",
        )
        .unwrap();
        let mut second_broker = Broker { calls: 0 };
        let second = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement {
                parent: Some(first.receipt.receipt_digest.clone()),
            },
            &ExactVerifier,
            &mut second_broker,
            "2026-08-19T10:06:00-07:00",
        )
        .unwrap();

        assert!(verify_receipt_chain(&[first.receipt, second.receipt]).is_ok());
    }

    #[test]
    fn valid_but_wrong_parent_is_chain_refusal() {
        let mut first_broker = Broker { calls: 0 };
        let first = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut first_broker,
            "2026-08-19T10:06:30-07:00",
        )
        .unwrap();
        let mut second_broker = Broker { calls: 0 };
        let second = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement {
                parent: Some("blake3:not-the-first-receipt".to_owned()),
            },
            &ExactVerifier,
            &mut second_broker,
            "2026-08-19T10:06:31-07:00",
        )
        .unwrap();

        assert_eq!(
            verify_receipt_chain(&[first.receipt, second.receipt]),
            Err(RuntimeRefusal::ReceiptChainMismatch { index: 1 })
        );
    }

    #[test]
    fn ocel_append_requires_preexisting_subject_and_refuses_duplicates() {
        let mut broker = Broker { calls: 0 };
        let outcome = ProtocolRuntime::execute_do(
            &intent(),
            &decision(),
            &Requirement { parent: None },
            &ExactVerifier,
            &mut broker,
            "2026-08-19T10:07:00-07:00",
        )
        .unwrap();
        let mut log = OCEL::new();

        assert_eq!(
            append_protocol_outcome(&mut log, &outcome),
            Err(RuntimeRefusal::OcelSubjectMissing {
                subject_id: "service:payments".to_owned(),
            })
        );

        log.object_types.push("protocol.subject".to_owned());
        log.objects.push(OCELObject {
            id: "service:payments".to_owned(),
            object_type: "protocol.subject".to_owned(),
            attributes: BTreeMap::new(),
            changes: Vec::new(),
            embedded_relations: Vec::new(),
        });
        assert!(append_protocol_outcome(&mut log, &outcome).is_ok());
        assert_eq!(log.events.len(), 1);
        assert_eq!(
            append_protocol_outcome(&mut log, &outcome),
            Err(RuntimeRefusal::DuplicateOcelEvent {
                event_id: outcome.ocel_event.id.clone(),
            })
        );
    }
}
