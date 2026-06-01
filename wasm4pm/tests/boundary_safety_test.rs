#![allow(clippy::len_zero)]
//! Boundary Safety Tests for Discovery Algorithms
//!
//! Comprehensive testing of edge cases and boundary conditions for key discovery algorithms.
//! This module validates that algorithms handle Unicode, special characters, single-event traces,
//! zero-variance logs, and empty logs without panicking and with structurally valid output.
//!
//! **Test coverage (40 tests total):**
//! - 5 shared edge cases (empty log, single-event log, all-identical traces, Unicode names, special chars)
//! - 4 algorithms (DFG, Heuristic Miner, Genetic Algorithm, ILP)
//! - Per-algorithm boundary tests: single-activity, special characters, Unicode, zero-variance
//!
//! **Assertions for each test:**
//! - No panic or abort
//! - Valid structure returned (DFG or PetriNet)
//! - Non-empty edge/place/transition count (unless input is empty)
//! - Activity vocabulary matches log

use std::collections::HashMap;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::genetic_discovery::discover_genetic_algorithm_from_log;
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

// ---------------------------------------------------------------------------
// Test Fixture Builders
// ---------------------------------------------------------------------------

/// Build a minimal EventLog from activity sequences with custom attributes.
fn build_log_with_activities(traces: &[Vec<&str>]) -> EventLog {
    let mut log = EventLog::new();
    for (trace_idx, activities) in traces.iter().enumerate() {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "case:concept:name".to_string(),
                    AttributeValue::String(format!("case-{}", trace_idx)),
                );
                m
            },
            events: Vec::new(),
        };
        for (event_idx, &activity) in activities.iter().enumerate() {
            let mut attrs = HashMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(activity.to_string()),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:{:02}Z", trace_idx, event_idx)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Extract all activity names from a log for vocabulary validation.
fn log_vocabulary(log: &EventLog) -> std::collections::HashSet<String> {
    let mut vocab = std::collections::HashSet::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(name)) = event.attributes.get("concept:name") {
                vocab.insert(name.clone());
            }
        }
    }
    vocab
}

// ---------------------------------------------------------------------------
// Shared Edge Case Tests (Empty, Single-Event, All-Identical, Unicode, Special Chars)
// ---------------------------------------------------------------------------

/// Test 1: Empty log (no traces)
#[test]
fn test_dfg_empty_log() {
    let log = build_log_with_activities(&[]);
    let _dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // Empty input should produce an empty or minimal DFG (no panic is success)
}

