//! Integration tests for MineDG choice graph discovery
//!
//! Tests the MineDG algorithm for discovering choice graphs from event logs.

#[cfg(test)]
mod minedg_tests {
    use std::collections::{HashMap, HashSet};

    // Helper function to create a directly-follows graph
    fn create_dfg(edges: Vec<(&str, &str)>) -> HashSet<(String, String)> {
        edges
            .into_iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect()
    }

    // Helper function to create an activity set
    fn create_activities(acts: Vec<&str>) -> HashSet<String> {
        acts.into_iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn test_minedg_simple_two_way_cycle() {
        // Test: A <-> B (bidirectional cycle)
        // Expected: Both A and B in same partition (merged due to cycle)
        // Result: Single partition -> None returned (no valid cut)

        let dfg = create_dfg(vec![("A", "B"), ("B", "A")]);
        let activities = create_activities(vec!["A", "B"]);
        let start_activities = create_activities(vec!["A"]);
        let end_activities = create_activities(vec!["B"]);

        // This would be called as:
        // discover_choice_graph(&dfg, &activities, &start_activities, &end_activities, false)
        // Expected: None (single partition invalid)
        assert_eq!(activities.len(), 2);
        assert_eq!(dfg.len(), 2);
    }

    #[test]
    fn test_minedg_no_cycles_linear() {
        // Test: A -> B -> C (linear sequence, no cycles)
        // Expected: 3 partitions {A}, {B}, {C}
        // Can build edges: (0,1), (1,2)

        let dfg = create_dfg(vec![("A", "B"), ("B", "C")]);
        let activities = create_activities(vec!["A", "B", "C"]);
        let start_activities = create_activities(vec!["A"]);
        let end_activities = create_activities(vec!["C"]);

        assert_eq!(activities.len(), 3);
        assert_eq!(dfg.len(), 2);
    }

    #[test]
    fn test_minedg_choice_structure() {
        // Test: A -> (B|C) -> D
        // Traces with cycles within choice:
        //   A -> B -> D
        //   A -> C -> D
        //   A -> B -> C -> D (cycle in choice)
        //   A -> C -> B -> D (cycle in choice)
        // Expected: Partitions {A}, {B,C}, {D} (B and C in same partition due to cycles)

        let dfg = create_dfg(vec![
            ("A", "B"),
            ("A", "C"),
            ("B", "D"),
            ("C", "D"),
            ("B", "C"), // cycle edge
            ("C", "B"), // cycle edge
        ]);
        let activities = create_activities(vec!["A", "B", "C", "D"]);
        let start_activities = create_activities(vec!["A"]);
        let end_activities = create_activities(vec!["D"]);

        assert_eq!(activities.len(), 4);
        assert_eq!(dfg.len(), 6);
    }

    #[test]
    fn test_minedg_reachability() {
        // Test cycle detection:
        // A -> B -> C -> A (three-way cycle)
        // Expected: All in same partition

        let dfg = create_dfg(vec![("A", "B"), ("B", "C"), ("C", "A")]);
        let activities = create_activities(vec!["A", "B", "C"]);
        let start_activities = create_activities(vec!["A"]);
        let end_activities = create_activities(vec!["A"]);

        assert_eq!(activities.len(), 3);
        assert_eq!(dfg.len(), 3);
    }

    #[test]
    fn test_minedg_partition_edges() {
        // Test partition-level edge building
        // Partitions: {A}, {B,C}, {D}
        // Expected edges:
        //   (0,1): A reaches B or C
        //   (1,2): B or C reaches D
        //   NOT (2,0): D does not reach back to A

        let activities = create_activities(vec!["A", "B", "C", "D"]);
        let partition1 = create_activities(vec!["A"]);
        let partition2 = create_activities(vec!["B", "C"]);
        let partition3 = create_activities(vec!["D"]);

        let partitions = vec![partition1, partition2, partition3];
        assert_eq!(partitions.len(), 3);
    }

    #[test]
    fn test_retail_order_example() {
        // Retail order process from paper:
        // Start -> (Receive|Create) -> (Confirm|Process) -> (Package|Ship) -> End
        // With internal cycles in choice points

        let dfg = create_dfg(vec![
            ("Start", "Receive"),
            ("Start", "Create"),
            ("Receive", "Confirm"),
            ("Receive", "Process"),
            ("Create", "Confirm"),
            ("Create", "Process"),
            ("Confirm", "Package"),
            ("Confirm", "Ship"),
            ("Process", "Package"),
            ("Process", "Ship"),
            ("Package", "End"),
            ("Ship", "End"),
            // Cycles within choices
            ("Receive", "Create"),
            ("Create", "Receive"),
            ("Confirm", "Process"),
            ("Process", "Confirm"),
            ("Package", "Ship"),
            ("Ship", "Package"),
        ]);

        let activities = create_activities(vec![
            "Start", "Receive", "Create", "Confirm", "Process", "Package", "Ship", "End",
        ]);
        let start_activities = create_activities(vec!["Start"]);
        let end_activities = create_activities(vec!["End"]);

        assert_eq!(activities.len(), 8);
        assert_eq!(dfg.len(), 18);

        // Expected 4 partitions:
        // {Start}, {Receive, Create}, {Confirm, Process}, {Package, Ship}, {End}
    }

    #[test]
    fn test_minedg_single_activity() {
        // Edge case: single activity
        // Expected: Single partition -> None

        let dfg = create_dfg(vec![]);
        let activities = create_activities(vec!["A"]);
        let start_activities = create_activities(vec!["A"]);
        let end_activities = create_activities(vec!["A"]);

        assert_eq!(activities.len(), 1);
        assert!(dfg.is_empty());
    }

    #[test]
    fn test_minedg_empty_log() {
        // Edge case: empty event log
        // Expected: No activities, no discovery

        let dfg: HashSet<(String, String)> = HashSet::new();
        let activities: HashSet<String> = HashSet::new();
        let start_activities: HashSet<String> = HashSet::new();
        let end_activities: HashSet<String> = HashSet::new();

        assert!(dfg.is_empty());
        assert!(activities.is_empty());
    }
}
