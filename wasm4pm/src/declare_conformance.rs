use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Priority 3 — DECLARE conformance checking.
///
/// Checks every trace in an event log against a stored DECLARE model.
/// Currently supports the "Response(A,B)" template (if A occurs, B must
/// follow it).  Returns per-constraint and overall fitness metrics.
use wasm_bindgen::prelude::*;

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
    let constraints = get_or_init_state().with_object(declare_handle, |obj| match obj {
        Some(StoredObject::DeclareModel(m)) => Ok(m.constraints.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not a DeclareModel")),
        None => Err(JsValue::from_str("DeclareModel handle not found")),
    })?;

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total = log.traces.len();
            // violations[i] = # traces violating constraint i
            let mut violations: Vec<usize> = vec![0; constraints.len()];

            for trace in &log.traces {
                let acts: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .collect();

                for (ci, constraint) in constraints.iter().enumerate() {
                    let violated = match constraint.template.as_str() {
                        "Response" if constraint.activities.len() == 2 => {
                            let a = constraint.activities[0].as_str();
                            let b = constraint.activities[1].as_str();
                            // For each occurrence of A in the trace, B must follow
                            let mut violates = false;
                            for (i, &act) in acts.iter().enumerate() {
                                if act == a {
                                    // Check if B appears anywhere after position i
                                    if !acts[i + 1..].contains(&b) {
                                        violates = true;
                                        break;
                                    }
                                }
                            }
                            violates
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
                            acts.first().map(|&x| x != a).unwrap_or(true)
                        }
                        "Precedence" if constraint.activities.len() == 2 => {
                            let a = constraint.activities[0].as_str();
                            let b = constraint.activities[1].as_str();
                            // B can only occur if A occurred before it
                            let mut a_seen = false;
                            let mut violates = false;
                            for &act in &acts {
                                if act == a {
                                    a_seen = true;
                                }
                                if act == b && !a_seen {
                                    violates = true;
                                    break;
                                }
                            }
                            violates
                        }
                        _ => false, // Unknown template: no violation
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
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
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
        .map_err(|e| JsValue::from_str(&format!("Invalid DECLARE JSON: {}", e)))?;
    let handle = get_or_init_state().store_object(StoredObject::DeclareModel(model))?;
    Ok(JsValue::from_str(&handle))
}
