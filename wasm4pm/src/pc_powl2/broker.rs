use super::*;

/// Broker-only actuation authority.
///
/// Authorization envelopes are valid only when minted and retained by this
/// broker instance. A caller cannot manufacture authority by filling the public
/// wire structure correctly.
#[derive(Debug)]
pub struct PcPowl2Broker {
    authority_id: String,
    next_authorization: u64,
    issued_authorizations: HashMap<String, AuthorizationEnvelope>,
    consumed_authorizations: HashSet<String>,
    issued_receipts: HashSet<String>,
    previous_receipt_digest: Option<String>,
    previous_final_state_digest: Option<String>,
}

impl Default for PcPowl2Broker {
    fn default() -> Self {
        Self::with_authority("pc-powl2:local-authority")
    }
}

impl PcPowl2Broker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_authority(authority_id: impl Into<String>) -> Self {
        Self {
            authority_id: authority_id.into(),
            next_authorization: 0,
            issued_authorizations: HashMap::new(),
            consumed_authorizations: HashSet::new(),
            issued_receipts: HashSet::new(),
            previous_receipt_digest: None,
            previous_final_state_digest: None,
        }
    }

    pub fn authorize<D: FiniteStateDomain>(
        &mut self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        mut allowed_nodes: Vec<PowlNodeId>,
        challenge_nonce: impl Into<String>,
        issued_unix_ms: u64,
        expires_unix_ms: u64,
        single_use: bool,
    ) -> PcpResult<AuthorizationEnvelope> {
        checker.verify(certificate)?;
        let challenge_nonce = challenge_nonce.into();
        if challenge_nonce.trim().is_empty() {
            return Err(PcpRefusal::ChallengeNonceMissing);
        }
        if issued_unix_ms > expires_unix_ms {
            return Err(PcpRefusal::AuthorizationExpired);
        }
        allowed_nodes.sort();
        allowed_nodes.dedup();
        if allowed_nodes.is_empty() {
            return Err(PcpRefusal::AuthorizationMissing);
        }
        for node_id in &allowed_nodes {
            let node = model_node(&certificate.model, *node_id)?;
            if !matches!(&node.kind, PowlNodeKind::Atom(_)) {
                return Err(PcpRefusal::AuthorizationNodeDenied { node: *node_id });
            }
        }

        let counter = self.next_authorization;
        self.next_authorization = self.next_authorization.saturating_add(1);
        let authorization_id = format!(
            "pc-powl2-auth:{}",
            canonical_digest(&(
                &self.authority_id,
                counter,
                &certificate.subject,
                &certificate.domain_digest,
                &certificate.model_digest,
                &certificate.proof_digest,
                &allowed_nodes,
                &challenge_nonce,
                issued_unix_ms,
                expires_unix_ms,
                single_use,
            ))?
        );
        let envelope = AuthorizationEnvelope {
            authorization_id: authorization_id.clone(),
            subject: certificate.subject.clone(),
            domain_digest: certificate.domain_digest.clone(),
            model_digest: certificate.model_digest.clone(),
            proof_digest: certificate.proof_digest.clone(),
            allowed_nodes,
            challenge_nonce,
            issued_unix_ms,
            expires_unix_ms,
            single_use,
        };
        self.issued_authorizations
            .insert(authorization_id, envelope.clone());
        Ok(envelope)
    }

    /// Execute the verified pure transition model. The resulting receipt proves
    /// model execution and replay, not external host actuation.
    pub fn execute<D: FiniteStateDomain>(
        &mut self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        authorization: &AuthorizationEnvelope,
        selection: ExecutionSelection,
        initial_state: D::State,
        now_unix_ms: u64,
    ) -> PcpResult<ExecutionReceiptShape> {
        let mut actuator = ModelActuator;
        self.execute_with(
            checker,
            certificate,
            authorization,
            selection,
            initial_state,
            now_unix_ms,
            &mut actuator,
        )
    }

    /// Execute through an external actuator and require its observed successor
    /// to refine the verified pure transition at every atomic step.
    pub fn execute_with<D, A>(
        &mut self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        authorization: &AuthorizationEnvelope,
        selection: ExecutionSelection,
        initial_state: D::State,
        now_unix_ms: u64,
        actuator: &mut A,
    ) -> PcpResult<ExecutionReceiptShape>
    where
        D: FiniteStateDomain,
        A: PcPowl2Actuator<D>,
    {
        checker.verify(certificate)?;
        self.validate_authorization(certificate, authorization, &selection, checker, now_unix_ms)?;

        let (pre, post) = certificate.proof.contract();
        if !checker.domain.holds(pre, &initial_state)? {
            return Err(PcpRefusal::InitialEvidenceMissing);
        }
        let (final_state, observed_steps) =
            checker.execute_selection_with(certificate, &selection, &initial_state, actuator)?;
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
        if self.previous_receipt_digest.is_some()
            && self.previous_final_state_digest.as_ref() != Some(&initial_state_digest)
        {
            return Err(PcpRefusal::ReplayStateMismatch);
        }
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
            final_state_digest: final_state_digest.clone(),
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
        self.issued_receipts.insert(digest.clone());
        self.previous_receipt_digest = Some(digest);
        self.previous_final_state_digest = Some(final_state_digest);
        Ok(receipt)
    }

    /// Verify that a receipt was issued by this broker instance, then replay it.
    pub fn verify_issued_receipt<D: FiniteStateDomain>(
        &self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        receipt: &ExecutionReceiptShape,
    ) -> PcpResult<()> {
        if !self.issued_receipts.contains(&receipt.receipt_digest) {
            return Err(PcpRefusal::ReceiptDigestMismatch);
        }
        let authorization = self
            .issued_authorizations
            .get(&receipt.authorization_id)
            .ok_or(PcpRefusal::AuthorizationMissing)?;
        if authorization.subject != receipt.subject
            || authorization.domain_digest != receipt.domain_digest
            || authorization.model_digest != receipt.model_digest
            || authorization.proof_digest != receipt.proof_digest
            || authorization.challenge_nonce != receipt.challenge_nonce
        {
            return Err(PcpRefusal::AuthorizationDigestMismatch);
        }
        replay_receipt(checker, certificate, receipt)
    }

    pub fn verify_issued_receipt_chain<D: FiniteStateDomain>(
        &self,
        checker: &PcPowl2Checker<'_, D>,
        certificate: &CertifiedPowl,
        receipts: &[ExecutionReceiptShape],
    ) -> PcpResult<()> {
        replay_receipt_chain(checker, certificate, receipts)?;
        for receipt in receipts {
            self.verify_issued_receipt(checker, certificate, receipt)?;
        }
        Ok(())
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
        let Some(issued) = self
            .issued_authorizations
            .get(&authorization.authorization_id)
        else {
            return Err(PcpRefusal::AuthorizationMissing);
        };
        if issued != authorization {
            return Err(PcpRefusal::AuthorizationDigestMismatch);
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
        if now_unix_ms < authorization.issued_unix_ms || now_unix_ms > authorization.expires_unix_ms
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

/// Verify deterministic semantic conformance and digest integrity.
///
/// This function does not establish that a broker issued the receipt. Use
/// `PcPowl2Broker::verify_issued_receipt` when authority provenance matters.
pub fn replay_receipt<D: FiniteStateDomain>(
    checker: &PcPowl2Checker<'_, D>,
    certificate: &CertifiedPowl,
    receipt: &ExecutionReceiptShape,
) -> PcpResult<()> {
    checker.verify(certificate)?;
    if receipt.subject != certificate.subject
        || receipt.domain_digest != certificate.domain_digest
        || receipt.model_digest != certificate.model_digest
        || receipt.proof_digest != certificate.proof_digest
    {
        return Err(PcpRefusal::AuthorizationDigestMismatch);
    }
    let digest = receipt_digest(receipt)?;
    if digest != receipt.receipt_digest || receipt.receipt_id != format!("pc-powl2:{digest}") {
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
    if canonical_digest(&initial)? != receipt.initial_state_digest
        || canonical_digest(&expected_final)? != receipt.final_state_digest
    {
        return Err(PcpRefusal::ReplayStateMismatch);
    }
    let (pre, post) = certificate.proof.contract();
    if !checker.domain.holds(pre, &initial)? || !checker.domain.holds(post, &expected_final)? {
        return Err(PcpRefusal::ReplayStateMismatch);
    }
    let (actual_final, observed_steps) =
        checker.execute_selection(certificate, &receipt.selection, &initial)?;
    if actual_final != expected_final
        || canonical_digest(&actual_final)? != receipt.final_state_digest
    {
        return Err(PcpRefusal::ReplayStateMismatch);
    }
    if observed_steps != receipt.observed_steps
        || canonical_digest(&observed_steps)? != receipt.observed_trace_digest
        || observed_steps
            .iter()
            .enumerate()
            .any(|(ordinal, step)| step.ordinal != ordinal)
    {
        return Err(PcpRefusal::ReplayTraceMismatch);
    }
    Ok(())
}

pub fn replay_receipt_chain<D: FiniteStateDomain>(
    checker: &PcPowl2Checker<'_, D>,
    certificate: &CertifiedPowl,
    receipts: &[ExecutionReceiptShape],
) -> PcpResult<()> {
    let mut predecessor: Option<String> = None;
    let mut predecessor_final_state: Option<String> = None;
    for receipt in receipts {
        if receipt.predecessor_receipt_digest != predecessor {
            return Err(PcpRefusal::ReceiptDigestMismatch);
        }
        if predecessor.is_some()
            && predecessor_final_state.as_ref() != Some(&receipt.initial_state_digest)
        {
            return Err(PcpRefusal::ReplayStateMismatch);
        }
        replay_receipt(checker, certificate, receipt)?;
        predecessor = Some(receipt.receipt_digest.clone());
        predecessor_final_state = Some(receipt.final_state_digest.clone());
    }
    Ok(())
}