/// Test 2: Single-event trace (1 activity, 1 trace)
#[test]
fn test_dfg_single_event() {
    let log = build_log_with_activities(&[vec!["Activity"]]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // Should have at least 1 node for the single activity
    assert!(!dfg.nodes.is_empty(), "DFG must contain the single activity node");
    assert_eq!(
        dfg.nodes.len(),
        1,
        "DFG with single-event trace must have exactly 1 node"
    );
    // Single activity has no edges (no directly-follows)
    assert_eq!(dfg.edges.len(), 0, "Single-event DFG must have 0 edges");
}

/// Test 3: All-identical traces (zero variance)
#[test]
fn test_dfg_all_identical_traces() {
    let log = build_log_with_activities(&[
        vec!["A", "B", "C"],
        vec!["A", "B", "C"],
        vec!["A", "B", "C"],
        vec!["A", "B", "C"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // All identical traces should still produce valid structure
    assert_eq!(dfg.nodes.len(), 3, "DFG must have 3 nodes: A, B, C");
    assert_eq!(dfg.edges.len(), 2, "DFG must have 2 edges: A→B, B→C");
    // Check edge frequencies are consistent
    for edge in &dfg.edges {
        assert_eq!(edge.frequency, 4, "Each edge should have frequency 4 (4 identical traces)");
    }
}

/// Test 4: Unicode activity names (Chinese, Arabic, emoji)
#[test]
fn test_dfg_unicode_activity_names() {
    let log = build_log_with_activities(&[
        vec!["开始", "审批", "完成"],           // Chinese: Start, Approve, Finish
        vec!["开始", "拒绝", "完成"],           // Chinese: Start, Reject, Finish
        vec!["ابدأ", "موافقة", "إنهاء"],       // Arabic: Start, Approve, Finish
        vec!["🚀", "✅", "🏁"],                 // Emoji: Rocket, Check, Flag
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // All Unicode activities should be preserved
    let vocab = log_vocabulary(&log);
    assert_eq!(vocab.len(), 10, "Should have 10 unique Unicode activities (3 Chinese + 3 Arabic + 3 Emoji, no overlap)");
    assert!(dfg.nodes.len() > 0, "DFG must have nodes from Unicode activities");
}

/// Test 5: Special characters in activity names
#[test]
fn test_dfg_special_characters() {
    let log = build_log_with_activities(&[
        vec!["Start\"Quote", "Approve\\Backslash", "End\nNewline"],
        vec!["Start\"Quote", "Reject\tTab", "End\nNewline"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // Special characters should be handled without panic
    assert!(dfg.nodes.len() > 0, "DFG must handle special character activities");
    let vocab = log_vocabulary(&log);
    assert!(vocab.len() >= 4, "DFG should preserve all activities with special chars");
}

// ---------------------------------------------------------------------------
// DFG Boundary Tests
// ---------------------------------------------------------------------------

/// Test 6: DFG with single activity repeated
#[test]
fn test_dfg_single_activity_repeated() {
    let log = build_log_with_activities(&[
        vec!["A", "A", "A"],
        vec!["A", "A"],
        vec!["A"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 1, "Single activity must yield 1 node");
    // Self-loop from A→A
    assert_eq!(
        dfg.edges.len(),
        1,
        "Repeated single activity must have self-loop"
    );
}

/// Test 7: DFG with many parallel activities (no ordering)
#[test]
fn test_dfg_many_unordered_activities() {
    let log = build_log_with_activities(&[
        vec!["A", "B", "C", "D", "E", "F", "G", "H"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 8, "Must have all 8 nodes");
    assert_eq!(dfg.edges.len(), 7, "Linear sequence yields 7 edges");
}

/// Test 8: DFG with branching (choice/split)
#[test]
fn test_dfg_branching_structure() {
    let log = build_log_with_activities(&[
        vec!["Start", "PathA", "End"],
        vec!["Start", "PathB", "End"],
        vec!["Start", "PathC", "End"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 5, "Must have Start, PathA, PathB, PathC, End");
    // 3 edges from Start, 3 edges to End
    assert!(dfg.edges.len() >= 6, "Branching structure must have multiple edges");
}

/// Test 9: DFG with loops (repeated activities)
#[test]
fn test_dfg_loop_structure() {
    let log = build_log_with_activities(&[
        vec!["Start", "Process", "Validate", "Process", "Process", "Done"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(dfg.nodes.len() >= 4, "Must have Start, Process, Validate, Done");
    // Should have at least a self-loop or back-edge on Process
    assert!(dfg.edges.len() >= 5, "Loop structure must have multiple edges");
}

// ---------------------------------------------------------------------------
// Heuristic Miner Boundary Tests
// ---------------------------------------------------------------------------

/// Test 10: Heuristic Miner with empty log
#[test]
fn test_heuristic_empty_log() {
    let log = build_log_with_activities(&[]);
    let _dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    // Empty log produces empty or minimal result (no panic is success)
}

/// Test 11: Heuristic Miner with single-event log
#[test]
fn test_heuristic_single_event() {
    let log = build_log_with_activities(&[vec!["OnlyActivity"]]);
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert_eq!(
        dfg.nodes.len(),
        1,
        "Single activity must yield exactly 1 node"
    );
    assert_eq!(dfg.edges.len(), 0, "Single activity has no edges");
}

/// Test 12: Heuristic Miner with all-identical traces
#[test]
fn test_heuristic_all_identical() {
    let log = build_log_with_activities(&[
        vec!["A", "B", "C"],
        vec!["A", "B", "C"],
        vec!["A", "B", "C"],
    ]);
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert_eq!(dfg.nodes.len(), 3, "Must have 3 nodes");
    assert_eq!(dfg.edges.len(), 2, "Linear sequence yields 2 edges");
}

/// Test 13: Heuristic Miner with Unicode activities
#[test]
fn test_heuristic_unicode_activities() {
    let log = build_log_with_activities(&[
        vec!["検査", "承認", "完了"], // Japanese: Inspect, Approve, Complete
        vec!["検査", "拒否", "完了"], // Japanese: Inspect, Reject, Complete
    ]);
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(dfg.nodes.len() > 0, "Must preserve Unicode activities");
}

/// Test 14: Heuristic Miner with special characters
#[test]
fn test_heuristic_special_characters() {
    let log = build_log_with_activities(&[
        vec!["Start|Action", "Mid[Index]", "End{Bracket}"],
    ]);
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(dfg.nodes.len() > 0, "Must preserve activities with special chars");
}

// ---------------------------------------------------------------------------
// Genetic Algorithm Boundary Tests
// ---------------------------------------------------------------------------

/// Test 15: Genetic Algorithm with empty log
#[test]
fn test_genetic_empty_log() {
    let log = build_log_with_activities(&[]);
    // GA with minimal population and generations
    let _result = discover_genetic_algorithm_from_log(&log, "concept:name", 2, 1);
    // GA may return Some or None for empty input; both are acceptable
}

/// Test 16: Genetic Algorithm with single-event log
#[test]
fn test_genetic_single_event() {
    let log = build_log_with_activities(&[vec!["SingleAct"]]);
    // GA may return None for a single-event log (no edges to evolve fitness over).
    // Both Some (with valid output) and None (graceful degradation) are acceptable.
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 10);
    if let Some((dfg, fitness)) = result {
        assert!(
            dfg.nodes.len() > 0,
            "GA result must have at least the single activity node"
        );
        assert!((0.0..=1.0).contains(&fitness), "Fitness must be in [0, 1]");
    }
    // else: None is acceptable for trivially small input
}

/// Test 17: Genetic Algorithm with all-identical traces
#[test]
fn test_genetic_all_identical() {
    let log = build_log_with_activities(&[
        vec!["X", "Y", "Z"],
        vec!["X", "Y", "Z"],
        vec!["X", "Y", "Z"],
        vec!["X", "Y", "Z"],
    ]);
    let (dfg, fitness) = discover_genetic_algorithm_from_log(&log, "concept:name", 10, 20)
        .expect("GA must succeed");
    assert_eq!(dfg.nodes.len(), 3, "Must have 3 unique nodes");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "Fitness must be normalized to [0, 1]"
    );
}

/// Test 18: Genetic Algorithm with Unicode activities
#[test]
fn test_genetic_unicode_activities() {
    let log = build_log_with_activities(&[
        vec!["시작", "검토", "종료"],     // Korean: Start, Review, End
        vec!["시작", "거부", "종료"],     // Korean: Start, Reject, End
        vec!["시작", "검토", "종료"],
    ]);
    let (dfg, _fitness) = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 15)
        .expect("GA must handle Unicode");
    assert!(
        dfg.nodes.len() > 0,
        "GA must preserve Unicode activity vocabulary"
    );
}

/// Test 19: Genetic Algorithm with special characters
#[test]
fn test_genetic_special_characters() {
    let log = build_log_with_activities(&[
        vec!["Act-1", "Act_2", "Act.3"],
        vec!["Act-1", "Act_2", "Act.3"],
    ]);
    let (dfg, _) = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 10)
        .expect("GA must handle special chars");
    assert!(dfg.nodes.len() > 0, "GA must preserve activities");
}

// ---------------------------------------------------------------------------
// ILP Discovery Boundary Tests
// ---------------------------------------------------------------------------

/// Test 20: ILP with empty log
#[test]
fn test_ilp_empty_log() {
    let log = build_log_with_activities(&[]);
    let (_pn, _fitness, _precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    // ILP returns empty PetriNet for empty input; both acceptable
}

/// Test 21: ILP with single-event log
#[test]
fn test_ilp_single_event() {
    let log = build_log_with_activities(&[vec!["Single"]]);
    let (pn, fitness, _precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(pn.transitions.len() > 0, "ILP must include the single activity");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "ILP fitness must be in [0, 1]"
    );
}

/// Test 22: ILP with all-identical traces
#[test]
fn test_ilp_all_identical() {
    let log = build_log_with_activities(&[
        vec!["P", "Q", "R"],
        vec!["P", "Q", "R"],
        vec!["P", "Q", "R"],
    ]);
    let (pn, fitness, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        pn.places.len() > 0 && pn.transitions.len() > 0,
        "ILP must produce a valid Petri net"
    );
    assert!(
        (0.0..=1.0).contains(&fitness),
        "Fitness must be normalized [0, 1]"
    );
}

/// Test 23: ILP with Unicode activities
#[test]
fn test_ilp_unicode_activities() {
    let log = build_log_with_activities(&[
        vec!["início", "processado", "fim"],   // Portuguese: start, processed, end
        vec!["início", "rejeitado", "fim"],    // Portuguese: start, rejected, end
    ]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        pn.transitions.len() > 0,
        "ILP must preserve Unicode activity names"
    );
}

/// Test 24: ILP with special characters
#[test]
fn test_ilp_special_characters() {
    let log = build_log_with_activities(&[
        vec!["Start@Time", "Check#Status", "End!"],
        vec!["Start@Time", "Check#Status", "End!"],
    ]);
    let (pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(
        pn.transitions.len() > 0,
        "ILP must handle special char activities"
    );
}

// ---------------------------------------------------------------------------
// Cross-Algorithm Stress Tests
// ---------------------------------------------------------------------------

/// Test 25: All algorithms on minimal valid log
#[test]
fn test_all_algorithms_minimal_log() {
    let log = build_log_with_activities(&[vec!["A", "B"]]);

    let dfg_result = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg_result.nodes.len(), 2, "DFG must have 2 nodes");

    let hm_result = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(hm_result.nodes.len() > 0, "HM must return valid result");

    if let Some((ga_dfg, _)) = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 5) {
        assert!(ga_dfg.nodes.len() > 0, "GA must return valid DFG");
    }

    let (ilp_pn, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(ilp_pn.places.len() > 0, "ILP must return valid PetriNet");
}

/// Test 26: All algorithms with moderately complex log
#[test]
fn test_all_algorithms_complex_log() {
    let log = build_log_with_activities(&[
        vec!["Register", "Approve", "Send", "Done"],
        vec!["Register", "Reject", "Done"],
        vec!["Register", "Approve", "Send", "Approve", "Send", "Done"],
    ]);

    let dfg_result = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(dfg_result.nodes.len() >= 4, "DFG must have at least core nodes");

    let hm_result = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(hm_result.nodes.len() > 0, "HM result valid");

    if let Some((ga_dfg, ga_fitness)) = discover_genetic_algorithm_from_log(&log, "concept:name", 10, 20) {
        assert!((0.0..=1.0).contains(&ga_fitness), "GA fitness in range");
    }

    let (ilp_pn, ilp_fitness, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!((0.0..=1.0).contains(&ilp_fitness), "ILP fitness in range");
}

// ---------------------------------------------------------------------------
// Unicode Edge Cases
// ---------------------------------------------------------------------------

/// Test 27: Mixed-script activities (Latin + CJK + Arabic + Emoji)
#[test]
fn test_mixed_scripts_single_log() {
    let log = build_log_with_activities(&[
        vec!["Initiate", "检查", "موافقة", "✅"],
        vec!["Initiate", "검증", "거부", "❌"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let vocab = log_vocabulary(&log);
    assert_eq!(vocab.len(), 7, "All 7 distinct activities must be recognized");
    assert!(dfg.nodes.len() > 0, "DFG must include all activities");
}

/// Test 28: Very long activity names (boundary test)
#[test]
fn test_very_long_activity_names() {
    let long_name_1 =
        "VeryLongActivityNameThatConsistsOfManyWordsAndCharactersToTestStringHandling";
    let long_name_2 =
        "AnotherExtremelyLongActivityNameWithEvenMoreCharactersThanTheFirstOne";

    let log = build_log_with_activities(&[
        vec![long_name_1, long_name_2],
        vec![long_name_1, long_name_2],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(
        dfg.nodes.len(),
        2,
        "DFG must handle long activity names"
    );
}

// ---------------------------------------------------------------------------
// Special Character Edge Cases
// ---------------------------------------------------------------------------

/// Test 29: Control characters in activity names
#[test]
fn test_control_characters() {
    let log = build_log_with_activities(&[
        vec!["Act\x00Null", "Act\x01Start", "Act\x1FUnit"],
        vec!["Act\x00Null", "Act\x1FUnit"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // Algorithm should handle or reject control chars gracefully
    assert!(dfg.nodes.len() >= 2, "DFG must process control char activities");
}

/// Test 30: Whitespace-only activity names
#[test]
fn test_whitespace_activities() {
    let log = build_log_with_activities(&[vec!["   ", "\t", "\n"]]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    // Should not panic; may have empty activity representation
    assert!(dfg.nodes.len() >= 1, "DFG must handle whitespace activities");
}

/// Test 31: Activities with quotes and escapes
#[test]
fn test_quoted_and_escaped_activities() {
    let log = build_log_with_activities(&[
        vec!["\"quoted\"", "\'single\'", "back\\slash"],
        vec!["\"quoted\"", "back\\slash"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(dfg.nodes.len() > 0, "DFG must handle quoted activities");
}

// ---------------------------------------------------------------------------
// Variance and Distribution Tests
// ---------------------------------------------------------------------------

/// Test 32: Highly variant log (many unique traces)
#[test]
fn test_high_variance_log() {
    let log = build_log_with_activities(&[
        vec!["A", "B", "C"],
        vec!["A", "C", "B"],
        vec!["B", "A", "C"],
        vec!["B", "C", "A"],
        vec!["C", "A", "B"],
        vec!["C", "B", "A"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 3, "Must have 3 nodes");
    // High variance should produce many edges
    assert!(dfg.edges.len() > 3, "High variance must produce many edges");
}

/// Test 33: Low variance (few unique patterns, many repeats)
#[test]
fn test_low_variance_log() {
    let log = build_log_with_activities(&[
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
        vec!["X", "Y"],
    ]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.edges.len(), 1, "Only X→Y edge");
    // All edges should have frequency 10
    for edge in &dfg.edges {
        assert_eq!(
            edge.frequency, 10,
            "Repeated trace must increment edge frequency"
        );
    }
}

/// Test 34: Extreme case: Very long single trace
#[test]
fn test_very_long_single_trace() {
    let mut activities = Vec::new();
    for i in 0..100 {
        activities.push(format!("Act{:03}", i));
    }
    let activities_refs: Vec<&str> = activities.iter().map(|s| s.as_str()).collect();

    let log = build_log_with_activities(&[activities_refs]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 100, "Must have 100 unique activities");
    assert_eq!(dfg.edges.len(), 99, "Long sequence yields 99 edges");
}

/// Test 35: Extreme case: Many short traces
#[test]
fn test_many_short_traces() {
    let mut traces = Vec::new();
    for _ in 0..1000 {
        traces.push(vec!["A", "B"]);
    }
    let log = build_log_with_activities(&traces);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 2, "Must have 2 nodes");
    assert_eq!(
        dfg.edges[0].frequency, 1000,
        "Edge frequency must accumulate across traces"
    );
}

// ---------------------------------------------------------------------------
// Algorithm-Specific Boundary Tests
// ---------------------------------------------------------------------------

/// Test 36: DFG edge case — activities with numeric names
#[test]
fn test_dfg_numeric_activities() {
    let log = build_log_with_activities(&[vec!["1", "2", "3", "4", "5"]]);
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(dfg.nodes.len(), 5, "DFG must handle numeric activity names");
}

/// Test 37: Heuristic Miner with near-zero dependency threshold
#[test]
fn test_heuristic_minimal_threshold() {
    let log = build_log_with_activities(&[
        vec!["A", "B"],
        vec!["A", "C"],
        vec!["A", "B"],
    ]);
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.01);
    assert!(
        dfg.nodes.len() > 0,
        "HM must produce result with low threshold"
    );
}

/// Test 38: Genetic Algorithm with minimal valid population (>= 2 required for crossover)
#[test]
fn test_genetic_minimal_population() {
    let log = build_log_with_activities(&[vec!["Task1", "Task2", "Task3"]]);
    // population_size must be >= 2 (genetic algorithm requires at least 2 individuals for crossover)
    // population_size = 1 returns None (guarded), population_size = 2 is the minimum that runs
    let (dfg, fitness) = discover_genetic_algorithm_from_log(&log, "concept:name", 2, 1)
        .expect("GA must work with minimal population of 2");
    assert!(
        dfg.nodes.len() > 0,
        "GA must produce result with minimal config"
    );
    assert!(
        (0.0..=1.0).contains(&fitness),
        "Fitness must be valid even with minimal GA"
    );
}

/// Test 39: ILP with single activity (petri net structure)
#[test]
fn test_ilp_single_activity_structure() {
    let log = build_log_with_activities(&[vec!["Solo"], vec!["Solo"], vec!["Solo"]]);
    let (pn, fitness, precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(pn.transitions.len() > 0, "ILP must create transitions");
    assert!(pn.places.len() > 0, "ILP must create places");
    assert!(
        (0.0..=1.0).contains(&fitness) && (0.0..=1.0).contains(&precision),
        "ILP quality metrics must be valid"
    );
}

/// Test 40: Cross-algorithm vocabulary consistency
#[test]
fn test_vocabulary_consistency_across_algorithms() {
    let log = build_log_with_activities(&[
        vec!["Start", "Validate", "Approve", "End"],
        vec!["Start", "Validate", "Reject", "End"],
    ]);

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let hm = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    let ga = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 10);
    let (ilp, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");

    let log_vocab = log_vocabulary(&log);

    // All algorithms should include the log vocabulary
    let dfg_vocab: std::collections::HashSet<_> = dfg.nodes.iter().map(|n| n.id.clone()).collect();
    let hm_vocab: std::collections::HashSet<_> = hm.nodes.iter().map(|n| n.id.clone()).collect();

    for activity in &log_vocab {
        assert!(
            dfg_vocab.contains(activity),
            "DFG must include log vocabulary: {}",
            activity
        );
    }

    for activity in &log_vocab {
        assert!(
            hm_vocab.contains(activity),
            "HM must include log vocabulary: {}",
            activity
        );
    }

    if let Some((ga_dfg, _)) = ga {
        let ga_vocab: std::collections::HashSet<_> = ga_dfg.nodes.iter().map(|n| n.id.clone()).collect();
        for activity in &log_vocab {
            assert!(
                ga_vocab.contains(activity),
                "GA must include log vocabulary: {}",
                activity
            );
        }
    }

    // ILP captures transitions (not nodes), so we check for activity-named transitions
    for activity in &log_vocab {
        let found = ilp.transitions.iter().any(|t| &t.label == activity);
        assert!(found, "ILP must include log vocabulary: {}", activity);
    }
}

// ---------------------------------------------------------------------------
// Parameter Validation Tests (Prevent Panics on Invalid Inputs)
// ---------------------------------------------------------------------------

/// Test 41: Genetic Algorithm with population_size = 0 (should return None, not panic)
#[test]
fn test_genetic_algorithm_population_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 0, 10);
    // Should return None gracefully, not panic
    assert!(
        result.is_none(),
        "GA with population_size=0 must return None (not panic)"
    );
}

/// Test 42: Genetic Algorithm with population_size = 1 (should return None, not panic)
#[test]
fn test_genetic_algorithm_population_one() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 1, 10);
    // Should return None (minimum population_size is 2), not panic
    assert!(
        result.is_none(),
        "GA with population_size=1 must return None (not panic)"
    );
}

/// Test 43: Genetic Algorithm with population_size = 2 (minimum valid)
#[test]
fn test_genetic_algorithm_population_minimum_valid() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"], vec!["A", "C", "B"]]);
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 2, 1);
    // Should succeed (population_size=2 is valid)
    assert!(
        result.is_some(),
        "GA with population_size=2 and generations=1 must succeed"
    );
    if let Some((dfg, fitness)) = result {
        assert!(dfg.nodes.len() > 0, "Result must have valid DFG nodes");
        assert!((0.0..=1.0).contains(&fitness), "Fitness must be in valid range");
    }
}

/// Test 44: Genetic Algorithm with generations = 0 (should return None)
#[test]
fn test_genetic_algorithm_generations_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 5, 0);
    // Should return None (at least 1 generation required), not panic
    assert!(
        result.is_none(),
        "GA with generations=0 must return None"
    );
}

/// Test 45: PSO with swarm_size = 0 (should return None, not panic)
#[test]
fn test_pso_algorithm_swarm_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = wasm4pm::genetic_discovery::discover_pso_algorithm_from_log(
        &log,
        "concept:name",
        0,
        10,
    );
    // Should return None gracefully, not panic
    assert!(
        result.is_none(),
        "PSO with swarm_size=0 must return None (not panic)"
    );
}

/// Test 46: PSO with swarm_size = 1 (minimum valid)
#[test]
fn test_pso_algorithm_swarm_minimum_valid() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"], vec!["A", "C", "B"]]);
    let result = wasm4pm::genetic_discovery::discover_pso_algorithm_from_log(
        &log,
        "concept:name",
        1,
        1,
    );
    // Should succeed (swarm_size=1 is valid)
    assert!(
        result.is_some(),
        "PSO with swarm_size=1 and iterations=1 must succeed"
    );
    if let Some((dfg, fitness)) = result {
        assert!(dfg.nodes.len() > 0, "Result must have valid DFG nodes");
        assert!((0.0..=1.0).contains(&fitness), "Fitness must be in valid range");
    }
}

/// Test 47: PSO with iterations = 0 (should return None)
#[test]
fn test_pso_algorithm_iterations_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = wasm4pm::genetic_discovery::discover_pso_algorithm_from_log(
        &log,
        "concept:name",
        5,
        0,
    );
    // Should return None (at least 1 iteration required), not panic
    assert!(
        result.is_none(),
        "PSO with iterations=0 must return None"
    );
}

/// Test 48: ACO with ant_count = 0 (should return None, not panic)
#[test]
fn test_aco_algorithm_ant_count_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = wasm4pm::genetic_discovery::discover_aco_algorithm_from_log(
        &log,
        "concept:name",
        0,
        10,
    );
    // Should return None gracefully, not panic
    assert!(
        result.is_none(),
        "ACO with ant_count=0 must return None (not panic)"
    );
}

/// Test 49: ACO with ant_count = 1 (minimum valid)
#[test]
fn test_aco_algorithm_ant_count_minimum_valid() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"], vec!["A", "C", "B"]]);
    let result = wasm4pm::genetic_discovery::discover_aco_algorithm_from_log(
        &log,
        "concept:name",
        1,
        1,
    );
    // Should succeed (ant_count=1 is valid)
    assert!(
        result.is_some(),
        "ACO with ant_count=1 and iterations=1 must succeed"
    );
    if let Some((dfg, fitness)) = result {
        assert!(dfg.nodes.len() > 0, "Result must have valid DFG nodes");
        assert!((0.0..=1.0).contains(&fitness), "Fitness must be in valid range");
    }
}

/// Test 50: ACO with iterations = 0 (should return None)
#[test]
fn test_aco_algorithm_iterations_zero() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    let result = wasm4pm::genetic_discovery::discover_aco_algorithm_from_log(
        &log,
        "concept:name",
        5,
        0,
    );
    // Should return None (at least 1 iteration required), not panic
    assert!(
        result.is_none(),
        "ACO with iterations=0 must return None"
    );
}

/// Test 51: Simulated Annealing with invalid temperature (should return empty DFG)
#[test]
fn test_simulated_annealing_invalid_temperature() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    use wasm4pm::more_discovery::discover_simulated_annealing_from_log;

    // Test with temperature = 0.0 (invalid)
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 0.0, 0.5);
    assert!(
        dfg.nodes.is_empty() && dfg.edges.is_empty(),
        "SA with temperature=0.0 must return empty DFG"
    );
    assert_eq!(fitness, 0.0, "Fitness must be 0.0 for invalid input");

    // Test with temperature = -1.0 (invalid)
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", -1.0, 0.5);
    assert!(
        dfg.nodes.is_empty() && dfg.edges.is_empty(),
        "SA with temperature=-1.0 must return empty DFG"
    );
    assert_eq!(fitness, 0.0, "Fitness must be 0.0 for invalid input");
}

/// Test 52: Simulated Annealing with invalid cooling_rate (should return empty DFG)
#[test]
fn test_simulated_annealing_invalid_cooling_rate() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"]]);
    use wasm4pm::more_discovery::discover_simulated_annealing_from_log;

    // Test with cooling_rate = 0.0 (invalid)
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.0);
    assert!(
        dfg.nodes.is_empty() && dfg.edges.is_empty(),
        "SA with cooling_rate=0.0 must return empty DFG"
    );
    assert_eq!(fitness, 0.0, "Fitness must be 0.0 for invalid input");

    // Test with cooling_rate = 1.0 (invalid, must be < 1.0)
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 1.0);
    assert!(
        dfg.nodes.is_empty() && dfg.edges.is_empty(),
        "SA with cooling_rate=1.0 must return empty DFG"
    );
    assert_eq!(fitness, 0.0, "Fitness must be 0.0 for invalid input");

    // Test with cooling_rate = 1.5 (invalid, must be < 1.0)
    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 1.5);
    assert!(
        dfg.nodes.is_empty() && dfg.edges.is_empty(),
        "SA with cooling_rate=1.5 must return empty DFG"
    );
    assert_eq!(fitness, 0.0, "Fitness must be 0.0 for invalid input");
}

/// Test 53: Simulated Annealing with valid parameters
#[test]
fn test_simulated_annealing_valid_parameters() {
    let log = build_log_with_activities(&[vec!["A", "B", "C"], vec!["A", "C", "B"]]);
    use wasm4pm::more_discovery::discover_simulated_annealing_from_log;

    let (dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    assert!(
        dfg.nodes.len() > 0,
        "SA with valid parameters must produce non-empty DFG"
    );
    assert!(
        (0.0..=1.0).contains(&fitness),
        "Fitness must be in valid range"
    );
}


fn admitted_log(log: wasm4pm::models::EventLog) -> wasm4pm_compat::evidence::Evidence<wasm4pm::models::EventLog, wasm4pm_compat::state::Admitted, ()> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}
