use crate::algorithms::discover_alpha_plus_plus;
use crate::error::{codes, wasm_err};
use crate::models::OCEL;
use crate::oc_petri_net::flatten_ocel_to_eventlog_for_type;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use std::collections::HashSet;
/// Object-Centric Conformance Checking (Phase 2B)
///
/// Checks conformance of an Object-Centric Event Log against an Object-Centric
/// Petri Net. For each object type, flattens the OCEL, replays the traces on
/// the per-type net, and computes fitness / precision metrics.
use wasm_bindgen::prelude::*;

/// Check conformance of OCEL against an OC Petri Net.
///
/// For each object type:
/// 1. Flatten OCEL → EventLog
/// 2. Discover reference Petri Net
/// 3. Check activity-set membership per trace (a trace "fits" iff every one of its
///    activities appears as a transition label in the discovered net — this is a
///    coverage check, not ordered token replay: it does not verify that activities
///    occur in an order the net's control-flow actually permits)
/// 4. Compute fitness (fraction of perfectly-fitting traces)
///
/// Returns: JSON `{ "Order": { "fitness": 0.95, … }, "Item": { … }, "overall": { … } }`
#[cfg(feature = "ocel")]
pub fn oc_conformance_check_inner(ocel: &OCEL) -> Result<serde_json::Value, String> {
    let mut per_type = serde_json::Map::new();
    let mut total_traces = 0usize;
    let mut total_fitting = 0usize;

    for obj_type in &ocel.object_types {
        let log = flatten_ocel_to_eventlog_for_type(ocel, obj_type)
            .map_err(|e| format!("flatten failed: {:?}", e))?;
        let trace_count = log.traces.len();

        // Store log temporarily for discovery
        let temp_handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log.clone()))
            .map_err(|_e| "Failed to store flattened EventLog".to_string())?;

        // Discover reference net
        let net_js = discover_alpha_plus_plus(&temp_handle, "concept:name", 0.5)
            .map_err(|e| format!("alpha++ failed: {:?}", e))?;
        let net_json: serde_json::Value = serde_wasm_bindgen::from_value(net_js)
            .map_err(|e| format!("Failed to parse Petri Net: {}", e))?;

        // Extract transitions for simple replay check
        let transition_labels: HashSet<String> =
            match net_json.get("transitions").and_then(|t| t.as_array()) {
                Some(arr) => arr
                    .iter()
                    .filter_map(|t| t.get("label").and_then(|l| l.as_str()).map(String::from))
                    .collect(),
                None => return Err("Net JSON missing or invalid 'transitions' array".to_string()),
            };

        // Simple token replay: a trace fits if all its activities are in the net
        let mut fitting = 0usize;
        let mut deviations: Vec<serde_json::Value> = Vec::new();

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get("concept:name")?
                        .as_string()
                        .map(str::to_owned)
                })
                .collect();

            let missing: Vec<String> = activities
                .iter()
                .filter(|a| !transition_labels.contains(a.as_str()))
                .cloned()
                .collect();

            if missing.is_empty() {
                fitting += 1;
            } else {
                deviations.push(json!({
                    "trace_activities": activities,
                    "missing_transitions": missing,
                }));
            }
        }

        let fitness = if trace_count > 0 {
            fitting as f64 / trace_count as f64
        } else {
            1.0
        };

        total_traces += trace_count;
        total_fitting += fitting;

        per_type.insert(
            obj_type.clone(),
            json!({
                "fitness": fitness,
                "traces": trace_count,
                "fitting_traces": fitting,
                "deviations": deviations.len(),
                "sample_deviations": &deviations[..deviations.len().min(5)],
            }),
        );
    }

    let overall_fitness = if total_traces > 0 {
        total_fitting as f64 / total_traces as f64
    } else {
        1.0
    };

    let mut result = serde_json::Map::new();
    result.extend(per_type);
    result.insert(
        "overall".into(),
        json!({
            "fitness": overall_fitness,
            "total_traces": total_traces,
            "fitting_traces": total_fitting,
        }),
    );
    Ok(serde_json::Value::Object(result))
}

