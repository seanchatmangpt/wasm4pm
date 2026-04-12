//! Petri net structural reduction rules.
//!
//! Applies Murata-style reduction rules to simplify a Petri net while
//! preserving behavioural equivalence (liveness, boundedness, deadlock
//! freedom).
//!
//! Four rules are applied iteratively until no further reduction is possible:
//!
//! 1. **Fusion of series places** -- remove a place that has exactly one
//!    input transition and one output transition, reconnecting the arcs.
//! 2. **Fusion of series transitions** -- remove a silent transition that
//!    has exactly one input place and one output place, reconnecting arcs.
//! 3. **Elimination of self-loop places** -- remove a place whose only
//!    preset and postset is the same single transition.
//! 4. **Elimination of identical places** -- merge places that share
//!    identical preset and postset transitions.
//!
//! Adapted from pm4wasm `algorithms::reduction` to pictl's `models::PetriNet`.

use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use std::collections::HashMap;
use wasm_bindgen::JsValue;

// ---------------------------------------------------------------------------
// Helper methods for models::PetriNet
// ---------------------------------------------------------------------------

/// Check whether a node is a transition (exists in `net.transitions`).
fn is_transition(net: &PetriNet, name: &str) -> bool {
    net.transitions.iter().any(|t| t.id == name)
}

/// Check whether a node is a place (exists in `net.places`).
fn is_place(net: &PetriNet, name: &str) -> bool {
    net.places.iter().any(|p| p.id == name)
}

/// Check whether a transition is invisible (silent).
fn is_invisible(net: &PetriNet, trans_name: &str) -> bool {
    net.transitions
        .iter()
        .find(|t| t.id == trans_name)
        .and_then(|t| t.is_invisible)
        .unwrap_or(false)
}

/// Names of transitions that have an arc into `node`.
fn preset_transitions(net: &PetriNet, node: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.to == node)
        .filter(|a| is_transition(net, &a.from))
        .map(|a| a.from.clone())
        .collect()
}

/// Names of transitions that have an arc out of `node`.
fn postset_transitions(net: &PetriNet, node: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.from == node)
        .filter(|a| is_transition(net, &a.to))
        .map(|a| a.to.clone())
        .collect()
}

/// Names of places that have an arc into `node`.
fn preset_places(net: &PetriNet, node: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.to == node)
        .filter(|a| is_place(net, &a.from))
        .map(|a| a.from.clone())
        .collect()
}

/// Names of places that have an arc out of `node`.
fn postset_places(net: &PetriNet, node: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.from == node)
        .filter(|a| is_place(net, &a.to))
        .map(|a| a.to.clone())
        .collect()
}

/// Remove a place and all arcs touching it.
fn remove_place(net: &mut PetriNet, name: &str) {
    net.places.retain(|p| p.id != name);
    net.arcs.retain(|a| a.from != name && a.to != name);
}

/// Remove a transition and all arcs touching it.
fn remove_transition(net: &mut PetriNet, name: &str) {
    net.transitions.retain(|t| t.id != name);
    net.arcs.retain(|a| a.from != name && a.to != name);
}

/// Add a place to the net.
fn add_place(net: &mut PetriNet, id: &str) {
    if !net.places.iter().any(|p| p.id == id) {
        net.places.push(PetriNetPlace {
            id: id.to_string(),
            label: id.to_string(),
            marking: None,
        });
    }
}

/// Add a transition to the net.
#[allow(dead_code)]
fn add_transition(net: &mut PetriNet, id: &str) {
    if !net.transitions.iter().any(|t| t.id == id) {
        net.transitions.push(PetriNetTransition {
            id: id.to_string(),
            label: String::new(),
            is_invisible: Some(true),
        });
    }
}

