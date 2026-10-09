//! eu_gate — EU AI Act Art.15 admission gate (dissertation Ch5, Theorem 5.4).
//!
//! Type-sound sandboxed admission evaluation with trap -> typed-refusal
//! semantics: any internal fault (parse failure, guard trip, panic caught by
//! `catch_unwind`) yields `REFUSED_INFRASTRUCTURE_FAULT`, never silence and
//! never a pass.
//!
//! ## Semantics decision (documented per task contract)
//!
//! * An **unparseable** candidate or ruleset is a hard refusal
//!   (`REFUSED_INFRASTRUCTURE_FAULT`) — fail-closed.
//! * An **empty ruleset** admits a well-formed candidate: rule-absence is a
//!   structural admit under the dissertation's SHACL *open-world* semantics —
//!   a shape constrains nothing until constraints are stated. The candidate
//!   must still parse; the open world is not an unparseable world.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Typed refusal codes. Every refusal carries an exact code — no silent rejects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RefusalCode {
    /// Rule: field is required but absent (or null).
    RefusedRequiredFieldMissing,
    /// Rule: field value not in the allowed enum set.
    RefusedEnumViolation,
    /// Rule: numeric value outside [min, max].
    RefusedRangeViolation,
    /// Rule: forbidden field present.
    RefusedForbiddenField,
    /// Any internal fault: parse failure, guard trip, panic. Fail-closed.
    RefusedInfrastructureFault,
}

impl RefusalCode {
    pub fn as_str(self) -> &'static str {
        match self {
            RefusalCode::RefusedRequiredFieldMissing => "REFUSED_REQUIRED_FIELD_MISSING",
            RefusalCode::RefusedEnumViolation => "REFUSED_ENUM_VIOLATION",
            RefusalCode::RefusedRangeViolation => "REFUSED_RANGE_VIOLATION",
            RefusalCode::RefusedForbiddenField => "REFUSED_FORBIDDEN_FIELD",
            RefusalCode::RefusedInfrastructureFault => "REFUSED_INFRASTRUCTURE_FAULT",
        }
    }
}

/// Verdict emitted on every run. Exit code is always 0; the verdict itself
/// carries the admission decision (trap -> typed refusal, not process crash).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Verdict {
    Admitted,
    Refused { code: String },
}

impl Verdict {
    pub fn refused(code: RefusalCode) -> Self {
        Verdict::Refused {
            code: code.as_str().to_string(),
        }
    }
    pub fn infra_fault() -> Self {
        Self::refused(RefusalCode::RefusedInfrastructureFault)
    }
}

/// One admission rule. `field` selects the candidate member; the payload
/// selects the constraint kind.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Rule {
    /// Field must be present and non-null.
    Required { field: String },
    /// Field value (if present) must be one of `values`.
    Enum { field: String, values: Vec<Value> },
    /// Numeric field must lie within [min, max] (inclusive).
    NumericRange {
        field: String,
        min: f64,
        max: f64,
    },
    /// Field must be absent.
    ForbiddenField { field: String },
}

/// A rule-set: admission requires every rule to hold (conjunction).
#[derive(Debug, Clone, Deserialize)]
pub struct RuleSet {
    #[serde(default)]
    pub rules: Vec<Rule>,
}

/// Hard guard against adversarially large inputs (OOM-style guard): a input
/// above this many bytes is refused as an infrastructure fault before parsing.
pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

/// Evaluate `candidate` against `rules`. Panics are the caller's concern —
/// [`evaluate_checked`] wraps this in `catch_unwind`.
pub fn evaluate(ruleset: &RuleSet, candidate: &Value) -> Verdict {
    for rule in &ruleset.rules {
        match rule {
            Rule::Required { field } => {
                match candidate.get(field) {
                    None | Some(Value::Null) => {
                        return Verdict::refused(RefusalCode::RefusedRequiredFieldMissing)
                    }
                    Some(_) => {}
                }
            }
            Rule::Enum { field, values } => {
                if let Some(v) = candidate.get(field) {
                    if !values.iter().any(|allowed| allowed == v) {
                        return Verdict::refused(RefusalCode::RefusedEnumViolation);
                    }
                }
            }
            Rule::NumericRange { field, min, max } => {
                if let Some(v) = candidate.get(field) {
                    match v.as_f64() {
                        Some(n) if n >= *min && n <= *max => {}
                        _ => return Verdict::refused(RefusalCode::RefusedRangeViolation),
                    }
                }
            }
            Rule::ForbiddenField { field } => {
                if candidate.get(field).is_some() {
                    return Verdict::refused(RefusalCode::RefusedForbiddenField);
                }
            }
        }
    }
    Verdict::Admitted
}

