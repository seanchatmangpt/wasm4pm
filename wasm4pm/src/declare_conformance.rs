use crate::models::{DeclareConstraint, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Priority 3 — DECLARE conformance checking.
///
/// Checks every trace in an event log against a stored DECLARE model.
/// Currently supports the "Response(A,B)" template (if A occurs, B must
/// follow it).  Returns per-constraint and overall fitness metrics.
use wasm_bindgen::prelude::*;

/// Pure core: check an `EventLog` against a set of DECLARE constraints.
/// No wasm/handle plumbing — natively unit-testable, and the single
/// source of truth the wasm-bound `check_declare_conformance` delegates to.
pub fn check_declare_conformance_pure(
    log: &EventLog,
    constraints: &[DeclareConstraint],
    activity_key: &str,
) -> Result<String, String> {
    let total = log.traces.len();
        // violations[i] = # traces violating constraint i
        let mut violations: Vec<usize> = vec![0; constraints.len()];

        for trace in &log.traces {
            let acts: Vec<&str> = trace
                .events
                .iter()
                .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                .collect();

            // Shared sub-checks — Succession is defined as Response ∧ Precedence
            // both holding (mirrors the miner's definition at discovery.rs:616-628),
            // so both must be computable standalone and reused, not duplicated.
            let response_violates = |a: &str, b: &str| -> bool {
                for (i, &act) in acts.iter().enumerate() {
                    if act == a && !acts[i + 1..].contains(&b) {
                        return true;
                    }
                }
                false
            };
            let precedence_violates = |a: &str, b: &str| -> bool {
                let mut a_seen = false;
                for &act in &acts {
                    if act == a {
                        a_seen = true;
                    }
                    if act == b && !a_seen {
                        return true;
                    }
                }
                false
            };

            for (ci, constraint) in constraints.iter().enumerate() {
                let violated = match constraint.template.as_str() {
                    "Response" if constraint.activities.len() == 2 => {
                        response_violates(&constraint.activities[0], &constraint.activities[1])
                    }
                    "Existence" if constraint.activities.len() == 1 => {
                        let a = constraint.activities[0].as_str();
                        !acts.contains(&a)
                    }
                    "Absence" if constraint.activities.len() == 1 => {
                        let a = constraint.activities[0].as_str();
                        acts.contains(&a)
                    }
                    "Init" if constraint.activities.len() == 1 => {
                        let a = constraint.activities[0].as_str();
                        acts.first().map_or(true, |&x| x != a)
                    }
                    "Precedence" if constraint.activities.len() == 2 => {
                        precedence_violates(&constraint.activities[0], &constraint.activities[1])
                    }
                    // CoExistence(a,b): a occurs iff b occurs (both or neither).
                    // Violated when exactly one of the two is present.
                    "CoExistence" if constraint.activities.len() == 2 => {
                        let a = constraint.activities[0].as_str();
                        let b = constraint.activities[1].as_str();
                        acts.contains(&a) != acts.contains(&b)
                    }
                    // NotCoExistence(a,b): a and b never both occur.
                    // Violated when both are present (mirrors discovery.rs:578-587).
                    "NotCoExistence" if constraint.activities.len() == 2 => {
                        let a = constraint.activities[0].as_str();
                        let b = constraint.activities[1].as_str();
                        acts.contains(&a) && acts.contains(&b)
                    }
                    // Succession(a,b): Response(a,b) AND Precedence(a,b) both hold
                    // (discovery.rs:616-628 mines it as exactly this conjunction).
                    "Succession" if constraint.activities.len() == 2 => {
                        let a = constraint.activities[0].as_str();
                        let b = constraint.activities[1].as_str();
                        response_violates(a, b) || precedence_violates(a, b)
                    }
                    // ChainResponse(a,b): every occurrence of a must be
                    // IMMEDIATELY followed by b (discovery.rs:630-641).
                    "ChainResponse" if constraint.activities.len() == 2 => {
                        let a = constraint.activities[0].as_str();
                        let b = constraint.activities[1].as_str();
                        let mut violates = false;
                        for (i, &act) in acts.iter().enumerate() {
                            if act == a && acts.get(i + 1) != Some(&b) {
                                violates = true;
                                break;
                            }
                        }
                        violates
                    }
                    // ChainPrecedence(a,b): every occurrence of b must be
                    // IMMEDIATELY preceded by a (discovery.rs:643-654).
                    "ChainPrecedence" if constraint.activities.len() == 2 => {
                        let a = constraint.activities[0].as_str();
                        let b = constraint.activities[1].as_str();
                        let mut violates = false;
                        for (i, &act) in acts.iter().enumerate() {
                            if act == b && (i == 0 || acts[i - 1] != a) {
                                violates = true;
                                break;
                            }
                        }
                        violates
                    }
                    // Fail-closed: a genuinely unrecognized template (malformed
                    // data, or a template the miner may add before the checker
                    // is updated) must never silently report "no violation" —
                    // that is the exact defect this match arm previously had.
                    _ => true,
                };
                if violated {
                    violations[ci] += 1;
                }
            }
        }

        let constraint_results: Vec<serde_json::Value> = constraints
            .iter()
            .zip(violations.iter())
            .map(|(c, &v)| {
                let fitness = if total == 0 {
                    1.0
                } else {
                    1.0 - v as f64 / total as f64
                };
                json!({
                    "template": c.template,
                    "activities": c.activities,
                    "support": c.support,
                    "violations": v,
                    "fitness": fitness,
                })
            })
            .collect();

        let avg_fitness = if constraint_results.is_empty() {
            1.0_f64
        } else {
            constraint_results
                .iter()
                .map(|r| r["fitness"].as_f64().unwrap_or(1.0))
                .sum::<f64>()
                / constraint_results.len() as f64
        };

    serde_json::to_string(&json!({
        "total_traces": total,
        "avg_fitness": avg_fitness,
        "constraints": constraint_results,
    }))
    .map_err(|e| e.to_string())
}

/// Check an EventLog against a DECLARE model.
///
/// `declare_handle` — handle returned by `discover_declare` stored via
/// `store_declare_from_json`, or the raw result stored as a handle.
///
/// Returns a JSON string:
/// ```json
/// {
///   "total_traces": 100,
///   "avg_fitness": 0.92,
///   "constraints": [
///     {"template":"Response","activities":["A","B"],
///      "violations": 8, "fitness": 0.92}
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn check_declare_conformance(
    log_handle: &str,
    declare_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Clone constraints out so we don't hold two locks
    let constraints =
        get_or_init_state().with_declare_model(declare_handle, |m| Ok(m.constraints.clone()))?;

    let result_json = get_or_init_state().with_event_log(log_handle, |log| {
        check_declare_conformance_pure(log, &constraints, activity_key)
            .map_err(|e| crate::error::js_val(&e))
    })?;

    Ok(crate::error::js_val(&result_json))
}

/// Store a DECLARE model from its JSON representation and return a handle.
///
/// ```javascript
/// const declareJson = JSON.stringify(pm.discover_declare(logHandle, 'concept:name'));
/// const declareHandle = pm.store_declare_from_json(declareJson);
/// const result = pm.check_declare_conformance(logHandle, declareHandle, 'concept:name');
/// ```
#[wasm_bindgen]
pub fn store_declare_from_json(declare_json: &str) -> Result<JsValue, JsValue> {
    let model: crate::models::DeclareModel = serde_json::from_str(declare_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid DECLARE JSON: {}", e)))?;
    let handle = get_or_init_state().store_object(StoredObject::DeclareModel(model))?;
    Ok(crate::error::js_val(&handle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, DeclareConstraint, Event, EventLog, Trace};
    use std::collections::BTreeMap;

    fn make_trace(activities: &[&str]) -> Trace {
        let mut trace = Trace::default();
        for &a in activities {
            let mut event = Event::default();
            let mut attrs = BTreeMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(a.to_string()),
            );
            event.attributes = attrs;
            trace.events.push(event);
        }
        trace
    }

    fn make_log(traces: &[&[&str]]) -> EventLog {
        EventLog {
            traces: traces.iter().map(|t| make_trace(t)).collect(),
            attributes: BTreeMap::new(),
        }
    }

    fn constraint(template: &str, activities: &[&str]) -> DeclareConstraint {
        DeclareConstraint {
            template: template.to_string(),
            activities: activities.iter().map(|s| s.to_string()).collect(),
            support: 1.0,
            confidence: 1.0,
        }
    }

    /// Run the pure core directly — this is the actual logic under test;
    /// `check_declare_conformance` is a thin wasm/handle façade over it.
    fn check(log: EventLog, constraints: Vec<DeclareConstraint>) -> serde_json::Value {
        let json_str = check_declare_conformance_pure(&log, &constraints, "concept:name")
            .expect("pure core must not error on well-formed input");
        serde_json::from_str(&json_str).unwrap()
    }

    fn violations_for(result: &serde_json::Value, template: &str) -> u64 {
        result["constraints"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["template"] == template)
            .expect("constraint present in result")
            .get("violations")
            .unwrap()
            .as_u64()
            .unwrap()
    }

    #[test]
    fn coexistence_satisfied_when_both_or_neither_present() {
        let log = make_log(&[&["A", "B"], &["C"]]);
        let result = check(log, vec![constraint("CoExistence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "CoExistence"), 0);
    }

    #[test]
    fn coexistence_violated_when_exactly_one_present() {
        let log = make_log(&[&["A"], &["B"]]);
        let result = check(log, vec![constraint("CoExistence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "CoExistence"), 2);
    }

    #[test]
    fn not_coexistence_satisfied_when_never_both() {
        let log = make_log(&[&["A"], &["B"]]);
        let result = check(log, vec![constraint("NotCoExistence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "NotCoExistence"), 0);
    }

    #[test]
    fn not_coexistence_violated_when_both_present() {
        let log = make_log(&[&["A", "B"]]);
        let result = check(log, vec![constraint("NotCoExistence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "NotCoExistence"), 1);
    }

    #[test]
    fn succession_satisfied_when_response_and_precedence_hold() {
        let log = make_log(&[&["A", "X", "B"]]);
        let result = check(log, vec![constraint("Succession", &["A", "B"])]);
        assert_eq!(violations_for(&result, "Succession"), 0);
    }

    #[test]
    fn succession_violated_when_precedence_fails() {
        // B occurs without A ever preceding it — precedence fails, so
        // succession (response AND precedence) must also fail.
        let log = make_log(&[&["B"]]);
        let result = check(log, vec![constraint("Succession", &["A", "B"])]);
        assert_eq!(violations_for(&result, "Succession"), 1);
    }

    #[test]
    fn succession_violated_when_response_fails() {
        // A occurs but B never follows — response fails.
        let log = make_log(&[&["A"]]);
        let result = check(log, vec![constraint("Succession", &["A", "B"])]);
        assert_eq!(violations_for(&result, "Succession"), 1);
    }

    #[test]
    fn chain_response_satisfied_when_immediate() {
        let log = make_log(&[&["A", "B", "C"]]);
        let result = check(log, vec![constraint("ChainResponse", &["A", "B"])]);
        assert_eq!(violations_for(&result, "ChainResponse"), 0);
    }

    #[test]
    fn chain_response_violated_when_not_immediate() {
        let log = make_log(&[&["A", "X", "B"]]);
        let result = check(log, vec![constraint("ChainResponse", &["A", "B"])]);
        assert_eq!(violations_for(&result, "ChainResponse"), 1);
    }

    #[test]
    fn chain_precedence_satisfied_when_immediate() {
        let log = make_log(&[&["A", "B"]]);
        let result = check(log, vec![constraint("ChainPrecedence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "ChainPrecedence"), 0);
    }

    #[test]
    fn chain_precedence_violated_when_not_immediate() {
        let log = make_log(&[&["A", "X", "B"]]);
        let result = check(log, vec![constraint("ChainPrecedence", &["A", "B"])]);
        assert_eq!(violations_for(&result, "ChainPrecedence"), 1);
    }

    #[test]
    fn unknown_template_fails_closed_not_open() {
        // This is the exact regression test for the original defect: an
        // unrecognized template string must count as a violation, never
        // silently report "no violation".
        let log = make_log(&[&["A", "B"]]);
        let result = check(log, vec![constraint("SomeFutureTemplate", &["A", "B"])]);
        assert_eq!(violations_for(&result, "SomeFutureTemplate"), 1);
    }

    #[test]
    fn empty_trace_vacuously_satisfies_response_and_precedence() {
        let log = make_log(&[&[]]);
        let result = check(
            log,
            vec![
                constraint("Response", &["A", "B"]),
                constraint("Precedence", &["A", "B"]),
            ],
        );
        assert_eq!(violations_for(&result, "Response"), 0);
        assert_eq!(violations_for(&result, "Precedence"), 0);
    }
}
