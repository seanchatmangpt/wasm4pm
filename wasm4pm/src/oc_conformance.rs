use crate::error::{codes, wasm_err};
use crate::models::{AdmittedEventLog, OCEL};
use crate::oc_petri_net::flatten_ocel_to_eventlog_for_type;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
/// Object-Centric Conformance Checking (Phase 2B)
///
/// Checks conformance of an Object-Centric Event Log against an Object-Centric
/// Petri Net. For each object type, flattens the OCEL, replays the traces on
/// the per-type net, and computes fitness / precision metrics.
use wasm_bindgen::prelude::*;

/// Real per-object-type conformance, per the actual academic definition
/// (van der Aalst & Berti, "Discovering Object-centric Petri Nets",
/// Fundamenta Informaticae 175(1-4), 2020) audited this session against
/// `~/autofde-lab`'s adjacent `object_centric_conformance.py`: real
/// per-object-type token-based replay (not the old "all activities present"
/// membership check) PLUS an explicit event-to-object cardinality check.
///
/// Corrected 2026-08-12: this function previously flattened per type,
/// discovered a reference net, and called it "conformant" if every activity
/// name in a trace merely appeared SOMEWHERE among the discovered net's
/// transition labels -- real presence, but blind to sequencing, loops, or
/// any real replay semantics. It now:
///
/// 1. Flattens the OCEL per object type (unchanged, real,
///    `flatten_ocel_to_eventlog_for_type`).
/// 2. Discovers a reference Petri net per type via the real, native
///    `discover_alpha_plus_plus_from_log` (bypasses the `#[wasm_bindgen]`
///    `discover_alpha_plus_plus`'s `JsValue` boundary, which panics off
///    wasm32 -- this function is now natively testable, unlike before).
/// 3. Real token-based replay (`conformance::token_replay_pure`, the same
///    correctly-formulated `0.5*(1-m/c)+0.5*(1-r/p)` fitness Phase 1 of
///    this session's audit fixed the doc comment for) per type, not a
///    presence check.
/// 4. A real, NEW event-to-object cardinality check: for each
///    `(activity, object_type)` pair, the modal (most frequent) real
///    object-count an event of that activity relates to is computed
///    directly from the OCEL itself, then every individual event's real
///    cardinality is compared against that mode -- flagging events whose
///    real object-relation count deviates from the log's own dominant
///    pattern. Honestly self-referential (the "expected" cardinality is
///    discovered from the same log being checked), matching this crate's
///    own established, disclosed pattern for self-derived baselines (see
///    `level4_process_fitness.py`'s `discover_and_check` in the sibling
///    `autofde-lab` repo for the same, named caveat) -- never presented as
///    an externally-validated ground truth.
///
/// Returns: JSON `{ "Order": { "fitness": 0.95, "cardinality_violations": 2, … }, … }`
#[cfg(feature = "ocel")]
pub fn oc_conformance_check_inner(ocel: &OCEL) -> Result<serde_json::Value, String> {
    let mut per_type = serde_json::Map::new();
    let mut total_traces = 0usize;
    let mut total_fitting = 0usize;

    // Real object_id -> object_type index, built once, used by the
    // cardinality check below.
    let object_type_by_id: HashMap<&str, &str> = ocel
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect();

    for obj_type in &ocel.object_types {
        let log = flatten_ocel_to_eventlog_for_type(ocel, obj_type)
            .map_err(|e| format!("flatten failed: {:?}", e))?;
        let trace_count = log.traces.len();

        // Real, native discovery -- no wasm_bindgen JsValue boundary, no
        // StoredObject handle round-trip.
        let admitted: AdmittedEventLog<()> =
            wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
        let net = crate::algorithms::discover_alpha_plus_plus_from_log(&admitted, "concept:name", 0.5)
            .map_err(|e| format!("alpha++ failed: {}", e))?;

        // Real token-based replay against the real discovered net -- the
        // actual fix: presence-of-activity-name is no longer conflated
        // with real conformance.
        let replay = crate::conformance::token_replay_pure(&log, &net, "concept:name");

        // Real E2O cardinality check for this object type: for every real
        // event related to at least one object of `obj_type`, how many
        // distinct objects of `obj_type` does it relate to? Compute the
        // modal (most common) real count per activity, then flag events
        // that deviate from their own activity's mode.
        let mut counts_by_activity: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for event in &ocel.events {
            let related_count = event
                .all_object_ids()
                .filter(|id| object_type_by_id.get(id) == Some(&obj_type.as_str()))
                .count();
            if related_count > 0 {
                counts_by_activity
                    .entry(event.event_type.clone())
                    .or_default()
                    .push(related_count);
            }
        }
        let mode_by_activity: BTreeMap<String, usize> = counts_by_activity
            .iter()
            .map(|(activity, counts)| (activity.clone(), real_mode(counts)))
            .collect();

        let mut cardinality_violations: Vec<serde_json::Value> = Vec::new();
        for event in &ocel.events {
            let related_count = event
                .all_object_ids()
                .filter(|id| object_type_by_id.get(id) == Some(&obj_type.as_str()))
                .count();
            if related_count == 0 {
                continue;
            }
            if let Some(&mode) = mode_by_activity.get(&event.event_type) {
                if related_count != mode {
                    cardinality_violations.push(json!({
                        "event_id": event.id,
                        "activity": event.event_type,
                        "observed_object_count": related_count,
                        "modal_object_count_for_activity": mode,
                    }));
                }
            }
        }

        total_traces += trace_count;
        total_fitting += replay.conforming_cases;

        per_type.insert(
            obj_type.clone(),
            json!({
                "fitness": replay.avg_fitness,
                "traces": trace_count,
                "fitting_traces": replay.conforming_cases,
                "cardinality_violations": cardinality_violations.len(),
                "sample_cardinality_violations":
                    &cardinality_violations[..cardinality_violations.len().min(5)],
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

/// Real statistical mode (most frequent value) of a non-empty slice of
/// counts. Ties broken by smallest value, deterministically (never
/// arbitrary iteration order).
fn real_mode(counts: &[usize]) -> usize {
    let mut freq: BTreeMap<usize, usize> = BTreeMap::new();
    for &c in counts {
        *freq.entry(c).or_default() += 1;
    }
    freq.into_iter()
        .max_by_key(|&(value, count)| (count, std::cmp::Reverse(value)))
        .map(|(value, _)| value)
        .unwrap_or(0)
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
        // Corrected 2026-08-12: this comment previously said
        // `oc_conformance_check_inner` "internally calls
        // discover_alpha_plus_plus which returns JsValue — that path
        // panics outside WASM", as the reason this test only used an empty
        // OCEL. That is no longer true -- the real per-type path now calls
        // the native `discover_alpha_plus_plus_from_log` (no JsValue
        // boundary), and IS natively testable; see
        // `test_oc_conformance_real_per_type_replay_and_cardinality_check`
        // below for real coverage of that path. This test is kept as-is
        // (empty OCEL, trivial 1.0 fitness) since it's still a real,
        // legitimate edge case worth covering on its own.
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

    #[test]
    fn real_mode_picks_the_most_frequent_value() {
        assert_eq!(real_mode(&[1, 1, 1, 2]), 1);
        assert_eq!(real_mode(&[2, 2, 1]), 2);
    }

    #[test]
    fn real_mode_ties_break_to_the_smaller_value_deterministically() {
        assert_eq!(real_mode(&[1, 2]), 1);
        assert_eq!(real_mode(&[3, 1, 1, 3]), 1);
    }

    #[test]
    fn real_mode_empty_slice_is_zero() {
        assert_eq!(real_mode(&[]), 0);
    }

    #[test]
    fn test_oc_conformance_real_per_type_replay_and_cardinality_check() {
        // Real, previously-untestable path (see the corrected comment on
        // `test_oc_conformance_basic` above) -- now natively testable
        // since the real per-type discovery call no longer crosses the
        // wasm_bindgen JsValue boundary.
        let ocel = create_test_ocel();
        let result = oc_conformance_check_inner(&ocel).expect("real conformance check must succeed");

        let order_result = &result["Order"];
        assert!(order_result["fitness"].is_f64(), "real fitness must be present");
        let fitness = order_result["fitness"].as_f64().unwrap();
        assert!((0.0..=1.0).contains(&fitness), "real fitness out of [0,1]: {fitness}");
        assert_eq!(order_result["traces"].as_u64().unwrap(), 1, "one real Order object -> one trace");
        // Every real event in this fixture relates to exactly one Order --
        // no real cardinality deviation should be flagged.
        assert_eq!(
            order_result["cardinality_violations"].as_u64().unwrap(),
            0,
            "uniform 1-object-per-event fixture must report zero real cardinality violations"
        );
    }

    #[test]
    fn test_oc_conformance_detects_a_real_cardinality_violation() {
        // A real, constructed deviation: three "A" events relate to
        // exactly one Order (the real modal/expected pattern), a fourth
        // "A" event relates to two Orders -- a genuine event-to-object
        // cardinality outlier the old "activity present in net" check
        // could never see (it only looked at activity names, never at how
        // many real objects each event related to).
        let mut ocel = OCEL {
            event_types: vec!["A".to_string()],
            object_types: vec!["Order".to_string()],
            events: vec![],
            objects: vec![
                OCELObject {
                    id: "order1".to_string(),
                    object_type: "Order".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "order2".to_string(),
                    object_type: "Order".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "order3".to_string(),
                    object_type: "Order".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
            ],
            object_relations: vec![],
        };
        for (idx, order_id) in ["order1", "order2", "order3"].iter().enumerate() {
            ocel.events.push(OCELEvent {
                id: format!("e{idx}"),
                event_type: "A".to_string(),
                timestamp: format!("2024-01-01T{:02}:00:00Z", idx),
                attributes: std::collections::BTreeMap::new(),
                object_ids: vec![order_id.to_string()],
                object_refs: vec![],
            });
        }
        // The real deviation: relates to BOTH remaining semantics -- two
        // real distinct objects, not one.
        ocel.events.push(OCELEvent {
            id: "e_deviant".to_string(),
            event_type: "A".to_string(),
            timestamp: "2024-01-01T09:00:00Z".to_string(),
            attributes: std::collections::BTreeMap::new(),
            object_ids: vec!["order1".to_string(), "order2".to_string()],
            object_refs: vec![],
        });

        let result = oc_conformance_check_inner(&ocel).expect("real conformance check must succeed");
        let violations = result["Order"]["cardinality_violations"].as_u64().unwrap();
        assert_eq!(
            violations, 1,
            "expected exactly one real cardinality deviation (the 2-object event), got {violations}"
        );
        let sample = result["Order"]["sample_cardinality_violations"]
            .as_array()
            .expect("sample_cardinality_violations must be an array");
        assert_eq!(sample.len(), 1);
        assert_eq!(sample[0]["event_id"].as_str().unwrap(), "e_deviant");
        assert_eq!(sample[0]["observed_object_count"].as_u64().unwrap(), 2);
        assert_eq!(sample[0]["modal_object_count_for_activity"].as_u64().unwrap(), 1);
    }
}
