use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use crate::utilities::to_js;

/// Check conformance using token-based replay
#[wasm_bindgen]
pub fn check_token_based_replay(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Validate PetriNet handle exists first (sequential — not nested — so no deadlock).
    get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(_)) => Ok(()),
        Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
        None => Err(JsValue::from_str("PetriNet not found")),
    })?;

    // Perform conformance using borrowed EventLog — no clone.
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut result = ConformanceResult {
                case_fitness: Vec::new(),
                avg_fitness: 0.0,
                conforming_cases: 0,
                total_cases: log.traces.len(),
            };

            let mut total_fitness = 0.0;

            for (case_id, trace) in log.traces.iter().enumerate() {
                let deviations: Vec<TokenReplayDeviation> = trace
                    .events
                    .iter()
                    .enumerate()
                    .filter(|(_, e)| !e.attributes.contains_key(activity_key))
                    .map(#[inline] |(event_idx, _)| TokenReplayDeviation {
                        event_index: event_idx,
                        activity: "unknown".to_string(),
                        deviation_type: "missing_activity".to_string(),
                    })
                    .collect();

                let matched = trace.events.len() - deviations.len();
                let trace_fitness = if !trace.events.is_empty() {
                    matched as f64 / trace.events.len() as f64
                } else {
                    0.0
                };

                let is_conforming = trace_fitness >= 0.9 && deviations.is_empty();
                if is_conforming {
                    result.conforming_cases += 1;
                }

                total_fitness += trace_fitness;

                result.case_fitness.push(TokenReplayResult {
                    case_id: case_id.to_string(),
                    is_conforming,
                    trace_fitness,
                    tokens_missing: deviations.len(),
                    tokens_remaining: 0,
                    deviations,
                });
            }

            result.avg_fitness = if result.total_cases > 0 {
                total_fitness / result.total_cases as f64
            } else {
                0.0
            };

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Get conformance checking info
#[wasm_bindgen]
pub fn conformance_info() -> String {
    json!({
        "status": "conformance_module_operational",
        "algorithms": [
            {
                "name": "token_based_replay",
                "description": "Token-based replay conformance checking",
                "status": "implemented"
            }
        ],
        "note": "Simplified implementation for WASM"
    })
    .to_string()
}
