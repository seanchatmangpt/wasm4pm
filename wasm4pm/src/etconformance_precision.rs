//! ETConformance precision metric.
//!
//! Measures how precisely a Petri net model describes the behavior observed
//! in the event log. Based on the escaping-edges approach: transitions that
//! are enabled in the model at some replay step but never actually fired are
//! "escaping edges." A model with many escaping edges is *underfitting* (too
//! permissive), and the precision score drops accordingly.
//!
//! Formula (aggregated over all traces):
//!
//! ```text
//! precision = 1 - sum(escaping) / (sum(escaping) + sum(consumed))
//! ```
//!
//! The result is clamped to [0.0, 1.0]. An empty log yields precision = 1.0.
//!
//! Adapted from pm4wasm `conformance::precision` to pictl's `models::PetriNet`.

use crate::models::EventLog;
use crate::models::PetriNet;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Marking type for pictl models::PetriNet
// ---------------------------------------------------------------------------

/// A marking maps place IDs to token counts (usize to match models::PetriNet).
pub type Marking = HashMap<String, usize>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/// Precision result from ETConformance analysis.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrecisionResult {
    /// Overall precision score in [0.0, 1.0].
    pub precision: f64,
    /// Total escaping tokens across all traces.
    pub total_escaping: u32,
    /// Total consumed tokens across all traces.
    pub total_consumed: u32,
    /// Number of traces analyzed.
    pub total_traces: usize,
}

// ---------------------------------------------------------------------------
// Petri net helpers for models::PetriNet
// ---------------------------------------------------------------------------

/// Check whether a transition is invisible (silent).
fn is_invisible(net: &PetriNet, trans_id: &str) -> bool {
    net.transitions
        .iter()
        .find(|t| t.id == trans_id)
        .and_then(|t| t.is_invisible)
        .unwrap_or(false)
}

/// Check whether a transition has a given label.
fn transition_has_label(net: &PetriNet, trans_id: &str, label: &str) -> bool {
    net.transitions
        .iter()
        .find(|t| t.id == trans_id)
        .map(|t| !t.label.is_empty() && t.label == label)
        .unwrap_or(false)
}

/// Check whether a node is a place.
fn is_place(net: &PetriNet, name: &str) -> bool {
    net.places.iter().any(|p| p.id == name)
}

/// Check whether a node is a transition.
#[allow(dead_code)]
fn is_transition(net: &PetriNet, name: &str) -> bool {
    net.transitions.iter().any(|t| t.id == name)
}

/// Input places (preset) of a transition.
fn preset(net: &PetriNet, trans_id: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.to == trans_id)
        .filter(|a| is_place(net, &a.from))
        .map(|a| a.from.clone())
        .collect()
}

/// Output places (postset) of a transition.
fn postset(net: &PetriNet, trans_id: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.from == trans_id)
        .filter(|a| is_place(net, &a.to))
        .map(|a| a.to.clone())
        .collect()
}

/// Test whether a transition is enabled (all preset places have tokens).
fn is_enabled(marking: &Marking, pre: &[String]) -> bool {
    pre.iter()
        .all(|p| marking.get(p).copied().unwrap_or(0) > 0)
}

/// Fire a transition: consume tokens from preset, produce tokens into postset.
fn fire(marking: &mut Marking, pre: &[String], post: &[String]) {
    for p in pre {
        let entry = marking.entry(p.clone()).or_insert(0);
        *entry = entry.saturating_sub(1);
    }
    for p in post {
        *marking.entry(p.clone()).or_insert(0) += 1;
    }
}

/// Fire all currently-enabled invisible (silent) transitions in a fixed-point loop.
///
/// A budget cap prevents infinite loops in cyclic nets.
fn fire_silent_enabled(net: &PetriNet, marking: &mut Marking) {
    let budget = net.transitions.len() * 4 + 16;
    let mut remaining = budget;
    loop {
        if remaining == 0 {
            break;
        }
        let mut fired = false;
        for trans in &net.transitions {
            if !is_invisible(net, &trans.id) {
                continue;
            }
            let pre = preset(net, &trans.id);
            if !pre.is_empty() && is_enabled(marking, &pre) {
                let post = postset(net, &trans.id);
                fire(marking, &pre, &post);
                remaining -= 1;
                fired = true;
                break; // restart to respect new marking
            }
        }
        if !fired {
            break;
        }
    }
}

