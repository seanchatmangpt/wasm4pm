//! ETConformance precision metric (Muñoz-Gama & Carmona).
//!
//! Measures how precisely a Petri net model describes the behavior observed
//! in the event log, using the observed prefix automaton: every observed log
//! prefix is a state, weighted by how often it is visited. Each state is
//! mapped to a model marking by replaying the prefix (with forced enabling
//! for non-fitting traces). At each state:
//!
//! * `enabled(s)`  = visible activity labels enabled in the model marking
//! * `observed(s)` = activities actually following that prefix in the log
//! * `escaping(s)` = `enabled(s) \ observed(s)`
//!
//! ```text
//! precision = 1 − Σ_s w(s)·|escaping(s)| / Σ_s w(s)·|enabled(s)|
//! ```
//!
//! A zero denominator (e.g. empty log) yields precision = 1.0. States are
//! keyed by the activity-sequence prefix (not the marking alone) so that
//! over-permissive models — where many prefixes collapse onto the same
//! marking — are still penalized per the ETConformance paper.

use crate::models::EventLog;
use crate::models::PetriNet;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Marking type for wasm4pm models::PetriNet
// ---------------------------------------------------------------------------

/// A marking maps place IDs to token counts (usize to match models::PetriNet).
pub type Marking = std::collections::BTreeMap<String, usize>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/// Precision result from ETConformance analysis.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrecisionResult {
    /// Overall precision score in [0.0, 1.0].
    pub precision: f64,
    /// Visit-weighted sum of |escaping(s)| over all observed states.
    pub total_escaping: u32,
    /// Visit-weighted sum of |enabled(s)| over all observed states.
    pub total_consumed: u32,
    /// Number of traces analyzed.
    pub total_traces: usize,
    /// Number of distinct observed prefix-automaton states.
    pub states_observed: usize,
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
        .is_some_and(|t| !t.label.is_empty() && t.label == label)
}

/// Check whether a node is a place.
fn is_place(net: &PetriNet, name: &str) -> bool {
    net.places.iter().any(|p| p.id == name)
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
    pre.iter().all(|p| marking.get(p).copied().unwrap_or(0) > 0)
}

/// Fire a transition: consume tokens from preset, produce tokens into postset.
fn fire(marking: &mut Marking, pre: &[String], post: &[String]) {
    for p in pre {
        let entry = marking.entry(p.clone()).or_insert(0);
        *entry = entry.saturating_sub(1);
    }
    for p in post {
        *marking.entry(p.clone()).or_default() += 1;
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
/// wasm4pm's `Event` stores attributes in a `HashMap<String, AttributeValue>`.
/// The activity is stored under `activity_key` (typically "concept:name").
fn event_activity(event: &crate::models::Event, activity_key: &str) -> Option<String> {
    event
        .attributes
        .get(activity_key)
        .and_then(|v| v.as_string())
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Observed prefix automaton
// ---------------------------------------------------------------------------

/// Labels of visible transitions enabled in `marking`.
fn enabled_visible_labels(net: &PetriNet, marking: &Marking) -> std::collections::BTreeSet<String> {
    net.transitions
        .iter()
        .filter(|t| !is_invisible(net, &t.id) && !t.label.is_empty())
        .filter(|t| is_enabled(marking, &preset(net, &t.id)))
        .map(|t| t.label.clone())
        .collect()
}

/// One state of the observed prefix automaton.
#[derive(Default)]
struct StateInfo {
    /// How many times this prefix was visited across all traces.
    visits: u64,
    /// Activities observed to follow this prefix in the log.
    observed: std::collections::BTreeSet<String>,
    /// Visible activity labels enabled in the model marking at this prefix.
    enabled: std::collections::BTreeSet<String>,
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
    _final_marking: &Marking,
    log: &EventLog,
    activity_key: &str,
) -> PrecisionResult {
    let total_traces = log.traces.len();
    // Keyed by activity-sequence prefix; U+001F separates activity names so
    // prefixes like ["ab"] and ["a","b"] cannot collide.
    let mut states: BTreeMap<String, StateInfo> = BTreeMap::new();

    for trace in &log.traces {
        let mut marking: Marking = initial_marking.clone();
        fire_silent_enabled(net, &mut marking);
        let mut prefix_key = String::new();

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

            // Record the state *before* firing: this prefix was visited and
            // `activity` was observed to follow it.
            let enabled = enabled_visible_labels(net, &marking);
            let entry = states.entry(prefix_key.clone()).or_default();
            entry.visits += 1;
            entry.observed.insert(activity.clone());
            entry.enabled = enabled;

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
                        *marking.entry(p.clone()).or_default() += 1;
                    }
                }
                first.clone()
            };

            let pre = preset(net, &chosen);
            let post = postset(net, &chosen);
            fire(&mut marking, &pre, &post);
            fire_silent_enabled(net, &mut marking);

            prefix_key.push('\u{1f}');
            prefix_key.push_str(&activity);
        }

        // Terminal state: everything still enabled here escapes (nothing
        // follows this prefix in the log).
        let enabled = enabled_visible_labels(net, &marking);
        let entry = states.entry(prefix_key).or_default();
        entry.visits += 1;
        entry.enabled = enabled;
    }

    let states_observed = states.len();
    let mut escaping_w: u64 = 0;
    let mut enabled_w: u64 = 0;
    for info in states.values() {
        let escaping = info.enabled.difference(&info.observed).count() as u64;
        escaping_w += info.visits * escaping;
        enabled_w += info.visits * info.enabled.len() as u64;
    }

    let precision = if enabled_w == 0 {
        1.0
    } else {
        (1.0 - escaping_w as f64 / enabled_w as f64).clamp(0.0, 1.0)
    };

    PrecisionResult {
        precision,
        total_escaping: escaping_w as u32,
        total_consumed: enabled_w as u32,
        total_traces,
        states_observed,
    }
}

