use super::{select, CandidatePlan, CandidateProvider, PortableRequest, Sa2aError};

#[derive(Debug, Clone, PartialEq)]
pub struct Recovery {
    pub candidate: CandidatePlan,
    pub excluded: Vec<String>,
    pub attempts: usize,
}

/// Ask providers for a powerless candidate under a bounded attempt budget.
///
/// A provider-local failure includes both an explicit provider error and an
/// invalid candidate (wrong exact subject/effect identity or leaked authority).
/// Those failures exclude only that provider and continue to the next lawful
/// provider. Request admission failures remain global because every provider
/// would be operating on the same inadmissible subject.
pub fn recover(
    req: &PortableRequest,
    providers: &[&dyn CandidateProvider],
    max_attempts: usize,
) -> Result<Recovery, Sa2aError> {
    req.admit()?;

    if max_attempts == 0 {
        return Err(Sa2aError::AttemptBudgetExhausted);
    }

    let mut excluded = Vec::new();

    for attempt in 0..max_attempts {
        let provider = match select(providers, &req.formalism, &excluded) {
            Some(provider) => provider,
            None if excluded.is_empty() => return Err(Sa2aError::ProviderUnavailable),
            None => return Err(Sa2aError::AttemptBudgetExhausted),
        };

        match provider.propose(req) {
            Ok(candidate) => match candidate.guard(&req.subject, &req.effect_id) {
                Ok(()) => {
                    return Ok(Recovery {
                        candidate,
                        excluded,
                        attempts: attempt + 1,
                    })
                }
                Err(_) => excluded.push(provider.id().to_string()),
            },
            Err(_) => excluded.push(provider.id().to_string()),
        }
    }

    Err(Sa2aError::AttemptBudgetExhausted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct FixedProvider {
        id: &'static str,
        formalism: &'static str,
        candidate: Result<CandidatePlan, Sa2aError>,
    }

    impl CandidateProvider for FixedProvider {
        fn id(&self) -> &str {
            self.id
        }

        fn supports(&self, formalism: &str) -> bool {
            formalism == self.formalism
        }

        fn propose(&self, _request: &PortableRequest) -> Result<CandidatePlan, Sa2aError> {
            self.candidate.clone()
        }
    }

    fn request() -> PortableRequest {
        PortableRequest {
            schema: "sa2a.portable.candidate.v1".into(),
            subject: "job:exact".into(),
            effect_id: "effect:exact".into(),
            formalism: "hddl".into(),
            generation: 7,
            authority: "none".into(),
            payload: json!({"goal": "ship"}),
        }
    }

    fn candidate(provider: &str, subject: &str, effect_id: &str, authority: &str) -> CandidatePlan {
        CandidatePlan {
            subject: subject.into(),
            effect_id: effect_id.into(),
            provider: provider.into(),
            generation: 7,
            authority: authority.into(),
            plan: json!({"steps": []}),
        }
    }

    #[test]
    fn invalid_candidate_excludes_provider_and_uses_next() {
        let wrong = FixedProvider {
            id: "wrong-subject",
            formalism: "hddl",
            candidate: Ok(candidate(
                "wrong-subject",
                "job:other",
                "effect:exact",
                "none",
            )),
        };
        let good = FixedProvider {
            id: "good",
            formalism: "hddl",
            candidate: Ok(candidate("good", "job:exact", "effect:exact", "none")),
        };

        let providers: [&dyn CandidateProvider; 2] = [&wrong, &good];
        let recovered = recover(&request(), &providers, 2).expect("second provider should recover");

        assert_eq!(recovered.candidate.provider, "good");
        assert_eq!(recovered.excluded, vec!["wrong-subject".to_string()]);
        assert_eq!(recovered.attempts, 2);
    }

    #[test]
    fn authority_leak_is_provider_local_failure() {
        let leaking = FixedProvider {
            id: "leaking",
            formalism: "hddl",
            candidate: Ok(candidate("leaking", "job:exact", "effect:exact", "do")),
        };
        let good = FixedProvider {
            id: "good",
            formalism: "hddl",
            candidate: Ok(candidate("good", "job:exact", "effect:exact", "none")),
        };

        let providers: [&dyn CandidateProvider; 2] = [&leaking, &good];
        let recovered =
            recover(&request(), &providers, 2).expect("authority leak should be isolated");

        assert_eq!(recovered.candidate.provider, "good");
        assert_eq!(recovered.excluded, vec!["leaking".to_string()]);
    }

    #[test]
    fn exhausted_provider_set_is_typed_as_budget_exhaustion_after_failure() {
        let failing = FixedProvider {
            id: "failing",
            formalism: "hddl",
            candidate: Err(Sa2aError::ProviderUnavailable),
        };
        let providers: [&dyn CandidateProvider; 1] = [&failing];

        let err = recover(&request(), &providers, 3).expect_err("no replacement provider exists");
        assert_eq!(err, Sa2aError::AttemptBudgetExhausted);
    }
}