#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn oc_conformance_check(ocel_handle: &str) -> Result<JsValue, JsValue> {
    let ocel = get_ocel(ocel_handle)?;
    let result =
        oc_conformance_check_inner(&ocel).map_err(|e| wasm_err(codes::INTERNAL_ERROR, &e))?;
    to_js(&result)
}

/// Get information about OC conformance checking.
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn oc_conformance_info() -> JsValue {
    let info = json!({
        "module": "oc_conformance",
        "description": "Object-Centric conformance checking against OC Petri Nets",
        "functions": [
            {
                "name": "oc_conformance_check",
                "description": "Check conformance of OCEL traces against discovered nets",
                "params": ["ocel_handle"],
                "returns": "JSON {object_type: {fitness, traces, …}, overall: {fitness, …}}"
            },
            {
                "name": "oc_conformance_info",
                "description": "Get information about this module",
                "params": [],
                "returns": "JSON info"
            }
        ]
    });

    to_js(&info).unwrap_or(JsValue::NULL)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_ocel(handle: &str) -> Result<OCEL, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", handle),
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OCELEvent, OCELObject, OCEL};

    fn create_test_ocel() -> OCEL {
        OCEL {
            event_types: vec!["A".to_string(), "B".to_string()],
            object_types: vec!["Order".to_string()],
            events: vec![
                OCELEvent {
                    id: "e1".to_string(),
                    event_type: "A".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e2".to_string(),
                    event_type: "B".to_string(),
                    timestamp: "2024-01-01T11:00:00Z".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "Order".to_string(),
                attributes: std::collections::BTreeMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    #[test]
    fn test_oc_conformance_basic() {
        // oc_conformance_check_inner internally calls discover_alpha_plus_plus
        // which returns JsValue — that path panics outside WASM.
        // Test the inner function with an OCEL that has NO object types,
        // so the loop over object_types is skipped entirely and we validate
        // the outer structure (overall fitness = 1.0 for empty log).
        let ocel = OCEL {
            event_types: vec![],
            object_types: vec![], // no types → no alpha++ call
            events: vec![],
            objects: vec![],
            object_relations: vec![],
        };
        let result = oc_conformance_check_inner(&ocel);
        assert!(result.is_ok(), "Empty OCEL conformance should succeed");
        let json = result.unwrap();
        assert!(json.get("overall").is_some());
        assert_eq!(json["overall"]["fitness"].as_f64().unwrap(), 1.0);
    }

    #[test]
    fn test_oc_conformance_empty_ocel() {
        let ocel = OCEL {
            event_types: vec![],
            object_types: vec![],
            events: vec![],
            objects: vec![],
            object_relations: vec![],
        };
        // Empty OCEL: no object types to iterate, should return {"overall": {fitness: 1.0, ...}}
        let result = oc_conformance_check_inner(&ocel);
        assert!(result.is_ok(), "Empty OCEL should succeed");
        let json = result.unwrap();
        let overall_fitness = json["overall"]["fitness"].as_f64().unwrap();
        assert_eq!(overall_fitness, 1.0, "Empty log fitness should be 1.0");
    }

    #[test]
    fn test_oc_conformance_invalid_handle() {
        // The WASM handle lookup returns None for unknown handles
        let found = get_or_init_state().with_object("no_such_handle", |obj| {
            Ok::<bool, wasm_bindgen::JsValue>(obj.is_some())
        });
        assert!(found.is_ok());
        assert!(!found.unwrap(), "Unknown handle must return None");
    }

    #[test]
    fn test_oc_conformance_returns_json_structure() {
        // Test the JSON structure contract using the empty-OCEL path
        // (no object types → no alpha++ call, stays in pure Rust)
        let ocel = OCEL {
            event_types: vec![],
            object_types: vec![],
            events: vec![],
            objects: vec![],
            object_relations: vec![],
        };
        let result = oc_conformance_check_inner(&ocel).expect("Conformance check failed");
        assert!(result.is_object());
        let overall = &result["overall"];
        assert!(overall["fitness"].is_f64());
        assert!(overall["total_traces"].is_number());
        assert!(overall["fitting_traces"].is_number());
    }
}