/// Trap-safe evaluation: any panic inside [`evaluate`] becomes
/// `REFUSED_INFRASTRUCTURE_FAULT`. Size guard applied to the raw bytes before
/// parsing. This is the only entry point the binary exposes.
pub fn evaluate_checked(ruleset_bytes: &[u8], candidate_bytes: &[u8]) -> Verdict {
    if ruleset_bytes.len() > MAX_INPUT_BYTES || candidate_bytes.len() > MAX_INPUT_BYTES {
        return Verdict::infra_fault();
    }

    let parsed = std::panic::catch_unwind(|| -> Result<(RuleSet, Value), ()> {
        let ruleset: RuleSet =
            serde_json::from_slice(ruleset_bytes).map_err(|_| ())?;
        let candidate: Value = serde_json::from_slice(candidate_bytes).map_err(|_| ())?;
        Ok((ruleset, candidate))
    });

    match parsed {
        Ok(Ok((ruleset, candidate))) => {
            // Guard the evaluation itself too — a rule-engine panic is a trap.
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                evaluate(&ruleset, &candidate)
            })) {
                Ok(verdict) => verdict,
                Err(_) => Verdict::infra_fault(),
            }
        }
        _ => Verdict::infra_fault(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn run(rules: Value, candidate: Value) -> Verdict {
        evaluate_checked(
            rules.to_string().as_bytes(),
            candidate.to_string().as_bytes(),
        )
    }

    #[test]
    fn required_admits_when_present() {
        let v = run(json!({"rules":[{"type":"required","field":"id"}]}), json!({"id":"a1"}));
        assert_eq!(v, Verdict::Admitted);
    }

    #[test]
    fn required_refuses_when_missing() {
        let v = run(json!({"rules":[{"type":"required","field":"id"}]}), json!({}));
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedRequiredFieldMissing));
    }

    #[test]
    fn required_refuses_null() {
        let v = run(json!({"rules":[{"type":"required","field":"id"}]}), json!({"id":null}));
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedRequiredFieldMissing));
    }

    #[test]
    fn enum_admits_member() {
        let v = run(
            json!({"rules":[{"type":"enum","field":"risk","values":["high","low"]}]}),
            json!({"risk":"low"}),
        );
        assert_eq!(v, Verdict::Admitted);
    }

    #[test]
    fn enum_refuses_non_member() {
        let v = run(
            json!({"rules":[{"type":"enum","field":"risk","values":["high","low"]}]}),
            json!({"risk":"medium"}),
        );
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedEnumViolation));
    }

    #[test]
    fn range_admits_in_bounds() {
        let v = run(
            json!({"rules":[{"type":"numeric_range","field":"score","min":0,"max":100}]}),
            json!({"score":42}),
        );
        assert_eq!(v, Verdict::Admitted);
    }

    #[test]
    fn range_refuses_above_max() {
        let v = run(
            json!({"rules":[{"type":"numeric_range","field":"score","min":0,"max":100}]}),
            json!({"score":101}),
        );
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedRangeViolation));
    }

    #[test]
    fn range_refuses_non_numeric() {
        let v = run(
            json!({"rules":[{"type":"numeric_range","field":"score","min":0,"max":100}]}),
            json!({"score":"high"}),
        );
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedRangeViolation));
    }

    #[test]
    fn forbidden_refuses_when_present() {
        let v = run(
            json!({"rules":[{"type":"forbidden_field","field":"backdoor"}]}),
            json!({"backdoor":true}),
        );
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedForbiddenField));
    }

    #[test]
    fn forbidden_admits_when_absent() {
        let v = run(
            json!({"rules":[{"type":"forbidden_field","field":"backdoor"}]}),
            json!({"safe":true}),
        );
        assert_eq!(v, Verdict::Admitted);
    }

    #[test]
    fn malformed_candidate_is_infrastructure_fault() {
        let v = evaluate_checked(b"{\"rules\":[]}", b"{not json");
        assert_eq!(v, Verdict::infra_fault());
    }

    #[test]
    fn malformed_ruleset_is_infrastructure_fault() {
        let v = evaluate_checked(b"{{{", b"{}");
        assert_eq!(v, Verdict::infra_fault());
    }

    #[test]
    fn empty_ruleset_admits_wellformed_candidate_open_world() {
        // Documented semantics: rule-absence = structural admit (SHACL
        // open-world); the candidate must still parse.
        let v = run(json!({"rules":[]}), json!({"anything":1}));
        assert_eq!(v, Verdict::Admitted);
    }

    #[test]
    fn empty_ruleset_still_requires_parseable_candidate() {
        let v = evaluate_checked(b"{\"rules\":[]}", b"garbage");
        assert_eq!(v, Verdict::infra_fault());
    }

    #[test]
    fn oversized_input_is_infrastructure_fault() {
        let big = vec![b'x'; MAX_INPUT_BYTES + 1];
        let v = evaluate_checked(b"{\"rules\":[]}", &big);
        assert_eq!(v, Verdict::infra_fault());
    }

    #[test]
    fn conjunction_first_refusal_wins() {
        let v = run(
            json!({"rules":[
                {"type":"required","field":"id"},
                {"type":"forbidden_field","field":"backdoor"}
            ]}),
            json!({"backdoor":1}),
        );
        assert_eq!(v, Verdict::refused(RefusalCode::RefusedRequiredFieldMissing));
    }
}
