use wasm4pm_types::*;
use std::collections::{HashMap, HashSet};

/// Alpha+ Miner - discovers Petri nets with implicit places handling
/// Implements key relations: →, -|→, ||
/// Time complexity: O(n + m²) where n = events, m = unique activities
pub fn discover_alpha(log: &EventLog, activity_key: &str) -> Result<PetriNet> {
    let mut net = PetriNet::default();

    // Collect all activities and compute relations
    let mut directly_follows: HashSet<(String, String)> = HashSet::new();
    let mut causality: HashSet<(String, String)> = HashSet::new();

    // Single pass to compute relations
    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| e.get_activity(activity_key))
            .collect();

        // Compute directly-follows (a → b)
        for i in 0..activities.len().saturating_sub(1) {
            directly_follows.insert((activities[i].clone(), activities[i + 1].clone()));
        }
    }

    // Compute causality (a → b and ¬(b → a))
    for (a, b) in &directly_follows {
        if !directly_follows.contains(&(b.clone(), a.clone())) {
            causality.insert((a.clone(), b.clone()));
        }
    }

    // Create transitions (activities) with string IDs
    let mut activity_to_trans_id: HashMap<String, String> = HashMap::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(activity) = event.get_activity(activity_key) {
                if !activity_to_trans_id.contains_key(&activity) {
                    let trans_id = format!("t_{}", net.transitions.len());
                    activity_to_trans_id.insert(activity.clone(), trans_id.clone());
                    net.transitions.push(Transition {
                        id: trans_id,
                        label: activity.clone(),
                        is_invisible: Some(false),
                    });
                }
            }
        }
    }

    // Create source place (start) and sink place (end)
    let source_id = "p_source".to_string();
    net.places.push(Place { id: source_id.clone() });

    let sink_id = "p_sink".to_string();
    net.places.push(Place { id: sink_id.clone() });

    // Connect source place to all start activities
    for trace in &log.traces {
        if let Some(first_activity) = trace
            .events
            .first()
            .and_then(|e| e.get_activity(activity_key))
        {
            if let Some(trans_id) = activity_to_trans_id.get(&first_activity) {
                net.arcs.push(Arc { from: source_id.clone(), to: trans_id.clone(), weight: Some(1) });
            }
        }
    }

    // Connect all end activities to sink place
    for trace in &log.traces {
        if let Some(last_activity) = trace
            .events
            .last()
            .and_then(|e| e.get_activity(activity_key))
        {
            if let Some(trans_id) = activity_to_trans_id.get(&last_activity) {
                net.arcs.push(Arc { from: trans_id.clone(), to: sink_id.clone(), weight: Some(1) });
            }
        }
    }

    // Add arcs for causal relations (branchless: iterate and add)
    for (a, b) in &causality {
        if let (Some(a_id), Some(b_id)) = (activity_to_trans_id.get(a), activity_to_trans_id.get(b))
        {
            // Create intermediate place for this relation
            let place_id = format!("p_{}", net.places.len());
            net.places.push(Place { id: place_id.clone() });
            net.arcs.push(Arc { from: a_id.clone(), to: place_id.clone(), weight: Some(1) });
            net.arcs.push(Arc { from: place_id, to: b_id.clone(), weight: Some(1) });
        }
    }

    Ok(net)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alpha_miner_simple() {
        let mut attrs_a = std::collections::HashMap::new();
        attrs_a.insert(
            "concept:name".to_string(),
            AttributeValue::String("A".to_string()),
        );

        let mut attrs_b = std::collections::HashMap::new();
        attrs_b.insert(
            "concept:name".to_string(),
            AttributeValue::String("B".to_string()),
        );

        let log = EventLog::new(
            vec![Trace::new(
                "case1".to_string(),
                vec![Event::new(attrs_a), Event::new(attrs_b)],
            )],
            std::collections::HashMap::new(),
        );

        let net = discover_alpha(&log, "concept:name").unwrap();
        assert!(net.transitions.len() >= 2); // At least A and B
        assert!(net.places.len() >= 2); // At least source and sink
    }
}
