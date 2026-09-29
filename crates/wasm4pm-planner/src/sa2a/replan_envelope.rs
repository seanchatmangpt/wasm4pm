use serde::{Deserialize, Serialize};

use super::Sa2aError;

/// Canonical portable consequence/replan envelope already consumed by GymAct.
/// WASM4PM validates and transports it; it does not derive the decision.
pub const SA2A_REPLAN_SCHEMA: &str = "sa2a/replan-envelope/v1";
pub const SA2A_REPLAN_CONTRACT_DIGEST: &str =
    "sha256:ff7643034ed101930e9c80df716df863b6ee6d14f3b29aff764209ad11dab80e";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplanDecision {
    pub kind: String,
    pub reason: String,
    pub authority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplanEnvelope {
    pub schema: String,
    pub contract_digest: String,
    pub exact_subject: String,
    pub receipt_id: String,
    pub consequence: String,
    pub decision: ReplanDecision,
    pub provider: Option<String>,
    pub projection_digest: Option<String>,
    pub source_replay_key: Option<String>,
}

impl ReplanEnvelope {
    pub fn admit(&self) -> Result<(), Sa2aError> {
        if self.schema != SA2A_REPLAN_SCHEMA {
            return Err(Sa2aError::InvalidWire(format!(
                "SA2A_REPLAN_SCHEMA_MISMATCH:{}",
                self.schema
            )));
        }
        if self.contract_digest != SA2A_REPLAN_CONTRACT_DIGEST {
            return Err(Sa2aError::InvalidWire(
                "SA2A_REPLAN_CONTRACT_DIGEST_MISMATCH".into(),
            ));
        }
        if self.exact_subject.is_empty() {
            return Err(Sa2aError::MissingSubject);
        }
        if self.receipt_id.is_empty() {
            return Err(Sa2aError::InvalidWire("SA2A_REPLAN_RECEIPT_REQUIRED".into()));
        }
        if self.decision.authority != "none" {
            return Err(Sa2aError::AuthorityPresent);
        }
        if self.decision.reason.is_empty() {
            return Err(Sa2aError::InvalidWire("SA2A_REPLAN_REASON_REQUIRED".into()));
        }
        if !matches!(self.decision.kind.as_str(), "stop" | "replan") {
            return Err(Sa2aError::InvalidWire(format!(
                "SA2A_REPLAN_DECISION_KIND:{}",
                self.decision.kind
            )));
        }
        if !matches!(
            self.consequence.as_str(),
            "executed"
                | "failed"
                | "refused"
                | "reconciled"
                | "compensated"
                | "unknown_outcome"
        ) {
            return Err(Sa2aError::InvalidWire(format!(
                "SA2A_REPLAN_CONSEQUENCE:{}",
                self.consequence
            )));
        }
        Ok(())
    }
}

pub fn decode_replan_envelope(bytes: &[u8]) -> Result<ReplanEnvelope, Sa2aError> {
    let envelope: ReplanEnvelope = serde_json::from_slice(bytes)
        .map_err(|error| Sa2aError::InvalidWire(error.to_string()))?;
    envelope.admit()?;
    Ok(envelope)
}

pub fn encode_replan_envelope(envelope: &ReplanEnvelope) -> Result<Vec<u8>, Sa2aError> {
    envelope.admit()?;
    serde_json::to_vec(envelope).map_err(|error| Sa2aError::InvalidWire(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const GYMACT_UNKNOWN_OUTCOME: &str = r#"{
      "schema": "sa2a/replan-envelope/v1",
      "contract_digest": "sha256:ff7643034ed101930e9c80df716df863b6ee6d14f3b29aff764209ad11dab80e",
      "exact_subject": "urn:subject:1",
      "receipt_id": "r1",
      "consequence": "unknown_outcome",
      "decision": {
        "kind": "replan",
        "reason": "unknown_outcome_reconcile_first",
        "authority": "none"
      },
      "provider": "gymact",
      "projection_digest": null,
      "source_replay_key": "replay-123"
    }"#;

    #[test]
    fn admits_exact_gymact_portable_envelope_without_rederiving_decision() {
        let envelope =
            decode_replan_envelope(GYMACT_UNKNOWN_OUTCOME.as_bytes()).expect("canonical envelope");

        assert_eq!(envelope.exact_subject, "urn:subject:1");
        assert_eq!(envelope.consequence, "unknown_outcome");
        assert_eq!(envelope.decision.kind, "replan");
        assert_eq!(envelope.decision.reason, "unknown_outcome_reconcile_first");
        assert_eq!(envelope.decision.authority, "none");
        assert_eq!(envelope.source_replay_key.as_deref(), Some("replay-123"));
    }

    #[test]
    fn cross_language_roundtrip_preserves_exact_subject_and_replay_identity() {
        let envelope = decode_replan_envelope(GYMACT_UNKNOWN_OUTCOME.as_bytes()).unwrap();
        let encoded = encode_replan_envelope(&envelope).unwrap();
        let decoded = decode_replan_envelope(&encoded).unwrap();

        assert_eq!(decoded, envelope);
    }

    #[test]
    fn authority_escalation_is_refused_at_wasm_boundary() {
        let mut envelope = decode_replan_envelope(GYMACT_UNKNOWN_OUTCOME.as_bytes()).unwrap();
        envelope.decision.authority = "do".into();

        assert_eq!(envelope.admit(), Err(Sa2aError::AuthorityPresent));
    }

    #[test]
    fn contract_digest_drift_is_refused() {
        let mut envelope = decode_replan_envelope(GYMACT_UNKNOWN_OUTCOME.as_bytes()).unwrap();
        envelope.contract_digest = "sha256:deadbeef".into();

        assert!(matches!(envelope.admit(), Err(Sa2aError::InvalidWire(_))));
    }
}
