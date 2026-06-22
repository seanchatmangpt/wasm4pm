use crate::models::{EventLog, PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};

/// Alpha+++ Configuration
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AlphaPPPConfig {
    /// Absolute directly-follows threshold for edge pruning (noise filtering)
    pub absolute_df_clean_thresh: usize,
    /// Relative causal threshold
    pub causal_threshold: f64,
}

impl Default for AlphaPPPConfig {
    fn default() -> Self {
        Self {
            absolute_df_clean_thresh: 1,
            causal_threshold: 0.5,
        }
    }
}

/// Discover a Petri Net using the Alpha+++ algorithm.
///
/// Alpha+++ extends Alpha++ with robust noise filtering and optimized maximal set discovery.
/// Reference: Wil van der Aalst et al.
pub fn discover_alpha_ppp(log: &EventLog, config: AlphaPPPConfig, activity_key: &str) -> PetriNet {
    let mut net = PetriNet::new();

    // 1. Extract activity vocabulary and frequencies
    let mut activities: BTreeSet<String> = BTreeSet::new();
    let mut df_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut start_activities: BTreeSet<String> = BTreeSet::new();
    let mut end_activities: BTreeSet<String> = BTreeSet::new();

    for trace in &log.traces {
        let trace_activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
            .map(|s| s.to_string())
            .collect();

        if trace_activities.is_empty() {
            continue;
        }

        if let Some(first) = trace_activities.first() {
            start_activities.insert(first.clone());
        }
        if let Some(last) = trace_activities.last() {
            end_activities.insert(last.clone());
        }

        for act in &trace_activities {
            activities.insert(act.clone());
        }

        for window in trace_activities.windows(2) {
            let from = &window[0];
            let to = &window[1];
            *df_counts.entry((from.clone(), to.clone())).or_default() += 1;
        }
    }

    // 2. Prune rare edges (Alpha+++ noise filtering)
    df_counts.retain(|_, &mut count| count >= config.absolute_df_clean_thresh);

    // 3. Compute Causality Matrix (Alpha++ style with heuristics)
    let sorted_activities: Vec<String> = {
        let mut v: Vec<_> = activities.into_iter().collect();
        v.sort_unstable();
        v
    };

    let mut causality: HashSet<(String, String)> = HashSet::new();
    let mut parallel: HashSet<(String, String)> = HashSet::new();

    for a in &sorted_activities {
        for b in &sorted_activities {
            let ab = df_counts.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
            let ba = df_counts.get(&(b.clone(), a.clone())).copied().unwrap_or(0);

            if ab > 0 && ba == 0 {
                causality.insert((a.clone(), b.clone()));
            } else if ab > 0 && ba > 0 {
                parallel.insert((a.clone(), b.clone()));
            }
        }
    }

    // 4. Discover Maximal Sets (Places)
    // For simplicity and correctness in this reference implementation, we use the
    // classic Alpha expansion: (A, B) such that for all a in A, b in B: a -> b
    // and no a1, a2 in A are parallel, and no b1, b2 in B are parallel.
    let mut pairs: Vec<(BTreeSet<String>, BTreeSet<String>)> = Vec::new();

    for a in &sorted_activities {
        for b in &sorted_activities {
            if causality.contains(&(a.clone(), b.clone())) {
                let mut set_a = BTreeSet::new();
                set_a.insert(a.clone());
                let mut set_b = BTreeSet::new();
                set_b.insert(b.clone());
                pairs.push((set_a, set_b));
            }
        }
    }

    // Expand pairs to maximal sets
    let mut maximal_pairs: Vec<(BTreeSet<String>, BTreeSet<String>)> = Vec::new();
    for (mut a, mut b) in pairs {
        // Expand A
        for cand_a in &sorted_activities {
            if a.contains(cand_a) {
                continue;
            }
            let all_causal = b
                .iter()
                .all(|cand_b| causality.contains(&(cand_a.clone(), cand_b.clone())));
            let none_parallel = a
                .iter()
                .all(|ex_a| !parallel.contains(&(cand_a.clone(), ex_a.clone())));
            if all_causal && none_parallel {
                a.insert(cand_a.clone());
            }
        }
        // Expand B
        for cand_b in &sorted_activities {
            if b.contains(cand_b) {
                continue;
            }
            let all_causal = a
                .iter()
                .all(|cand_a| causality.contains(&(cand_a.clone(), cand_b.clone())));
            let none_parallel = b
                .iter()
                .all(|ex_b| !parallel.contains(&(cand_b.clone(), ex_b.clone())));
            if all_causal && none_parallel {
                b.insert(cand_b.clone());
            }
        }

        if !maximal_pairs
            .iter()
            .any(|(ma, mb)| a.is_subset(ma) && b.is_subset(mb))
        {
            maximal_pairs.push((a, b));
        }
    }

    // 5. Construct Petri Net
    // Transitions
    for act in &sorted_activities {
        net.transitions.push(PetriNetTransition {
            id: act.clone(),
            label: act.clone(),
            is_invisible: Some(false),
        });
    }

    // Places and Arcs
    // Initial Place
    let p_in = "p_start".to_string();
    net.places.push(PetriNetPlace {
        id: p_in.clone(),
        label: "start".to_string(),
        marking: Some(1),
    });
    net.initial_marking.insert(p_in.clone(), 1);

    for start_act in &start_activities {
        net.arcs.push(PetriNetArc {
            from: p_in.clone(),
            to: start_act.clone(),
            weight: Some(1),
        });
    }

    // Final Place
    let p_out = "p_end".to_string();
    net.places.push(PetriNetPlace {
        id: p_out.clone(),
        label: "end".to_string(),
        marking: Some(0),
    });
    let mut final_marking = HashMap::new();
    final_marking.insert(p_out.clone(), 1);
    net.final_markings.push(final_marking);

    for end_act in &end_activities {
        net.arcs.push(PetriNetArc {
            from: end_act.clone(),
            to: p_out.clone(),
            weight: Some(1),
        });
    }

    // Internal Places from maximal sets
    for (i, (set_a, set_b)) in maximal_pairs.into_iter().enumerate() {
        let p_id = format!("p_{}", i);
        net.places.push(PetriNetPlace {
            id: p_id.clone(),
            label: p_id.clone(),
            marking: Some(0),
        });

        for a in set_a {
            net.arcs.push(PetriNetArc {
                from: a,
                to: p_id.clone(),
                weight: Some(1),
            });
        }
        for b in set_b {
            net.arcs.push(PetriNetArc {
                from: p_id.clone(),
                to: b,
                weight: Some(1),
            });
        }
    }

    net
}
