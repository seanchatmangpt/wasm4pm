use crate::admission::PlanAdmissionPolicy;
use crate::receipt::manufacture_world_with_policy;
use serde_json::Value;

use super::{CandidatePlan, CandidateProvider, PortableRequest, Sa2aError};

pub const WASM_PDDL_PROVIDER_ID: &str = "wasm4pm-pddl";
pub const WASM_PDDL_FORMALISM: &str = "pddl";

/// Real WASM4PM planner provider for the SA2A candidate boundary.
///
/// The provider consumes PDDL domain/problem text from the request payload,
/// plans through wasm4pm-planner's existing admitted manufacture path, and
/// returns only a powerless candidate. It never executes a plan.
#[derive(Debug, Default, Clone, Copy)]
pub struct WasmPddlProvider;

impl CandidateProvider for WasmPddlProvider {
    fn id(&self) -> &str {
        WASM_PDDL_PROVIDER_ID
    }

    fn supports(&self, formalism: &str) -> bool {
        formalism == WASM_PDDL_FORMALISM
    }

    fn propose(&self, request: &PortableRequest) -> Result<CandidatePlan, Sa2aError> {
        request.admit()?;
        if !self.supports(&request.formalism) {
            return Err(Sa2aError::ProviderUnavailable);
        }

        let domain_pddl = required_str(&request.payload, "domain_pddl")?;
        let problem_pddl = required_str(&request.payload, "problem_pddl")?;
        let allowed_actions = required_string_array(&request.payload, "allowed_actions")?;

        let policy = allowed_actions
            .into_iter()
            .fold(PlanAdmissionPolicy::default_deny(), |policy, label| {
                policy.allow_label(label)
            });

        let receipt = manufacture_world_with_policy(domain_pddl, problem_pddl, &policy);
        if !receipt.admitted {
            return Err(Sa2aError::ProviderRefused(
                receipt
                    .refusal_reason
                    .unwrap_or_else(|| "WASM4PM_PDDL_PLAN_REFUSED".to_string()),
            ));
        }

        let plan = serde_json::to_value(receipt)
            .map_err(|error| Sa2aError::ProviderRefused(error.to_string()))?;

        Ok(CandidatePlan {
            subject: request.subject.clone(),
            effect_id: request.effect_id.clone(),
            provider: WASM_PDDL_PROVIDER_ID.to_string(),
            generation: request.generation,
            authority: "none".to_string(),
            plan,
        })
    }
}

fn required_str<'a>(payload: &'a Value, key: &str) -> Result<&'a str, Sa2aError> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| Sa2aError::ProviderRefused(format!("SA2A_PDDL_MISSING_{key}")))
}

fn required_string_array(payload: &Value, key: &str) -> Result<Vec<String>, Sa2aError> {
    let values = payload
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| Sa2aError::ProviderRefused(format!("SA2A_PDDL_MISSING_{key}")))?;

    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .filter(|label| !label.is_empty())
                .map(ToOwned::to_owned)
                .ok_or_else(|| Sa2aError::ProviderRefused(format!("SA2A_PDDL_INVALID_{key}")))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const DOMAIN: &str = r#"
(define (domain sa2a-provider)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:predicates (done ?w))
  (:functions (cap))
  (:durative-action work
    :parameters (?w - worker)
    :duration (= ?duration 5)
    :condition (at start (>= (cap) 1))
    :effect (and
      (at start (decrease (cap) 1))
      (at end (increase (cap) 1))
      (at end (done ?w)))))
"#;

    const PROBLEM: &str = r#"
(define (problem sa2a-provider-p)
  (:domain sa2a-provider)
  (:objects w1 - worker)
  (:init (= (cap) 1))
  (:goal (and (done w1))))
"#;

    fn request(allowed_actions: Value) -> PortableRequest {
        PortableRequest {
            schema: "sa2a.portable.candidate.v1".into(),
            subject: "urn:subject:wasm-provider".into(),
            effect_id: "effect:plan".into(),
            formalism: WASM_PDDL_FORMALISM.into(),
            generation: 9,
            authority: "none".into(),
            payload: json!({
                "domain_pddl": DOMAIN,
                "problem_pddl": PROBLEM,
                "allowed_actions": allowed_actions,
            }),
        }
    }

    #[test]
    fn manufactures_powerless_candidate_with_exact_identity() {
        let provider = WasmPddlProvider;
        let candidate = provider
            .propose(&request(json!(["work"])))
            .expect("explicitly admitted PDDL action should plan");

        assert_eq!(candidate.subject, "urn:subject:wasm-provider");
        assert_eq!(candidate.effect_id, "effect:plan");
        assert_eq!(candidate.provider, WASM_PDDL_PROVIDER_ID);
        assert_eq!(candidate.generation, 9);
        assert_eq!(candidate.authority, "none");
        assert_eq!(candidate.plan["admitted"], true);
    }

    #[test]
    fn default_deny_plan_refusal_is_provider_local() {
        let provider = WasmPddlProvider;
        let error = provider
            .propose(&request(json!([])))
            .expect_err("unadmitted action must not become a candidate");

        assert!(matches!(error, Sa2aError::ProviderRefused(_)));
    }

    #[test]
    fn provider_never_supports_foreign_formalism_by_accident() {
        let provider = WasmPddlProvider;
        assert!(provider.supports("pddl"));
        assert!(!provider.supports("hddl"));
        assert!(!provider.supports("fond"));
        assert!(!provider.supports("powl"));
    }
}
