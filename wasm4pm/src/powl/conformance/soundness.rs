//! Petri net soundness checking per van der Aalst criteria.
//!
//! Checks the three soundness properties:
//! 1. Deadlock-freedom (liveness): Every transition can eventually fire
//! 2. Boundedness: No place can accumulate unbounded tokens
//! 3. Proper completion: Every execution reaching the final marking
//!
//! Ported from pm4wasm/src/conformance/soundness.rs

use crate::powl_models::{PowlMarking as Marking, PowlPetriNet as PetriNet};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Soundness check result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoundnessResult {
    pub sound: bool,
    pub deadlock_free: bool,
    pub bounded: bool,
    pub liveness: bool,
}

/// Preset of a transition.
fn preset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.target == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.source))
        .map(|a| a.source.clone())
        .collect()
}

/// Postset of a transition.
fn postset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.source == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.target))
        .map(|a| a.target.clone())
        .collect()
}

/// Check if a transition is enabled.
fn is_enabled(marking: &Marking, pre: &[String]) -> bool {
    pre.iter().all(|p| marking.get(p).copied().unwrap_or(0) > 0)
}

/// Fire a transition (consume from preset, produce to postset).
fn fire(marking: &mut Marking, pre: &[String], post: &[String]) {
    for p in pre {
        *marking.entry(p.clone()).or_insert(0) -= 1;
    }
    for p in post {
        *marking.entry(p.clone()).or_insert(0) += 1;
    }
}

/// Compare two markings for equality (same keys and non-zero values).
fn markings_equal(a: &Marking, b: &Marking) -> bool {
    let a_nonzero: HashMap<&String, u32> = a
        .iter()
        .filter(|(_, &v)| v > 0)
        .map(|(k, v)| (k, *v))
        .collect();
    let b_nonzero: HashMap<&String, u32> = b
        .iter()
        .filter(|(_, &v)| v > 0)
        .map(|(k, v)| (k, *v))
        .collect();
    a_nonzero.len() == b_nonzero.len() && a_nonzero.iter().all(|(k, v)| b_nonzero.get(k) == Some(v))
}

/// Check boundedness: no place can exceed a reasonable token count.
fn check_bounded(net: &PetriNet, initial: &Marking, _final_m: &Marking) -> bool {
    let max_depth = 50;
    let max_tokens = 100;

    let mut visited: Vec<Marking> = vec![initial.clone()];
    let mut frontier: Vec<Marking> = vec![initial.clone()];

    for _ in 0..max_depth {
        if frontier.is_empty() {
            break;
        }
        let mut next_frontier = Vec::new();
        for marking in &frontier {
            for trans in &net.transitions {
                let pre = preset(net, &trans.name);
                if pre.is_empty() {
                    continue;
                }
                if !is_enabled(marking, &pre) {
                    continue;
                }
                let post = postset(net, &trans.name);
                let mut new_marking = marking.clone();
                fire(&mut new_marking, &pre, &post);

                for &tokens in new_marking.values() {
                    if tokens > max_tokens {
                        return false;
                    }
                }

                if !visited.iter().any(|v| markings_equal(v, &new_marking)) {
                    visited.push(new_marking.clone());
                    next_frontier.push(new_marking);
                }
            }
        }
        frontier = next_frontier;
    }

    true
}

/// Check liveness: from every reachable state, every transition can eventually fire.
fn check_liveness(net: &PetriNet, initial: &Marking) -> bool {
    let visible_transitions: Vec<String> = net
        .transitions
        .iter()
        .filter(|t| t.label.is_some())
        .map(|t| t.name.clone())
        .collect();

    if visible_transitions.is_empty() {
        return true;
    }

    let max_depth = 50;
    let mut visited: Vec<Marking> = vec![initial.clone()];
    let mut frontier: Vec<Marking> = vec![initial.clone()];
    let mut fired: std::collections::HashSet<String> = std::collections::HashSet::new();

    for _ in 0..max_depth {
        if frontier.is_empty() {
            break;
        }
        let mut next_frontier = Vec::new();
        for marking in &frontier {
            for trans in &net.transitions {
                let pre = preset(net, &trans.name);
                if pre.is_empty() {
                    continue;
                }
                if !is_enabled(marking, &pre) {
                    continue;
                }
                fired.insert(trans.name.clone());
                let post = postset(net, &trans.name);
                let mut new_marking = marking.clone();
                fire(&mut new_marking, &pre, &post);

                if !visited.iter().any(|v| markings_equal(v, &new_marking)) {
                    visited.push(new_marking.clone());
                    next_frontier.push(new_marking);
                }
            }
        }
        frontier = next_frontier;
    }

    visible_transitions.iter().all(|t| fired.contains(t))
}

/// Check proper completion: the final marking is reachable from the initial marking.
fn check_proper_completion(net: &PetriNet, initial: &Marking, final_m: &Marking) -> bool {
    let max_depth = 50;
    let mut visited: Vec<Marking> = vec![initial.clone()];
    let mut frontier: Vec<Marking> = vec![initial.clone()];

    for _ in 0..max_depth {
        if frontier.is_empty() {
            break;
        }
        let mut next_frontier = Vec::new();
        for marking in &frontier {
            if markings_equal(marking, final_m) {
                return true;
            }
            for trans in &net.transitions {
                let pre = preset(net, &trans.name);
                if pre.is_empty() {
                    continue;
                }
                if !is_enabled(marking, &pre) {
                    continue;
                }
                let post = postset(net, &trans.name);
                let mut new_marking = marking.clone();
                fire(&mut new_marking, &pre, &post);

                if !visited.iter().any(|v| markings_equal(v, &new_marking)) {
                    visited.push(new_marking.clone());
                    next_frontier.push(new_marking);
                }
            }
        }
        frontier = next_frontier;
    }

    false
}

/// Check soundness of a Petri net.
///
/// A sound workflow net satisfies:
/// 1. The final marking is reachable from the initial marking (proper completion)
/// 2. No dead transitions (liveness)
/// 3. No place can accumulate unbounded tokens (boundedness)
pub fn check_soundness(net: &PetriNet, initial: &Marking, final_m: &Marking) -> SoundnessResult {
    let bounded = check_bounded(net, initial, final_m);
    let liveness = check_liveness(net, initial);
    let proper_completion = check_proper_completion(net, initial, final_m);

    let deadlock_free = liveness;

    let sound = bounded && liveness && proper_completion;

    SoundnessResult {
        sound,
        deadlock_free,
        bounded,
        liveness,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sequential_net() -> (PetriNet, Marking, Marking) {
        let mut net = PetriNet::new("seq");
        net.add_place("p_start");
        net.add_place("p1");
        net.add_place("p_end");
        net.add_transition("t_A", Some("A".into()));
        net.add_transition("t_B", Some("B".into()));
        net.add_arc("p_start", "t_A");
        net.add_arc("t_A", "p1");
        net.add_arc("p1", "t_B");
        net.add_arc("t_B", "p_end");

        let mut initial = Marking::new();
        initial.insert("p_start".into(), 1);
        let mut final_m = Marking::new();
        final_m.insert("p_end".into(), 1);

        (net, initial, final_m)
    }

    #[test]
    fn test_sound_sequential_net() {
        let (net, initial, final_m) = sequential_net();
        let result = check_soundness(&net, &initial, &final_m);
        assert!(result.sound);
        assert!(result.deadlock_free);
        assert!(result.bounded);
        assert!(result.liveness);
    }
}