/// Add an arc to the net (source -> target).
fn add_arc(net: &mut PetriNet, from: &str, to: &str) {
    // Avoid duplicate arcs
    let exists = net.arcs.iter().any(|a| a.from == from && a.to == to);
    if !exists {
        net.arcs.push(PetriNetArc {
            from: from.to_string(),
            to: to.to_string(),
            weight: Some(1),
        });
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Result of a Petri net reduction pass.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReductionResult {
    /// Number of places before reduction.
    pub original_places: usize,
    /// Number of transitions before reduction.
    pub original_transitions: usize,
    /// Number of places after reduction.
    pub reduced_places: usize,
    /// Number of transitions after reduction.
    pub reduced_transitions: usize,
    /// Number of places removed.
    pub places_removed: usize,
    /// Number of transitions removed.
    pub transitions_removed: usize,
}

/// Apply all reduction rules to a Petri net in-place.
///
/// Rules are applied iteratively until a fixed point is reached (no further
/// reduction possible). The order of application is:
///
/// 1. Self-loop place elimination
/// 2. Fusion of series places
/// 3. Fusion of series transitions
/// 4. Identical place elimination
///
/// Returns statistics about the reduction.
pub fn reduce_petri_net(net: &mut PetriNet) -> ReductionResult {
    let original_places = net.places.len();
    let original_transitions = net.transitions.len();

    loop {
        let mut any_reduced = false;
        any_reduced |= eliminate_self_loop_places(net);
        any_reduced |= fuse_series_places(net);
        any_reduced |= fuse_series_transitions(net);
        any_reduced |= eliminate_identical_places(net);
        if !any_reduced {
            break;
        }
    }

    ReductionResult {
        original_places,
        original_transitions,
        reduced_places: net.places.len(),
        reduced_transitions: net.transitions.len(),
        places_removed: original_places - net.places.len(),
        transitions_removed: original_transitions - net.transitions.len(),
    }
}

/// Count the number of reducible elements in the Petri net without
/// actually performing any reduction.
pub fn count_reducible_elements(net: &PetriNet) -> usize {
    let mut count = 0;
    count += count_self_loop_places(net);
    count += count_series_places(net);
    count += count_series_transitions(net);
    count += count_identical_place_groups(net);
    count
}

// ---------------------------------------------------------------------------
// Rule 1: Fusion of series places
// ---------------------------------------------------------------------------

/// Remove a place with exactly one input transition and one output
/// transition, reconnecting arcs. Only applied when both transitions are
/// invisible and distinct.
fn fuse_series_places(net: &mut PetriNet) -> bool {
    let place_names: Vec<String> = net.places.iter().map(|p| p.id.clone()).collect();
    for p_name in &place_names {
        let in_trans = preset_transitions(net, p_name);
        let out_trans = postset_transitions(net, p_name);

        if in_trans.len() == 1 && out_trans.len() == 1 {
            let in_t = &in_trans[0];
            let out_t = &out_trans[0];

            // Both must be invisible and distinct.
            let in_silent = is_invisible(net, in_t);
            let out_silent = is_invisible(net, out_t);

            if in_silent && out_silent && in_t != out_t {
                // Collect targets of out_t before removal.
                let targets: Vec<String> = net
                    .arcs
                    .iter()
                    .filter(|a| a.from == *out_t)
                    .map(|a| a.to.clone())
                    .collect();
                let old_in_t = in_t.clone();
                remove_place(net, p_name);
                remove_transition(net, out_t);
                for tgt in targets {
                    if tgt != *p_name {
                        add_arc(net, &old_in_t, &tgt);
                    }
                }
                return true;
            }
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Rule 2: Fusion of series transitions
// ---------------------------------------------------------------------------

/// Remove an invisible transition that has exactly one input place and one
/// output place. The input place's preset transitions are connected directly
/// to the output place's postset transitions via intermediate places.
fn fuse_series_transitions(net: &mut PetriNet) -> bool {
    let trans_names: Vec<String> = net
        .transitions
        .iter()
        .filter(|t| is_invisible(net, &t.id))
        .map(|t| t.id.clone())
        .collect();

    for t_name in &trans_names {
        let in_places = preset_places(net, t_name);
        let out_places = postset_places(net, t_name);

        if in_places.len() == 1 && out_places.len() == 1 {
            let in_p = &in_places[0];
            let out_p = &out_places[0];

            // Skip if same place (self-loop handled by Rule 3).
            if in_p == out_p {
                continue;
            }

            let pre_trans: Vec<String> = preset_transitions(net, in_p);
            let post_trans: Vec<String> = postset_transitions(net, out_p);

            let old_in_p = in_p.clone();
            let old_out_p = out_p.clone();

            remove_place(net, &old_in_p);
            remove_place(net, &old_out_p);
            remove_transition(net, t_name);

            // Reconnect: each pre-transition -> each post-transition via a
            // new intermediate place.
            for pt in &pre_trans {
                for qt in &post_trans {
                    if pt != qt {
                        let intermediate = format!("p_merge_{}_{}", pt, qt);
                        add_place(net, &intermediate);
                        add_arc(net, pt, &intermediate);
                        add_arc(net, &intermediate, qt);
                    }
                }
            }
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Rule 3: Self-loop place elimination
// ---------------------------------------------------------------------------

/// Remove a place whose only preset and postset is the same single transition.
fn eliminate_self_loop_places(net: &mut PetriNet) -> bool {
    let place_names: Vec<String> = net.places.iter().map(|p| p.id.clone()).collect();
    for p_name in &place_names {
        let pre = preset_transitions(net, p_name);
        let post = postset_transitions(net, p_name);

        if pre.len() == 1 && post.len() == 1 && pre[0] == post[0] {
            remove_place(net, p_name);
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Rule 4: Identical place elimination
// ---------------------------------------------------------------------------

/// Merge places that have identical preset and postset transitions.
/// The first such place is kept; the others are removed.
fn eliminate_identical_places(net: &mut PetriNet) -> bool {
    let mut sig_map: HashMap<(Vec<String>, Vec<String>), Vec<String>> = HashMap::new();
    for place in &net.places {
        let mut pre = preset_transitions(net, &place.id);
        let mut post = postset_transitions(net, &place.id);
        pre.sort();
        post.sort();
        sig_map
            .entry((pre, post))
            .or_default()
            .push(place.id.clone());
    }

    for group in sig_map.values() {
        if group.len() > 1 {
            // Keep the first, remove the rest.
            for remove in &group[1..] {
                remove_place(net, remove);
            }
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Counting helpers (non-mutating)
// ---------------------------------------------------------------------------

fn count_self_loop_places(net: &PetriNet) -> usize {
    let mut count = 0;
    for place in &net.places {
        let pre = preset_transitions(net, &place.id);
        let post = postset_transitions(net, &place.id);
        if pre.len() == 1 && post.len() == 1 && pre[0] == post[0] {
            count += 1;
        }
    }
    count
}

fn count_series_places(net: &PetriNet) -> usize {
    let mut count = 0;
    for place in &net.places {
        let in_trans = preset_transitions(net, &place.id);
        let out_trans = postset_transitions(net, &place.id);
        if in_trans.len() == 1 && out_trans.len() == 1 {
            let in_silent = is_invisible(net, &in_trans[0]);
            let out_silent = is_invisible(net, &out_trans[0]);
            if in_silent && out_silent && in_trans[0] != out_trans[0] {
                count += 1;
            }
        }
    }
    count
}

fn count_series_transitions(net: &PetriNet) -> usize {
    let mut count = 0;
    for trans in &net.transitions {
        if !is_invisible(net, &trans.id) {
            continue;
        }
        let in_places = preset_places(net, &trans.id);
        let out_places = postset_places(net, &trans.id);
        if in_places.len() == 1 && out_places.len() == 1 && in_places[0] != out_places[0] {
            count += 1;
        }
    }
    count
}

fn count_identical_place_groups(net: &PetriNet) -> usize {
    let mut sig_map: HashMap<(Vec<String>, Vec<String>), usize> = HashMap::new();
    for place in &net.places {
        let mut pre = preset_transitions(net, &place.id);
        let mut post = postset_transitions(net, &place.id);
        pre.sort();
        post.sort();
        *sig_map.entry((pre, post)).or_insert(0) += 1;
    }
    // Count redundant places in groups larger than 1.
    sig_map.values().filter(|&&c| c > 1).map(|&c| c - 1).sum()
}

// ---------------------------------------------------------------------------
// WASM export
// ---------------------------------------------------------------------------

/// Reduce a stored PetriNet in-place.
///
/// Takes a PetriNet handle, applies all reduction rules, and returns
/// a JSON `ReductionResult` with before/after statistics.
pub fn wasm_reduce_petri_net(net_handle: &str) -> Result<String, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};
    use wasm_bindgen::prelude::*;

    let result = get_or_init_state().with_object_mut(net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(net)) => {
            let stats = reduce_petri_net(net);
            serde_json::to_string(&stats).map_err(|e| {
                JsValue::from_str(&format!("Failed to serialize reduction stats: {}", e))
            })
        }
        Some(_) => Err(JsValue::from_str("Object is not a PetriNet")),
        None => Err(JsValue::from_str(&format!(
            "PetriNet '{}' not found",
            net_handle
        ))),
    })?;

    Ok(result)
}

/// Count reducible elements in a stored PetriNet without mutating it.
pub fn wasm_count_reducible(net_handle: &str) -> String {
    use crate::state::{get_or_init_state, StoredObject};

    let result = get_or_init_state().with_object(net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(net)) => {
            let count = count_reducible_elements(net);
            Ok(serde_json::json!({ "reducible_count": count }).to_string())
        }
        Some(_) => Ok(r#"{"error":"Object is not a PetriNet"}"#.to_string()),
        None => Ok(format!(
            r#"{{"error":"PetriNet '{}' not found"}}"#,
            net_handle
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
    use std::collections::HashSet;

    /// Build a minimal net: p1 -> tau1 -> p2 -> tau2 -> p3
    /// where tau1 and tau2 are invisible transitions.
    fn series_place_net() -> PetriNet {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
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
            id: "tau1".into(),
            label: String::new(),
            is_invisible: Some(true),
        });
        net.transitions.push(PetriNetTransition {
            id: "tau2".into(),
            label: String::new(),
            is_invisible: Some(true),
        });
        // p1 -> tau1 -> p2 -> tau2 -> p3
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "tau1".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "tau1".into(),
            to: "p2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p2".into(),
            to: "tau2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "tau2".into(),
            to: "p3".into(),
            weight: Some(1),
        });
        net
    }

    #[test]
    fn test_fuse_series_places_reduces() {
        let mut net = series_place_net();
        let before = net.places.len();
        fuse_series_places(&mut net);
        // p2 should be removed, tau2 should be removed.
        assert!(net.places.len() < before);
        let names: HashSet<String> = net.places.iter().map(|p| p.id.clone()).collect();
        assert!(names.contains("p1"));
        assert!(names.contains("p3"));
    }

    #[test]
    fn test_self_loop_place_eliminated() {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: "p_loop".into(),
            label: "p_loop".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "t1".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        // p1 -> t1
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "t1".into(),
            weight: Some(1),
        });
        // t1 -> p_loop, p_loop -> t1 (self-loop)
        net.arcs.push(PetriNetArc {
            from: "t1".into(),
            to: "p_loop".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p_loop".into(),
            to: "t1".into(),
            weight: Some(1),
        });

        let before = net.places.len();
        eliminate_self_loop_places(&mut net);
        assert_eq!(net.places.len(), before - 1);
        let names: HashSet<String> = net.places.iter().map(|p| p.id.clone()).collect();
        assert!(names.contains("p1"));
        assert!(!names.contains("p_loop"));
    }

    #[test]
    fn test_identical_places_merged() {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
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
            id: "t1".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        net.transitions.push(PetriNetTransition {
            id: "t2".into(),
            label: "B".into(),
            is_invisible: Some(false),
        });
        // p1 and p2 both: t1 -> p -> t2
        net.arcs.push(PetriNetArc {
            from: "t1".into(),
            to: "p1".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "t2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "t1".into(),
            to: "p2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p2".into(),
            to: "t2".into(),
            weight: Some(1),
        });
        // p3 is different
        net.arcs.push(PetriNetArc {
            from: "t2".into(),
            to: "p3".into(),
            weight: Some(1),
        });

        let before = net.places.len();
        eliminate_identical_places(&mut net);
        assert_eq!(net.places.len(), before - 1);
    }

    #[test]
    fn test_reduce_petri_net_full() {
        let mut net = series_place_net();
        let result = reduce_petri_net(&mut net);
        assert!(net.places.len() <= 2);
        assert!(net.transitions.len() <= 1);
        assert!(result.places_removed > 0);
    }

    #[test]
    fn test_count_reducible_elements() {
        let net = series_place_net();
        let count = count_reducible_elements(&net);
        assert!(count > 0);
    }

    #[test]
    fn test_no_reduction_on_visible_only() {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: "p2".into(),
            label: "p2".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "A".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        net.transitions.push(PetriNetTransition {
            id: "B".into(),
            label: "B".into(),
            is_invisible: Some(false),
        });
        net.arcs.push(PetriNetArc {
            from: "p1".into(),
            to: "A".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "A".into(),
            to: "p2".into(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: "p2".into(),
            to: "B".into(),
            weight: Some(1),
        });

        assert!(!fuse_series_places(&mut net));
        assert_eq!(count_reducible_elements(&net), 0);
    }

    #[test]
    fn test_fuse_series_transitions() {
        let mut net = PetriNet::new();
        net.places.push(PetriNetPlace {
            id: "p1".into(),
            label: "p1".into(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: "p2".into(),
            label: "p2".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: "tA".into(),
            label: "A".into(),
            is_invisible: Some(false),
        });
        net.transitions.push(PetriNetTransition {
            id: "tau".into(),
            label: String::new(),
            is_invisible: Some(true),
        });
        net.transitions.push(PetriNetTransition {
            id: "tB".into(),
            label: "B".into(),
            is_invisible: Some(false),
        });
        // tA -> p1 -> tau -> p2 -> tB
        net.arcs.push(PetriNetArc {
            from: "tA".into(),
            to: "p1".into(),
            weight: Some(1),
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
            to: "tB".into(),
            weight: Some(1),
        });

        let before_places = net.places.len();
        let before_trans = net.transitions.len();
        let reduced = fuse_series_transitions(&mut net);
        assert!(reduced);
        // p1 and p2 removed, tau removed, intermediate place added
        assert!(net.transitions.len() < before_trans);
        assert!(net.places.len() < before_places);
    }

    #[test]
    fn test_empty_net_no_reduction() {
        let mut net = PetriNet::new();
        let result = reduce_petri_net(&mut net);
        assert_eq!(result.places_removed, 0);
        assert_eq!(result.transitions_removed, 0);
        assert_eq!(count_reducible_elements(&net), 0);
    }
}
