use super::*;

/// Broker-only actuation authority. Consumed authorization identifiers cannot be reused.
#[derive(Debug, Default)]
pub struct PcPowl2Broker {
    consumed_authorizations: HashSet<String>,
    previous_receipt_digest: Option<String>,
}

impl PcPowl2Broker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn execute<D: FiniteStateDomain>(
        &mut self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        authorization: &AuthorizationEnvelope,
        selection: ExecutionSelection,
        initial_state: D::State,
        now_unix_ms: u64,
    ) -> PcpResult<ExecutionReceiptShape> {
        checker.verify(certificate)?;
        self.validate_authorization(certificate, authorization, &selection, checker, now_unix_ms)?;

        let (pre, post) = certificate.proof.contract();
        if !checker.domain.holds(pre, &initial_state)? {
            return Err(PcpRefusal::InitialEvidenceMissing);
        }
        let (final_state, observed_steps) =
            checker.execute_selection(certificate, &selection, &initial_state)?;
        if !checker.domain.holds(post, &final_state)? {
            return Err(PcpRefusal::FinalGoalNotObserved);
        }

        let initial_value = serde_json::to_value(&initial_state).map_err(|error| {
            PcpRefusal::ReceiptSerializationFailed {
                reason: error.to_string(),
            }
        })?;
        let final_value = serde_json::to_value(&final_state).map_err(|error| {
            PcpRefusal::ReceiptSerializationFailed {
                reason: error.to_string(),
            }
        })?;
        let initial_state_digest = canonical_digest(&initial_state)?;
        let final_state_digest = canonical_digest(&final_state)?;
        let observed_trace_digest = canonical_digest(&observed_steps)?;

        let mut receipt = ExecutionReceiptShape {
            receipt_id: String::new(),
            predecessor_receipt_digest: self.previous_receipt_digest.clone(),
            subject: certificate.subject.clone(),
            domain_digest: certificate.domain_digest.clone(),
            model_digest: certificate.model_digest.clone(),
            proof_digest: certificate.proof_digest.clone(),
            authorization_id: authorization.authorization_id.clone(),
            challenge_nonce: authorization.challenge_nonce.clone(),
            selection,
            initial_state: initial_value,
            final_state: final_value,
            initial_state_digest,
            final_state_digest,
            observed_steps,
            observed_trace_digest,
            receipt_digest: String::new(),
        };
        let digest = receipt_digest(&receipt)?;
        receipt.receipt_id = format!("pc-powl2:{digest}");
        receipt.receipt_digest = digest.clone();

        if authorization.single_use {
            self.consumed_authorizations
                .insert(authorization.authorization_id.clone());
        }
        self.previous_receipt_digest = Some(digest);
        Ok(receipt)
    }

    fn validate_authorization<D: FiniteStateDomain>(
        &self,
        certificate: &CertifiedPowl,
        authorization: &AuthorizationEnvelope,
        selection: &ExecutionSelection,
        checker: &PcPowl2Checker<'_, D>,
        now_unix_ms: u64,
    ) -> PcpResult<()> {
        if authorization.authorization_id.trim().is_empty() {
            return Err(PcpRefusal::AuthorizationMissing);
        }
        if authorization.challenge_nonce.trim().is_empty() {
            return Err(PcpRefusal::ChallengeNonceMissing);
        }
        if authorization.subject != certificate.subject {
            return Err(PcpRefusal::AuthorizationSubjectMismatch);
        }
        if authorization.domain_digest != certificate.domain_digest
            || authorization.model_digest != certificate.model_digest
            || authorization.proof_digest != certificate.proof_digest
        {
            return Err(PcpRefusal::AuthorizationDigestMismatch);
        }
        if now_unix_ms < authorization.issued_unix_ms
            || now_unix_ms > authorization.expires_unix_ms
        {
            return Err(PcpRefusal::AuthorizationExpired);
        }
        if authorization.single_use
            && self
                .consumed_authorizations
                .contains(&authorization.authorization_id)
        {
            return Err(PcpRefusal::AuthorizationAlreadyConsumed);
        }
        let allowed: HashSet<_> = authorization.allowed_nodes.iter().copied().collect();
        for node in checker.validate_selection(certificate, selection)? {
            if !allowed.contains(&node) {
                return Err(PcpRefusal::AuthorizationNodeDenied { node });
            }
        }
        Ok(())
    }
}

pub fn replay_receipt<D: FiniteStateDomain>(
    checker: &PcPowl2Checker<'_, D>,
    certificate: &CertifiedPowl,
    receipt: &ExecutionReceiptShape,
) -> PcpResult<()> {
    checker.verify(certificate)?;
    if receipt.domain_digest != certificate.domain_digest
        || receipt.model_digest != certificate.model_digest
        || receipt.proof_digest != certificate.proof_digest
    {
        return Err(PcpRefusal::AuthorizationDigestMismatch);
    }
    if receipt_digest(receipt)? != receipt.receipt_digest {
        return Err(PcpRefusal::ReceiptDigestMismatch);
    }

    let initial: D::State =
        serde_json::from_value(receipt.initial_state.clone()).map_err(|error| {
            PcpRefusal::ReceiptSerializationFailed {
                reason: error.to_string(),
            }
        })?;
    let expected_final: D::State =
        serde_json::from_value(receipt.final_state.clone()).map_err(|error| {
            PcpRefusal::ReceiptSerializationFailed {
                reason: error.to_string(),
            }
        })?;
    let (actual_final, observed_steps) =
        checker.execute_selection(certificate, &receipt.selection, &initial)?;
    if actual_final != expected_final
        || canonical_digest(&actual_final)? != receipt.final_state_digest
    {
        return Err(PcpRefusal::ReplayStateMismatch);
    }
    if observed_steps != receipt.observed_steps
        || canonical_digest(&observed_steps)? != receipt.observed_trace_digest
    {
        return Err(PcpRefusal::ReplayTraceMismatch);
    }
    Ok(())
}
