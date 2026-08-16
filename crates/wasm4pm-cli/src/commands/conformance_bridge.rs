//! Bridge from the external `wasm4pm-compat` log/DFG wire types to the real
//! token-based-replay conformance checker in the local `wasm4pm` crate.
//!
//! `wasm4pm_compat::event_log::EventLog` / `wasm4pm_compat::models::DFG` are
//! import/wire shapes only; they carry no conformance-checking logic of their
//! own. `wasm4pm::conformance::token_replay_pure` is the real, pure-Rust
//! token-based replay engine (shared by the wasm-bindgen
//! `check_token_based_replay` export) and is the more direct match for the
//! CLI's existing "fitness + optional precision" stub shape than the
//! alignment-based `align_etconformance` precision-only report.
//!
//! This module:
//! 1. converts a `wasm4pm_compat` `EventLog` into a `wasm4pm::models::EventLog`
//!    (attribute representation differs: `Vec<Attribute>` keyed lookup vs.
//!    `BTreeMap<String, AttributeValue>`);
//! 2. converts a `wasm4pm_compat` `DFG` into a `wasm4pm::models::PetriNet`
//!    workflow net (one transition per activity, one place per directly-follows
//!    edge, a source place feeding start activities; end activities get no
//!    output arc so a clean run drains the net to the empty final marking);
//! 3. calls `wasm4pm::conformance::token_replay_pure` on the converted pair and
//!    returns `(avg_fitness, Some(precision))` where precision is the
//!    alignment-based escaping-edges precision from `align_etconformance`
//!    computed over the same converted net.
//!
//! Known limitation of the DFG→net conversion: each directly-follows edge gets
//! its own place, so an activity with more than one predecessor requires a
//! token in every one of those incoming places before it can fire (an AND-join
//! rather than an OR-join). This is exact for purely sequential DFGs (the
//! common case exercised here) but is a simplification for heavily branching
//! DFGs with converging paths — such nets may under-report fitness relative to
//! a true OR-join semantics. This is a property of the conversion, not of
//! `token_replay_pure` itself.

use anyhow::Context;
use std::collections::BTreeMap;

use wasm4pm::conformance::token_replay_pure;
use wasm4pm::models::{
    self as wm, AttributeValue as WmAttributeValue, PetriNet, PetriNetArc, PetriNetPlace,
    PetriNetTransition,
};
use wasm4pm::align_etconformance::{compute_align_etconformance_precision, AlignETConformanceConfig};

use wasm4pm_compat::event_log::{AttributeValue as CompatAttributeValue, EventLog as CompatEventLog};
use wasm4pm_compat::models::DFG;

const START_PLACE: &str = "__bridge_start__";

fn convert_attribute_value(v: &CompatAttributeValue) -> Option<WmAttributeValue> {
    match v {
        CompatAttributeValue::String(s) => Some(WmAttributeValue::String(s.clone())),
        CompatAttributeValue::Int(i) => Some(WmAttributeValue::Int(*i)),
        CompatAttributeValue::Float(f) => Some(WmAttributeValue::Float(*f)),
        CompatAttributeValue::Boolean(b) => Some(WmAttributeValue::Boolean(*b)),
        CompatAttributeValue::Date(d) => Some(WmAttributeValue::Date(d.to_rfc3339())),
        // ID/List/Container/None have no direct 1:1 target shape needed by
        // token replay (which only reads the activity-key string attribute);
        // they are dropped rather than lossily coerced.
        _ => None,
    }
}

/// Convert a `wasm4pm-compat` wire-format event log into the local
/// `wasm4pm::models::EventLog` shape that `token_replay_pure` accepts.
pub fn convert_event_log(log: &CompatEventLog) -> wm::EventLog {
    let mut out = wm::EventLog::new();
    out.attributes = convert_attrs(&log.attributes);
    for trace in &log.traces {
        let mut wtrace = wm::Trace::new();
        wtrace.attributes = convert_attrs(&trace.attributes);
        for event in &trace.events {
            let mut wevent = wm::Event::new();
            wevent.attributes = convert_attrs(&event.attributes);
            wtrace.events.push(wevent);
        }
        out.traces.push(wtrace);
    }
    out
}

fn convert_attrs(attrs: &wasm4pm_compat::event_log::Attributes) -> wm::Attributes {
    let mut map = BTreeMap::new();
    for attr in attrs {
        if let Some(v) = convert_attribute_value(&attr.value) {
            map.insert(attr.key.clone(), v);
        }
    }
    map
}

