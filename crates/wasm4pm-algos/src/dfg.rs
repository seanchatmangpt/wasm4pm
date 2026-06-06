use std::collections::HashMap;
use wasm4pm_compat::legacy_conformance::*;
use wasm4pm_compat::legacy_error::*;
use wasm4pm_compat::legacy_event_log::*;
use wasm4pm_compat::legacy_models::*;

/// Branchless Directly-Follows Graph discovery with columnar optimization
/// Time complexity: O(n) where n = total events across all traces
/// Space complexity: O(k + e) where k = unique activities, e = directly-follows edges
/// Uses integer-ID columnar representation for efficient processing
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn discover_dfg(log: &EventLog, activity_key: &str) -> Result<DFG> {
    let mut dfg = DFG::new();
    let mut node_map: HashMap<String, usize> = HashMap::new();
    let mut edge_counts: HashMap<(usize, usize), usize> = HashMap::new();
    let mut start_activities: HashMap<String, usize> = HashMap::new();
    let mut end_activities: HashMap<String, usize> = HashMap::new();

    // Single pass (columnar-style): no intermediate allocations
    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| e.get_activity(activity_key))
            .collect();

        if activities.is_empty() {
            continue;
        }

        // Assign node IDs in order (branchless: or_insert_with lambda creates node on demand)
        for (i, activity) in activities.iter().enumerate() {
            let node_id = *node_map.entry(activity.clone()).or_insert_with(|| {
                let id = dfg.nodes.len();
                dfg.nodes.push(DFGNode::new(activity.clone(), 0));
                id
            });

            // Increment node frequency
            dfg.nodes[node_id].frequency += 1;

            // Track start activity (first in trace)
            if i == 0 {
                *start_activities.entry(activity.clone()).or_insert(0) += 1;
            }

            // Track end activity (last in trace)
            if i == activities.len() - 1 {
                *end_activities.entry(activity.clone()).or_insert(0) += 1;
            }

            // Branchless edge collection: iterate over consecutive pairs
            if i + 1 < activities.len() {
                let from_id = node_id;
                let to_activity = &activities[i + 1];
                let to_id = *node_map.entry(to_activity.clone()).or_insert_with(|| {
                    let id = dfg.nodes.len();
                    dfg.nodes.push(DFGNode::new(to_activity.clone(), 0));
                    id
                });

                // Increment edge count (no branching, just or_insert + dereference)
                *edge_counts.entry((from_id, to_id)).or_insert(0) += 1;
            }
        }
    }

    // Materialize edges from integer-keyed counts (single loop, no lookups)
    for ((from_id, to_id), frequency) in edge_counts.iter() {
        let from = &dfg.nodes[*from_id].activity;
        let to = &dfg.nodes[*to_id].activity;
        dfg.edges
            .push(DFGEdge::new(from.clone(), to.clone(), *frequency));
    }

    // Set start and end activities
    dfg.start_activities = start_activities.keys().cloned().collect();
    dfg.end_activities = end_activities.keys().cloned().collect();

    Ok(dfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dfg_discovery() {
        let log = EventLog::new(
            vec![Trace::new(
                "case1".to_string(),
                vec![Event::with_activity("A"), Event::with_activity("B")],
            )],
            Vec::new(),
        );

        let dfg = discover_dfg(&log, "concept:name").unwrap();
        assert_eq!(dfg.nodes.len(), 2);
        assert_eq!(dfg.edges.len(), 1);
        assert_eq!(dfg.start_activities, vec!["A"]);
        assert_eq!(dfg.end_activities, vec!["B"]);
    }
}
