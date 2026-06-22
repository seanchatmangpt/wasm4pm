use crate::models::{DFGNode, DirectlyFollowsRelation, DFG, OCEL};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

/// Object-Centric Directly Follows Graph (OC-DFG)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCDFG {
    /// Mapping from object type to its specific Directly-Follows Graph
    pub dfgs: BTreeMap<String, DFG>,
}

impl OCDFG {
    /// Discover an OC-DFG from an OCEL log.
    ///
    /// Groups events by object ID, sorts them, and aggregates per object type.
    pub fn discover(ocel: &OCEL) -> Self {
        let mut dfgs = BTreeMap::new();

        // 1. Map object ID to its type
        let obj_to_type: HashMap<String, String> = ocel
            .objects
            .iter()
            .map(|o| (o.id.clone(), o.object_type.clone()))
            .collect();

        // 2. Group event indices by object ID
        let mut object_sequences: HashMap<String, Vec<usize>> = HashMap::new();
        for (idx, event) in ocel.events.iter().enumerate() {
            for obj_id in event.all_object_ids() {
                object_sequences
                    .entry(obj_id.to_string())
                    .or_default()
                    .push(idx);
            }
        }

        // 3. For each object type, build a DFG
        for ot in &ocel.object_types {
            let mut dfg = DFG::new();
            let mut activity_freq: HashMap<String, usize> = HashMap::new();
            let mut edge_freq: HashMap<(String, String), usize> = HashMap::new();
            let mut start_acts: HashMap<String, usize> = HashMap::new();
            let mut end_acts: HashMap<String, usize> = HashMap::new();

            // Process sequences of objects of this type
            for (obj_id, indices) in &object_sequences {
                if obj_to_type.get(obj_id) == Some(ot) {
                    // Sort indices by event timestamp
                    let mut sorted_indices = indices.clone();
                    sorted_indices.sort_unstable_by_key(|&idx| &ocel.events[idx].timestamp);

                    let activities: Vec<String> = sorted_indices
                        .iter()
                        .map(|&idx| ocel.events[idx].event_type.clone())
                        .collect();

                    if let Some(first) = activities.first() {
                        *start_acts.entry(first.clone()).or_default() += 1;
                    }
                    if let Some(last) = activities.last() {
                        *end_acts.entry(last.clone()).or_default() += 1;
                    }

                    for act in &activities {
                        *activity_freq.entry(act.clone()).or_default() += 1;
                    }

                    for pair in activities.windows(2) {
                        *edge_freq
                            .entry((pair[0].clone(), pair[1].clone()))
                            .or_default() += 1;
                    }
                }
            }

            // Populate DFG nodes
            for (act, freq) in activity_freq {
                dfg.nodes.push(DFGNode {
                    id: act.clone(),
                    label: act,
                    frequency: freq,
                });
            }

            // Populate DFG edges
            for ((from, to), freq) in edge_freq {
                dfg.edges.push(DirectlyFollowsRelation {
                    from,
                    to,
                    frequency: freq,
                });
            }

            dfg.start_activities = start_acts.into_iter().collect();
            dfg.end_activities = end_acts.into_iter().collect();

            dfgs.insert(ot.clone(), dfg);
        }

        Self { dfgs }
    }
}