/// Extract the activity name from a trace event.
///
/// pictl's `Event` stores attributes in a `HashMap<String, AttributeValue>`.
/// The activity is stored under `activity_key` (typically "concept:name").
fn event_activity(event: &crate::models::Event, activity_key: &str) -> Option<String> {
    event
        .attributes
        .get(activity_key)
        .and_then(|v| v.as_string())
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Per-trace computation
// ---------------------------------------------------------------------------

/// Compute escaping and consumed token counts for a single trace.
///
/// After each visible transition fires (and silent transitions are eagerly
/// resolved), we count how many *other* transitions are currently enabled but
/// will **not** be fired for the current event. Each such transition's preset
/// size contributes to the "escaping" total.
fn precision_for_trace(
    net: &PetriNet,
    initial_marking: &Marking,
    final_marking: &Marking,
    trace: &crate::models::Trace,
    activity_key: &str,
) -> (u32, u32) {
    let mut marking: Marking = initial_marking.clone();
    let mut consumed: u32 = 0;
    let mut escaping: u32 = 0;

    // Fire any initially-enabled silent transitions
    fire_silent_enabled(net, &mut marking);

    for event in &trace.events {
        let Some(activity) = event_activity(event, activity_key) else {
            continue;
        };

        // Find visible transitions matching the activity label
        let visible_candidates: Vec<String> = net
            .transitions
            .iter()
            .filter(|t| transition_has_label(net, &t.id, &activity))
            .map(|t| t.id.clone())
            .collect();

        if visible_candidates.is_empty() {
            // Activity not in net -- skip (invisible to conformance)
            continue;
        }

        // Pick the first enabled candidate; force-enable if none are ready
        let chosen = if let Some(t) = visible_candidates.iter().find(|t| {
            let pre = preset(net, t);
            is_enabled(&marking, &pre)
        }) {
            t.clone()
        } else {
            // No enabled candidate -- inject missing tokens to force-enable
            let first = &visible_candidates[0];
            for p in &preset(net, first) {
                let have = marking.get(p).copied().unwrap_or(0);
                if have == 0 {
                    *marking.entry(p.clone()).or_insert(0) += 1;
                }
            }
            first.clone()
        };

        let pre = preset(net, &chosen);
        let post = postset(net, &chosen);
        fire(&mut marking, &pre, &post);
        consumed += pre.len() as u32;

        // Fire any newly-enabled silent transitions
        fire_silent_enabled(net, &mut marking);

        // Count escaping edges: transitions enabled now that will NOT be fired
        // for the current event. Each enabled transition's preset size counts
        // as escaping tokens.
        for trans in &net.transitions {
            let trans_pre = preset(net, &trans.id);
            if !trans_pre.is_empty() && is_enabled(&marking, &trans_pre) {
                // This transition is enabled but won't be fired for this event
                if !transition_has_label(net, &trans.id, &activity) {
                    escaping += trans_pre.len() as u32;
                }
            }
        }
    }

    // Account for final marking consumption
    let final_consumed: u32 = final_marking.values().map(|&v| v as u32).sum();
    consumed += final_consumed;

    (escaping, consumed)
}

// ---------------------------------------------------------------------------
// Log-level entry point
// ---------------------------------------------------------------------------

/// Compute ETConformance precision for an event log against a Petri net.
///
/// Returns a precision score between 0.0 (model allows much more behavior
/// than observed) and 1.0 (model exactly matches observed behavior).
///
/// Mirrors `pm4py.precision_etconformance()`.
pub fn compute_precision(
    net: &PetriNet,
    initial_marking: &Marking,
    final_marking: &Marking,
    log: &EventLog,
    activity_key: &str,
) -> PrecisionResult {
    let mut total_escaping: u32 = 0;
    let mut total_consumed: u32 = 0;
    let total_traces = log.traces.len();

    for trace in &log.traces {
        let (escaping, consumed) =
            precision_for_trace(net, initial_marking, final_marking, trace, activity_key);
        total_escaping += escaping;
        total_consumed += consumed;
    }

    let precision = if total_consumed == 0 && total_escaping == 0 {
        1.0
    } else {
        let e = total_escaping as f64;
        let c = total_consumed as f64;
        (1.0 - e / (e + c)).clamp(0.0, 1.0)
    };

    PrecisionResult {
        precision,
        total_escaping,
        total_consumed,
        total_traces,
    }
}

// ---------------------------------------------------------------------------
// WASM export
// ---------------------------------------------------------------------------

/// Compute ETConformance precision for a stored EventLog and PetriNet.
///
/// Takes two handles (event log and Petri net), plus an activity key, and
/// returns a JSON `PrecisionResult`.
pub fn wasm_compute_precision(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> String {
    use crate::state::{get_or_init_state, StoredObject};

    // First clone the PetriNet out of state (needed for borrow checker).
    let petri_net: Result<Option<PetriNet>, _> =
        get_or_init_state().with_object(petri_net_handle, |obj| match obj {
            Some(StoredObject::PetriNet(net)) => Ok(Some(net.clone())),
            Some(_) => Ok(None),
            None => Ok(None),
        });

    let Ok(Some(net)) = petri_net else {
        return format!(
            r#"{{"error":"PetriNet '{}' not found or wrong type"}}"#,
            petri_net_handle
        );
    };

    let initial_marking: Marking = net
        .places
        .iter()
        .filter_map(|p| p.marking.map(|m| (p.id.clone(), m)))
        .collect();

    let final_marking: Marking = net
        .final_markings
        .first()
        .cloned()
        .unwrap_or_default();

    let result = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let precision =
                compute_precision(&net, &initial_marking, &final_marking, log, activity_key);
            Ok(serde_json::to_string(&precision).unwrap_or_default())
        }
        Some(_) => Ok(r#"{"error":"Object is not an EventLog"}"#.to_string()),
        None => Ok(format!(
            r#"{{"error":"EventLog '{}' not found"}}"#,
            eventlog_handle
        )),
    });

    result.unwrap_or_else(|e| format!(r#"{{"error":"{:?}"}}"#, e))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, PetriNetArc, PetriNetPlace, PetriNetTransition};

    /// Build a simple sequential net: [p_start] -> t_A -> [p1] -> t_B -> [p_end]
    fn sequential_net() -> (PetriNet, Marking, Marking) {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p_start".into(),
            label: "p_start".into(),
            marking: Some(1),
        });
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: "p_end".into(),
            label: "p_end".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "t_A".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        net.transitions.push(PetriNetTransition {
            id: "t_B".into(),
            label: "B".into(),
            is_invisible: Some(false),
        });
        // p_start -> t_A -> p1 -> t_B -> p_end
        net.arcs.push(PetriNetArc {
            from: "p_start".into(),
            to: "t_A".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "t_A".into(),
            to: "p1".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "t_B".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "t_B".into(),
            to: "p_end".into(),
            weight: Some(1),
        });

        let mut initial = Marking::default();
        initial.insert("p_start".into(), 1);
        let mut final_m = Marking::default();
        final_m.insert("p_end".into(), 1);

        (net, initial, final_m)
    }

    fn make_log(activity_key: &str, cases: &[&[&str]]) -> EventLog {
        EventLog {
            attributes: HashMap::default(),
            traces: cases
                .iter()
                .enumerate()
                .map(|(_, acts)| crate::models::Trace {
                    attributes: HashMap::default(),
                    events: acts
                        .iter()
                        .map(|&a| {
                            let mut attrs = HashMap::default();
                            attrs.insert(activity_key.to_string(), AttributeValue::String(a.to_string()));
                            crate::models::Event { attributes: attrs }
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    #[test]
    fn test_perfect_log_high_precision() {
        let (net, initial, final_m) = sequential_net();
        let log = make_log("concept:name", &[&["A", "B"], &["A", "B"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        // Sequential net with matching traces should have high precision
        assert!(result.precision >= 0.5);
    }

    #[test]
    fn test_precision_between_zero_and_one() {
        let (net, initial, final_m) = sequential_net();
        let log = make_log("concept:name", &[&["A", "B"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        assert!(result.precision >= 0.0);
        assert!(result.precision <= 1.0);
    }

    #[test]
    fn test_empty_log_returns_one() {
        let (net, initial, final_m) = sequential_net();
        let log = make_log("concept:name", &[]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        assert!((result.precision - 1.0).abs() < 1e-9);
        assert_eq!(result.total_escaping, 0);
        assert_eq!(result.total_consumed, 0);
        assert_eq!(result.total_traces, 0);
    }

    #[test]
    fn test_single_trace_count() {
        let (net, initial, final_m) = sequential_net();
        let log = make_log("concept:name", &[&["A", "B"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        assert_eq!(result.total_traces, 1);
    }

    #[test]
    fn test_precision_result_serialization() {
        let result = PrecisionResult {
            precision: 0.75,
            total_escaping: 10,
            total_consumed: 30,
            total_traces: 5,
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: PrecisionResult = serde_json::from_str(&json).unwrap();
        assert!((parsed.precision - 0.75).abs() < 1e-9);
        assert_eq!(parsed.total_escaping, 10);
        assert_eq!(parsed.total_consumed, 30);
        assert_eq!(parsed.total_traces, 5);
    }

    #[test]
    fn test_unknown_activity_skipped() {
        let (net, initial, final_m) = sequential_net();
        // Log with an activity not in the net
        let log = make_log("concept:name", &[&["X", "Y"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        // All activities are unknown, so nothing consumed and nothing escaping
        // Final marking consumption still happens
        assert!(result.total_consumed > 0);
    }

    #[test]
    fn test_silent_transition_firing() {
        let mut net = PetriNet::new();
        // p1 -> tau -> p2 -> tA -> p3
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: Some(1),
        });
        net.places.push(PetriNetPlace {
            id: "p2".into(),
            label: "p2".into(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: "p3".into(),
            label: "p3".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "tau".into(),
            label: String::new(),
            is_invisible: Some(true),
        });
        net.transitions.push(PetriNetTransition {
            id: "tA".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "tau".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "tau".into(),
            to: "p2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p2".into(),
            to: "tA".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "tA".into(),
            to: "p3".into(),
            weight: Some(1),
        });

        let mut initial = Marking::default();
        initial.insert("p1".into(), 1);
        let final_m = Marking::default();

        let log = make_log("concept:name", &[&["A"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        // Silent transition should fire, enabling tA
        assert!(result.total_consumed > 0);
        assert!(result.precision >= 0.0);
        assert!(result.precision <= 1.0);
    }

    #[test]
    fn test_preset_postset_helpers() {
        let (net, _, _) = sequential_net();
        let pre = preset(&net, "t_A");
        assert_eq!(pre, vec!["p_start"]);
        let post = postset(&net, "t_A");
        assert_eq!(post, vec!["p1"]);
    }

    #[test]
    fn test_is_enabled() {
        let mut marking = Marking::default();
        marking.insert("p1".into(), 1);
        assert!(is_enabled(&marking, &["p1".to_string()]));
        assert!(!is_enabled(&marking, &["p2".to_string()]));
        // Empty preset: all() on empty iterator returns true (vacuously true).
        // This is the correct Petri net semantics for a transition with no input places.
        assert!(is_enabled(&marking, &[]));
    }

    #[test]
    fn test_fire_transition() {
        let mut marking = Marking::default();
        marking.insert("p1".into(), 1);
        marking.insert("p2".into(), 0);
        fire(
            &mut marking,
            &["p1".to_string()],
            &["p2".to_string()],
        );
        assert_eq!(marking.get("p1").copied().unwrap_or(0), 0);
        assert_eq!(marking.get("p2").copied().unwrap_or(0), 1);
    }
}
