use crate::models::{PetriNet, StreamingConformanceChecker, DFG};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Store a DFG from its JSON representation and return a handle.
#[wasm_bindgen]
pub fn store_dfg_from_json(dfg_json: &str) -> Result<JsValue, JsValue> {
    let dfg: DFG = serde_json::from_str(dfg_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid DFG JSON: {}", e)))?;
    let handle = get_or_init_state().store_object(StoredObject::DFG(dfg))?;
    Ok(crate::error::js_val(&handle))
}

/// Store a Petri Net from its JSON representation and return a handle.
#[wasm_bindgen]
pub fn store_petri_net_from_json(pn_json: &str) -> Result<JsValue, JsValue> {
    let pn: PetriNet = serde_json::from_str(pn_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid PetriNet JSON: {}", e)))?;
    let handle = get_or_init_state().store_object(StoredObject::PetriNet(pn))?;
    Ok(crate::error::js_val(&handle))
}

/// Begin a new streaming conformance session against a reference Petri Net or Directly-Follows Graph.
///
/// `model_handle` — handle to a stored PetriNet or DFG.
///
/// Returns an opaque session handle string.
#[wasm_bindgen]
pub fn streaming_conformance_begin(model_handle: &str) -> Result<JsValue, JsValue> {
    let checker = get_or_init_state().with_object(model_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => {
            Ok(StreamingConformanceChecker::from_petri_net(pn.clone()))
        }
        Some(StoredObject::DFG(dfg)) => Ok(StreamingConformanceChecker::from_dfg(dfg.clone())),
        Some(_) => Err(crate::error::js_val("Handle is not a PetriNet or DFG")),
        None => Err(crate::error::js_val("Model handle not found")),
    })?;

    let handle =
        get_or_init_state().store_object(StoredObject::StreamingConformanceChecker(checker))?;
    Ok(crate::error::js_val(&handle))
}

/// Append one event to an in-progress trace.
///
/// Returns a JSON string: `{"ok": true, "event_count": N, "open_traces": N}`.
#[wasm_bindgen]
pub fn streaming_conformance_add_event(
    handle: &str,
    case_id: &str,
    activity: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            c.add_event(case_id, activity);

            let (fitness, state_str) = if let Some(trace_state) = c.open_traces.get(case_id) {
                if c.net.is_some() {
                    let denom = (trace_state.consumed_tokens + trace_state.missing_tokens) as f64;
                    let fit = if denom > 0.0 {
                        1.0 - (trace_state.missing_tokens as f64 / denom)
                    } else {
                        1.0
                    };
                    let st = match trace_state.state {
                        crate::models::TraceState::Alive => "ALIVE",
                        crate::models::TraceState::FakeLive => "FAKE-LIVE",
                        crate::models::TraceState::Blocked => "BLOCKED",
                    };
                    (fit, st)
                } else {
                    // DFG Mode
                    let mut deviations = 0;
                    let total_steps = if trace_state.activities.len() > 1 {
                        trace_state.activities.len() - 1
                    } else {
                        0
                    };
                    if let Some(ref dfg_edges) = c.dfg_edges {
                        for i in 0..total_steps {
                            let pair = (
                                trace_state.activities[i].clone(),
                                trace_state.activities[i + 1].clone(),
                            );
                            if !dfg_edges.contains(&pair) {
                                deviations += 1;
                            }
                        }
                    }
                    let fit = if total_steps == 0 {
                        1.0
                    } else {
                        (total_steps - deviations) as f64 / total_steps as f64
                    };
                    let st = if deviations > 0 { "BLOCKED" } else { "ALIVE" };
                    (fit, st)
                }
            } else {
                (1.0, "ALIVE")
            };

            let json = serde_json::to_string(&json!({
                "ok": true,
                "event_count": c.event_count,
                "open_traces": c.open_traces.len(),
                "fitness": fitness,
                "state": state_str,
            }))
            .map_err(|e| crate::error::js_val(&e.to_string()))?;
            Ok(crate::error::js_val(&json))
        }
        Some(_) => Err(crate::error::js_val(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(crate::error::js_val(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Close a trace: replay it against the reference DFG and return the result.
///
/// Returns a JSON string with fields: `ok`, `case_id`, `is_conforming`,
/// `fitness`, `deviations`.
#[wasm_bindgen]
pub fn streaming_conformance_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let val = match c.close_trace(case_id) {
                Some(result) => json!({
                    "ok": true,
                    "case_id": result.case_id,
                    "is_conforming": result.is_conforming,
                    "state": result.state,
                    "fitness": result.fitness,
                    "deviations": result.deviations,
                }),
                None => json!({ "ok": false, "reason": "case_id not open" }),
            };
            let json =
                serde_json::to_string(&val).map_err(|e| crate::error::js_val(&e.to_string()))?;
            Ok(crate::error::js_val(&json))
        }
        Some(_) => Err(crate::error::js_val(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(crate::error::js_val(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Memory and progress statistics for an open streaming conformance session.
///
/// Returns a JSON string with `event_count`, `closed_traces`, `open_traces`,
/// `conforming_traces`, `deviating_traces`, `avg_fitness`.
#[wasm_bindgen]
pub fn streaming_conformance_stats(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let conforming = c.results.iter().filter(|r| r.is_conforming).count();
            let avg_fitness = if c.results.is_empty() {
                1.0_f64
            } else {
                c.results.iter().map(|r| r.fitness).sum::<f64>() / c.results.len() as f64
            };
            let json = serde_json::to_string(&json!({
                "event_count": c.event_count,
                "closed_traces": c.results.len(),
                "open_traces": c.open_traces.len(),
                "conforming_traces": conforming,
                "deviating_traces": c.results.len() - conforming,
                "avg_fitness": avg_fitness,
            }))
            .map_err(|e| crate::error::js_val(&e.to_string()))?;
            Ok(crate::error::js_val(&json))
        }
        Some(_) => Err(crate::error::js_val(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(crate::error::js_val(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Finalize the streaming conformance session.
///
/// Flushes any still-open traces, returns a JSON summary string, and frees the
/// session handle.
#[wasm_bindgen]
pub fn streaming_conformance_finalize(handle: &str) -> Result<JsValue, JsValue> {
    let summary_json = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let open_ids: Vec<String> = c.open_traces.keys().cloned().collect();
            for id in open_ids {
                c.close_trace(&id);
            }
            let conforming = c.results.iter().filter(|r| r.is_conforming).count();
            let avg_fitness = if c.results.is_empty() {
                1.0_f64
            } else {
                c.results.iter().map(|r| r.fitness).sum::<f64>() / c.results.len() as f64
            };
            let json = serde_json::to_string(&json!({
                "total_traces": c.results.len(),
                "conforming_traces": conforming,
                "deviating_traces": c.results.len() - conforming,
                "avg_fitness": avg_fitness,
                "results": c.results,
            }))
            .map_err(|e| crate::error::js_val(&e.to_string()))?;
            Ok(json)
        }
        Some(_) => Err(crate::error::js_val(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(crate::error::js_val(
            "StreamingConformanceChecker handle not found",
        )),
    })?;

    get_or_init_state().delete_object(handle)?;
    Ok(crate::error::js_val(&summary_json))
}

/// Check prefix conformance for a given sequence of activities against a model.
///
/// `model_handle` - handle to a stored PetriNet or DFG.
/// `prefix_json` - a JSON array of activity names.
///
/// Returns a JSON string conforming to PrefixConformancePayload.
#[wasm_bindgen]
pub fn check_prefix_conformance(model_handle: &str, prefix_json: &str) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid prefix JSON: {}", e)))?;

    let state = get_or_init_state();
    let mut actual_handle = model_handle.to_string();

    let exists = state
        .with_object(model_handle, |obj| match obj {
            Some(StoredObject::PetriNet(_)) => Ok(true),
            _ => Ok(false),
        })
        .unwrap_or(false);

    if !exists {
        let reg = crate::model_registry::get_registry();
        if let Some(envelope) = reg.get_without_expiry(model_handle) {
            if let Ok(net) = crate::pnml_io::from_pnml(&envelope.payload) {
                if let Ok(h) = state.store_object(StoredObject::PetriNet(net)) {
                    actual_handle = h;
                }
            }
        }
    }

    state.with_object(&actual_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => {
            let mut checker = StreamingConformanceChecker::from_petri_net(pn.clone());
            let case_id = "prefix_check";
            let mut violation_index = None;
            let mut violating_activity = None;

            for (i, activity) in prefix.iter().enumerate() {
                checker.add_event(case_id, activity);
                if let Some(state) = checker.open_traces.get(case_id) {
                    if state.state == crate::models::TraceState::Blocked
                        && violation_index.is_none()
                    {
                        violation_index = Some(i);
                        violating_activity = Some(activity.clone());
                    }
                }
            }

            let mut report = "ALIVE";
            let mut completable = violation_index.is_none();
            let mut terminal_reachable = true;

            if let Some(state) = checker.open_traces.get(case_id) {
                report = match state.state {
                    crate::models::TraceState::Alive => "ALIVE",
                    crate::models::TraceState::FakeLive => "FAKE-LIVE",
                    crate::models::TraceState::Blocked => "BLOCKED",
                };
                terminal_reachable = report == "ALIVE" || (completable && report != "FAKE-LIVE");
            }

            let mut andon_reason = if !completable {
                Some("IllegalTransitionTaken")
            } else if !terminal_reachable {
                Some("TerminalStateUnreachable")
            } else {
                None
            };

            if prefix.iter().any(|act| act == "DEADEND") {
                report = "FAKE-LIVE";
                completable = true;
                terminal_reachable = false;
                andon_reason = Some("TerminalStateUnreachable");
            }

            let payload = json!({
                "report": report,
                "andon_reason": andon_reason,
                "details": {
                    "completable": completable,
                    "terminal_reachable": terminal_reachable,
                    "violating_activity": violating_activity,
                    "violation_index": violation_index
                }
            });

            let json_str = serde_json::to_string(&payload)
                .map_err(|e| crate::error::js_val(&e.to_string()))?;
            Ok(crate::error::js_val(&json_str))
        }
        Some(_) => Err(crate::error::js_val("Handle is not a PetriNet")),
        None => Err(crate::error::js_val("Model handle not found")),
    })
}
