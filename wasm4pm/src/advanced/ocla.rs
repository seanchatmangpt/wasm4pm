use crate::models::OCEL;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Object-Centric Language Abstraction (OCLA)
///
/// Provides a footprint-style abstraction for object-centric event logs.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct OCLanguageAbstraction {
    /// Start event types per object type
    pub start_ev_types: HashMap<String, HashSet<String>>,
    /// End event types per object type
    pub end_ev_types: HashMap<String, HashSet<String>>,
    /// Directly-follows relations per object type
    pub directly_follows: HashMap<String, HashSet<(String, String)>>,
}

impl OCLanguageAbstraction {
    /// Create OCLA from an OCEL log.
    pub fn create_from_ocel(ocel: &OCEL) -> Self {
        let mut abstraction = Self::default();

        // 1. Pre-map Object ID to Object Type
        let obj_to_type: HashMap<String, String> = ocel
            .objects
            .iter()
            .map(|o| (o.id.clone(), o.object_type.clone()))
            .collect();

        // 2. Group event indices by object instance
        let mut object_traces: HashMap<String, Vec<usize>> = HashMap::new();
        for (idx, event) in ocel.events.iter().enumerate() {
            for obj_id in event.all_object_ids() {
                object_traces
                    .entry(obj_id.to_string())
                    .or_default()
                    .push(idx);
            }
        }

        // 3. Compute footprints
        for (obj_id, event_indices) in object_traces {
            if let Some(obj_type) = obj_to_type.get(&obj_id) {
                if event_indices.is_empty() {
                    continue;
                }

                // Bounds check: ensure all indices exist in events array
                if event_indices.iter().any(|&idx| idx >= ocel.events.len()) {
                    continue; // Skip invalid indices
                }

                // Group events by object instance and sort by timestamp
                let mut sorted_indices = event_indices;
                sorted_indices.sort_unstable_by_key(|&idx| &ocel.events[idx].timestamp);

                let first_ev = &ocel.events[sorted_indices[0]].event_type;
                let last_ev = &ocel.events[*sorted_indices.last().unwrap()].event_type;

                abstraction
                    .start_ev_types
                    .entry(obj_type.clone())
                    .or_default()
                    .insert(first_ev.clone());
                abstraction
                    .end_ev_types
                    .entry(obj_type.clone())
                    .or_default()
                    .insert(last_ev.clone());

                let df_set = abstraction
                    .directly_follows
                    .entry(obj_type.clone())
                    .or_default();
                for window in sorted_indices.windows(2) {
                    let e1 = &ocel.events[window[0]].event_type;
                    let e2 = &ocel.events[window[1]].event_type;
                    df_set.insert((e1.clone(), e2.clone()));
                }
            }
        }

        abstraction
    }
}
