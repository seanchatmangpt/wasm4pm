use pictl_types::*;

/// Branchless Directly-Follows Graph discovery
/// O(n) time, single pass over event log
pub fn discover_dfg(log: &EventLog, activity_key: &str) -> Result<DFG> {
    let mut dfg = DFG::new();
    let mut node_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut edge_map: std::collections::HashMap<(usize, usize), usize> = std::collections::HashMap::new();

    // First pass: collect nodes
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(activity) = event.get_activity(activity_key) {
                let entry = node_map.entry(activity.clone()).or_insert(0);
                *entry += 1;
            }
        }
    }

    // Create DFG nodes from map
    for (activity, frequency) in node_map.iter() {
        dfg.nodes.push(DFGNode::new(activity.clone(), *frequency));
    }

    // Second pass: collect edges
    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| e.get_activity(activity_key))
            .collect();

        // Branchless edge detection: sliding window
        for window in activities.windows(2) {
            let from_idx = dfg.nodes.iter().position(|n| n.activity == window[0]);
            let to_idx = dfg.nodes.iter().position(|n| n.activity == window[1]);

            if let (Some(fi), Some(ti)) = (from_idx, to_idx) {
                let key = (fi, ti);
                let count = edge_map.entry(key).or_insert(0);
                *count += 1;
            }
        }
    }

    // Create edges from map
    for ((fi, ti), frequency) in edge_map.iter() {
        dfg.edges.push(DFGEdge::new(
            dfg.nodes[*fi].activity.clone(),
            dfg.nodes[*ti].activity.clone(),
            *frequency,
        ));
    }

    // Infer start/end activities (branchless via filter)
    for trace in &log.traces {
        if let Some(first_activity) = trace.events.first().and_then(|e| e.get_activity(activity_key)) {
            if !dfg.start_activities.contains(&first_activity) {
                dfg.start_activities.push(first_activity);
            }
        }
        if let Some(last_activity) = trace.events.last().and_then(|e| e.get_activity(activity_key)) {
            if !dfg.end_activities.contains(&last_activity) {
                dfg.end_activities.push(last_activity);
            }
        }
    }

    Ok(dfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dfg_discovery() {
        let mut attrs1 = std::collections::HashMap::new();
        attrs1.insert("concept:name".to_string(), AttributeValue::String("A".to_string()));

        let mut attrs2 = std::collections::HashMap::new();
        attrs2.insert("concept:name".to_string(), AttributeValue::String("B".to_string()));

        let log = EventLog::new(
            vec![Trace::new(
                "case1".to_string(),
                vec![Event::new(attrs1), Event::new(attrs2)],
            )],
            std::collections::HashMap::new(),
        );

        let dfg = discover_dfg(&log, "concept:name").unwrap();
        assert_eq!(dfg.nodes.len(), 2);
        assert_eq!(dfg.edges.len(), 1);
        assert_eq!(dfg.start_activities, vec!["A"]);
        assert_eq!(dfg.end_activities, vec!["B"]);
    }
}