/// Convert a `wasm4pm-compat` DFG into a workflow-net `wasm4pm::models::PetriNet`
/// suitable for `token_replay_pure`. See module docs for the AND-join
/// simplification this conversion makes on converging paths.
pub fn convert_dfg_to_petri_net(dfg: &DFG) -> PetriNet {
    let mut net = PetriNet::new();

    net.places.push(PetriNetPlace {
        id: START_PLACE.to_string(),
        label: "start".to_string(),
        marking: Some(1),
    });
    net.initial_marking.insert(START_PLACE.to_string(), 1);
    // Empty final marking: a perfectly-replayed trace must leave no tokens
    // behind anywhere in the net. End activities deliberately get no output
    // arc (see below), so a clean run drains every place exactly.
    net.final_markings.push(BTreeMap::new());

    let transition_id = |activity: &str| format!("t::{activity}");

    for node in &dfg.nodes {
        net.transitions.push(PetriNetTransition {
            id: transition_id(&node.activity),
            label: node.activity.clone(),
            is_invisible: Some(false),
        });
    }

    for activity in &dfg.start_activities {
        net.arcs.push(PetriNetArc {
            from: START_PLACE.to_string(),
            to: transition_id(activity),
            weight: Some(1),
        });
    }
    // End activities intentionally get no output arc: reaching one drains
    // its last input place and leaves the net empty, which is what the
    // empty final marking above requires for a fitness of 1.0.

    for edge in &dfg.edges {
        let place_id = format!("p::{}::{}", edge.source, edge.target);
        net.places.push(PetriNetPlace {
            id: place_id.clone(),
            label: format!("{}->{}", edge.source, edge.target),
            marking: Some(0),
        });
        net.arcs.push(PetriNetArc {
            from: transition_id(&edge.source),
            to: place_id.clone(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: place_id,
            to: transition_id(&edge.target),
            weight: Some(1),
        });
    }

    net
}

/// Real (non-stub) conformance check: token-based replay fitness plus
/// alignment-based escaping-edges precision, computed over a converted
/// workflow net derived from `dfg`.
///
/// Returns `(avg_fitness, Some(precision))`.
pub fn check_conformance_real(
    log: &CompatEventLog,
    dfg: &DFG,
    activity_key: &str,
) -> anyhow::Result<(f64, Option<f64>)> {
    let wm_log = convert_event_log(log);
    let net = convert_dfg_to_petri_net(dfg);

    let replay_result = token_replay_pure(&wm_log, &net, activity_key);

    let precision_report =
        compute_align_etconformance_precision(&wm_log, &net, &AlignETConformanceConfig::default())
            .map_err(|e| anyhow::anyhow!(e))
            .context("align-etconformance precision computation failed")?;

    Ok((replay_result.avg_fitness, Some(precision_report.precision)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{
        Attribute, AttributeValue as CAV, Event as CEvent, EventLog as CLog, Trace as CTrace,
        XESEditableAttribute,
    };
    use wasm4pm_compat::models::{DFGEdge, DFGNode};

    fn ev(activity: &str) -> CEvent {
        CEvent::with_activity(activity)
    }

    fn trace(case_id: &str, activities: &[&str]) -> CTrace {
        CTrace::new(case_id.to_string(), activities.iter().map(|a| ev(a)).collect())
    }

    fn sequential_dfg() -> DFG {
        // a -> b -> c
        DFG {
            nodes: vec![
                DFGNode::new("a".to_string(), 1),
                DFGNode::new("b".to_string(), 1),
                DFGNode::new("c".to_string(), 1),
            ],
            edges: vec![
                DFGEdge::new("a".to_string(), "b".to_string(), 1),
                DFGEdge::new("b".to_string(), "c".to_string(), 1),
            ],
            start_activities: vec!["a".to_string()],
            end_activities: vec!["c".to_string()],
        }
    }

    #[test]
    fn perfectly_fitting_log_scores_fitness_one() {
        let log = CLog::new(vec![trace("case-1", &["a", "b", "c"])], Vec::new());
        let dfg = sequential_dfg();

        let (fitness, precision) =
            check_conformance_real(&log, &dfg, "concept:name").expect("conformance check runs");

        assert_eq!(fitness, 1.0, "trace exactly matching the model must be perfectly fit");
        assert!(precision.is_some());
        let precision = precision.unwrap();
        assert!((0.0..=1.0).contains(&precision));
    }

    #[test]
    fn deviating_log_scores_less_than_perfect_fitness() {
        // Log skips "b" entirely -- a genuine deviation against a->b->c.
        let log = CLog::new(vec![trace("case-1", &["a", "c"])], Vec::new());
        let dfg = sequential_dfg();

        let (fitness, _precision) =
            check_conformance_real(&log, &dfg, "concept:name").expect("conformance check runs");

        assert!(
            fitness < 1.0,
            "trace skipping a required activity must not score perfect fitness, got {fitness}"
        );
    }

    #[test]
    fn convert_event_log_preserves_activity_names() {
        let log = CLog::new(vec![trace("case-1", &["a", "b"])], Vec::new());
        let converted = convert_event_log(&log);

        assert_eq!(converted.traces.len(), 1);
        assert_eq!(converted.traces[0].events.len(), 2);
        let first = converted.traces[0].events[0]
            .attributes
            .get("concept:name")
            .and_then(|v| v.as_string());
        assert_eq!(first, Some("a"));
    }

    #[test]
    fn convert_dfg_to_petri_net_has_expected_shape() {
        let dfg = sequential_dfg();
        let net = convert_dfg_to_petri_net(&dfg);

        assert_eq!(net.transitions.len(), 3);
        // start place + one place per edge (2 edges); end activities get no
        // dedicated sink place (see convert_dfg_to_petri_net doc comment).
        assert_eq!(net.places.len(), 3);
        assert_eq!(net.initial_marking.get(START_PLACE), Some(&1));
    }
}