// ---------------------------------------------------------------------------
// WASM export
// ---------------------------------------------------------------------------

/// Compute ETConformance precision for a stored EventLog and PetriNet.
///
/// Takes two handles (event log and Petri net), plus an activity key, and
/// returns a JSON `PrecisionResult`.
#[wasm_bindgen]
pub fn wasm_compute_precision(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};

    // First clone the PetriNet out of state (needed for borrow checker).
    let petri_net: Result<Option<PetriNet>, _> =
        get_or_init_state().with_object(petri_net_handle, |obj| match obj {
            Some(StoredObject::PetriNet(net)) => Ok(Some(net.clone())),
            Some(_) => Ok(None),
            None => Ok(None),
        });

    let Ok(Some(net)) = petri_net else {
        return Err(crate::error::js_val(&format!(
            r#"{{"error":"PetriNet '{}' not found or wrong type"}}"#,
            petri_net_handle
        )));
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
        .ok_or_else(|| crate::error::js_val("No final marking defined in Petri net"))?;

    let result = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let precision =
                compute_precision(&net, &initial_marking, &final_marking, log, activity_key);
            serde_json::to_string(&precision).map_err(|e| {
                crate::error::js_val(&format!("Failed to serialize precision result: {}", e))
            })
        }
        Some(_) => Err(crate::error::js_val("Object is not an EventLog")),
        None => Err(crate::error::js_val(&format!(
            "EventLog '{}' not found",
            eventlog_handle
        ))),
    })?;

    Ok(result)
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
            attributes: BTreeMap::new(),
            traces: cases
                .iter()
                .enumerate()
                .map(|(_, acts)| crate::models::Trace {
                    attributes: BTreeMap::new(),
                    events: acts
                        .iter()
                        .map(|&a| {
                            let mut attrs = std::collections::BTreeMap::new();
                            attrs.insert(
                                activity_key.to_string(),
                                AttributeValue::String(a.to_string()),
                            );
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
            states_observed: 7,
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: PrecisionResult = serde_json::from_str(&json).unwrap();
        assert!((parsed.precision - 0.75).abs() < 1e-9);
        assert_eq!(parsed.total_escaping, 10);
        assert_eq!(parsed.total_consumed, 30);
        assert_eq!(parsed.total_traces, 5);
        assert_eq!(parsed.states_observed, 7);
    }

    /// Build a flower-ish net: a single marked place `p` with self-loop
    /// transitions for the given labels — every transition is always enabled.
    fn flower_net(labels: &[&str]) -> (PetriNet, Marking, Marking) {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p".into(),
            label: "p".into(),
            marking: Some(1),
        });
        for &l in labels {
            let tid = format!("t_{}", l);
            net.transitions.push(PetriNetTransition {
                id: tid.clone(),
                label: l.into(),
                is_invisible: Some(false),
            });
            net.arcs.push(PetriNetArc {
                from: "p".into(),
                to: tid.clone(),
                weight: Some(1),
            });
            net.arcs.push(PetriNetArc {
                from: tid,
                to: "p".into(),
                weight: Some(1),
            });
        }
        let mut initial = Marking::default();
        initial.insert("p".into(), 1);
        let mut final_m = Marking::default();
        final_m.insert("p".into(), 1);
        (net, initial, final_m)
    }

    /// Build a strictly sequential net for the given labels:
    /// [p0] -> t_l0 -> [p1] -> t_l1 -> ... -> [pn]
    fn sequential_net_for(labels: &[&str]) -> (PetriNet, Marking, Marking) {
        let mut net = PetriNet::new();
        for i in 0..=labels.len() {
            net.places.push(PetriNetPlace {
                id: format!("p{}", i),
                label: format!("p{}", i),
                marking: if i == 0 { Some(1) } else { None },
            });
        }
        for (i, &l) in labels.iter().enumerate() {
            let tid = format!("t_{}", l);
            net.transitions.push(PetriNetTransition {
                id: tid.clone(),
                label: l.into(),
                is_invisible: Some(false),
            });
            net.arcs.push(PetriNetArc {
                from: format!("p{}", i),
                to: tid.clone(),
                weight: Some(1),
            });
            net.arcs.push(PetriNetArc {
                from: tid,
                to: format!("p{}", i + 1),
                weight: Some(1),
            });
        }
        let mut initial = Marking::default();
        initial.insert("p0".into(), 1);
        let mut final_m = Marking::default();
        final_m.insert(format!("p{}", labels.len()), 1);
        (net, initial, final_m)
    }

    #[test]
    fn test_flower_model_less_precise_than_fitting_sequential_model() {
        // Strictly sequential log: 5 × ⟨A, B, C⟩.
        let log = make_log(
            "concept:name",
            &[
                &["A", "B", "C"],
                &["A", "B", "C"],
                &["A", "B", "C"],
                &["A", "B", "C"],
                &["A", "B", "C"],
            ],
        );

        let (seq, seq_i, seq_f) = sequential_net_for(&["A", "B", "C"]);
        let seq_result = compute_precision(&seq, &seq_i, &seq_f, &log, "concept:name");
        // Fitting sequential model: at every state, enabled == observed
        // (terminal state enables nothing) → precision exactly 1.0.
        assert!(
            (seq_result.precision - 1.0).abs() < 1e-9,
            "sequential precision = {}",
            seq_result.precision
        );

        let (flower, fl_i, fl_f) = flower_net(&["A", "B", "C"]);
        let fl_result = compute_precision(&flower, &fl_i, &fl_f, &log, "concept:name");
        // Flower: states "", "A", "A B", "A B C" each enable {A,B,C};
        // observed is a single activity (or none at terminal) →
        // precision = 1 − (2+2+2+3)/(3+3+3+3) = 0.25.
        assert!(
            fl_result.precision < seq_result.precision,
            "flower ({}) must be less precise than sequential ({})",
            fl_result.precision,
            seq_result.precision
        );
        assert!((fl_result.precision - 0.25).abs() < 1e-9);
        assert_eq!(fl_result.states_observed, 4);
    }

    #[test]
    fn test_unknown_activity_skipped() {
        let (net, initial, final_m) = sequential_net();
        // Log with an activity not in the net
        let log = make_log("concept:name", &[&["X", "Y"]]);
        let result = compute_precision(&net, &initial, &final_m, &log, "concept:name");
        // All events are skipped, but the terminal (empty-prefix) state is
        // still recorded and enables t_A in the model.
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
        fire(&mut marking, &["p1".to_string()], &["p2".to_string()]);
        assert_eq!(marking.get("p1").copied().unwrap_or(0), 0);
        assert_eq!(marking.get("p2").copied().unwrap_or(0), 1);
    }
}
