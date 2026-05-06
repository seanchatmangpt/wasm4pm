//! OCEL 2.0 Many-to-Many Event-Object Relationship Tests
//!
//! Tests verify that OCEL correctly handles one event referencing multiple
//! objects (many-to-many), that flattening intentionally duplicates shared
//! events, that the FlatteningLossReport accurately reflects this, and that
//! lifecycle temporal ordering is validated.
//!
//! All tests are guarded by `#[cfg(feature = "feature-ocel")]`. If the feature
//! is not enabled, the tests are compiled out and do not run.
//!
//! Oracle ranks:
//! - Rank 1 (Mathematical): lifecycle ordering (start ≤ complete)
//! - Rank 2 (Domain contract): M2M duplication, 1-to-1 zero loss, OCEL DFG structure

#[cfg(feature = "feature-ocel")]
mod ocel_m2m_tests {
    use std::collections::HashMap;
    use wasm4pm::models::{OCELEvent, OCELObject, OCEL};
    use wasm4pm::ocel_flatten::measure_flattening_loss;
    use wasm4pm::ocel_io::validate_ocel_object_lifecycles;
    use wasm4pm::discovery::discover_ocel_dfg_pure;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /// Build an OCEL where event E1 involves objects [order1, item1, item2].
    /// This is the canonical M2M test fixture: one event → many objects.
    ///
    /// NOTE: Use only `object_ids` (not both fields) to avoid double-counting
    /// in `all_object_ids()` which chains object_ids + object_refs.
    fn build_m2m_ocel() -> OCEL {
        // OCEL 2.0 many-to-many: one event can belong to multiple objects
        OCEL {
            event_types: vec!["Register".to_string()],
            object_types: vec!["order".to_string(), "item".to_string()],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "Register".to_string(),
                timestamp: "2024-01-01T10:00:00Z".to_string(),
                attributes: HashMap::new(),
                // Use object_ids only — object_refs left empty to avoid double-counting
                object_ids: vec![
                    "order1".to_string(),
                    "item1".to_string(),
                    "item2".to_string(),
                ],
                object_refs: vec![],
            }],
            objects: vec![
                OCELObject {
                    id: "order1".to_string(),
                    object_type: "order".to_string(),
                    attributes: HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "item1".to_string(),
                    object_type: "item".to_string(),
                    attributes: HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "item2".to_string(),
                    object_type: "item".to_string(),
                    attributes: HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
            ],
            object_relations: vec![],
        }
    }

    /// Build a simple 1-to-1 OCEL: each event references exactly one object.
    ///
    /// NOTE: `all_object_ids()` chains both `object_ids` and `object_refs`,
    /// so we must NOT populate both fields with the same object ID or the
    /// duplication counter will fire. Use `object_ids` only.
    fn build_one_to_one_ocel() -> OCEL {
        OCEL {
            event_types: vec!["Pay".to_string(), "Ship".to_string()],
            object_types: vec!["order".to_string()],
            events: vec![
                OCELEvent {
                    id: "ev_pay".to_string(),
                    event_type: "Pay".to_string(),
                    timestamp: "2024-01-01T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only — do NOT duplicate in object_refs
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "ev_ship".to_string(),
                    event_type: "Ship".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only — do NOT duplicate in object_refs
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "order".to_string(),
                attributes: HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    // -------------------------------------------------------------------------
    // Test 1: Shared event appears in all related object traces
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_shared_event_appears_in_all_related_object_traces() {
        // OCEL 2.0 many-to-many: one event can belong to multiple objects
        let ocel = build_m2m_ocel();

        // When flattened by "order": e1 must appear in order1's trace
        let order_loss = measure_flattening_loss(&ocel, "order");
        assert!(
            order_loss.total_events_in_flattened_log >= 1,
            "Flattening by 'order' must include e1 (referenced by order1): got {} events",
            order_loss.total_events_in_flattened_log
        );

        // When flattened by "item": e1 must appear in BOTH item1 and item2 traces
        let item_loss = measure_flattening_loss(&ocel, "item");
        assert!(
            item_loss.total_events_in_flattened_log >= 2,
            "Flattening by 'item' must include e1 in both item1 and item2 traces \
             (total ≥ 2): got {}",
            item_loss.total_events_in_flattened_log
        );
    }

    // -------------------------------------------------------------------------
    // Test 2: Flattening duplicates shared events (expected M2M behaviour)
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_flattening_duplicates_shared_events() {
        // Rank 2 domain contract: M2M flattening intentionally duplicates events
        let ocel = build_m2m_ocel();

        let item_loss = measure_flattening_loss(&ocel, "item");

        // Original OCEL has 1 event (e1). Flattening by item produces 2 events
        // (one per item object). total_events_in_flattened_log > unique_ocel_events_referenced.
        assert!(
            item_loss.total_events_in_flattened_log > item_loss.unique_ocel_events_referenced,
            "M2M flattening must produce more total events ({}) than unique OCEL events ({}). \
             Duplication is by design.",
            item_loss.total_events_in_flattened_log,
            item_loss.unique_ocel_events_referenced
        );
    }

    // -------------------------------------------------------------------------
    // Test 3: FlatteningLossReport has non-zero duplication count for M2M log
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_flattening_loss_report_nonzero_for_m2m() {
        // Rank 2: M2M events must be reported in flattening loss
        let ocel = build_m2m_ocel();

        let report = measure_flattening_loss(&ocel, "item");

        // e1 is shared by item1 and item2 — it contributes to event_duplication_count
        assert!(
            report.event_duplication_count > 0,
            "FlatteningLossReport.event_duplication_count must be > 0 for M2M log (got 0). \
             Event e1 is referenced by 2 item objects."
        );
    }

    // -------------------------------------------------------------------------
    // Test 4: Zero duplication count for 1-to-1 OCEL
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_zero_loss_for_one_to_one_log() {
        // Rank 2: 1-to-1 OCEL has no flattening loss
        let ocel = build_one_to_one_ocel();

        let report = measure_flattening_loss(&ocel, "order");

        assert_eq!(
            report.event_duplication_count,
            0,
            "1-to-1 OCEL must have event_duplication_count == 0 (got {}). \
             Each event references exactly one object.",
            report.event_duplication_count
        );
    }

    // -------------------------------------------------------------------------
    // Test 5: Lifecycle — start must have earlier timestamp than complete
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_lifecycle_start_before_end() {
        // Rank 1 mathematical: start must precede end
        let ocel = OCEL {
            event_types: vec!["start".to_string(), "complete".to_string()],
            object_types: vec!["order".to_string()],
            events: vec![
                OCELEvent {
                    id: "ev_start".to_string(),
                    event_type: "start".to_string(),
                    // earlier timestamp
                    timestamp: "2024-01-01T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only to avoid double-counting in all_object_ids()
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "ev_complete".to_string(),
                    event_type: "complete".to_string(),
                    // later timestamp
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only to avoid double-counting in all_object_ids()
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "order".to_string(),
                attributes: HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        };

        let violations = validate_ocel_object_lifecycles(&ocel);

        assert_eq!(
            violations.len(),
            0,
            "Valid lifecycle (start before complete) must produce no violations, \
             got {} violation(s)",
            violations.len()
        );
    }

    // -------------------------------------------------------------------------
    // Test 6: Lifecycle violation detected when complete precedes start
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_lifecycle_violation_detected() {
        // NEGATIVE TEST: Temporal lifecycle violations must be detectable
        let ocel = OCEL {
            event_types: vec!["start".to_string(), "complete".to_string()],
            object_types: vec!["order".to_string()],
            events: vec![
                // "start" event arrives FIRST in the log but has a LATER timestamp
                // — simulating an invalid lifecycle recording
                OCELEvent {
                    id: "ev_start".to_string(),
                    event_type: "start".to_string(),
                    // Invalid: start appears first in arrival order but has LATER timestamp
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only to avoid double-counting in all_object_ids()
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "ev_complete".to_string(),
                    event_type: "complete".to_string(),
                    // "complete" arrives second but has EARLIER timestamp — violation
                    timestamp: "2024-01-01T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only to avoid double-counting in all_object_ids()
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "order".to_string(),
                attributes: HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        };

        let violations = validate_ocel_object_lifecycles(&ocel);

        assert!(
            !violations.is_empty(),
            "Lifecycle violation (complete with earlier timestamp than start) must be detected. \
             Got 0 violations."
        );
    }

    // -------------------------------------------------------------------------
    // Test 7: Valid lifecycle produces zero violations
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_valid_lifecycle_no_violations() {
        // Rank 2 domain contract: valid lifecycle must pass validation
        let ocel = OCEL {
            event_types: vec!["Create".to_string(), "Process".to_string(), "Close".to_string()],
            object_types: vec!["case".to_string()],
            events: vec![
                OCELEvent {
                    id: "e_create".to_string(),
                    event_type: "Create".to_string(),
                    timestamp: "2024-03-01T08:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    // Use object_ids only to avoid double-counting in all_object_ids()
                    object_ids: vec!["case1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e_process".to_string(),
                    event_type: "Process".to_string(),
                    timestamp: "2024-03-01T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["case1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e_close".to_string(),
                    event_type: "Close".to_string(),
                    timestamp: "2024-03-01T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["case1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "case1".to_string(),
                object_type: "case".to_string(),
                attributes: HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        };

        let violations = validate_ocel_object_lifecycles(&ocel);

        assert_eq!(
            violations.len(),
            0,
            "Valid lifecycle (Create→Process→Close with ascending timestamps) \
             must produce no violations, got {} violation(s)",
            violations.len()
        );
    }

    // -------------------------------------------------------------------------
    // Test 8: OCEL DFG represents convergence/divergence nodes
    // -------------------------------------------------------------------------

    #[test]
    fn ocel_dfg_includes_convergence_divergence_nodes() {
        // Rank 2: OCEL DFG must represent convergence/divergence
        //
        // Object participates in both divergence (A splits to B and C) and
        // convergence (B and C merge at D). This is captured via two object
        // traces: one going A→B→D, another going A→C→D.
        let ocel = OCEL {
            event_types: vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
            ],
            object_types: vec!["process".to_string()],
            events: vec![
                // Object p1: trace A → B → D
                // Use object_ids only to avoid double-counting in all_object_ids()
                OCELEvent {
                    id: "p1_a".to_string(),
                    event_type: "A".to_string(),
                    timestamp: "2024-01-01T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "p1_b".to_string(),
                    event_type: "B".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "p1_d".to_string(),
                    event_type: "D".to_string(),
                    timestamp: "2024-01-01T11:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p1".to_string()],
                    object_refs: vec![],
                },
                // Object p2: trace A → C → D
                OCELEvent {
                    id: "p2_a".to_string(),
                    event_type: "A".to_string(),
                    timestamp: "2024-01-02T09:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p2".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "p2_c".to_string(),
                    event_type: "C".to_string(),
                    timestamp: "2024-01-02T10:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p2".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "p2_d".to_string(),
                    event_type: "D".to_string(),
                    timestamp: "2024-01-02T11:00:00Z".to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec!["p2".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![
                OCELObject {
                    id: "p1".to_string(),
                    object_type: "process".to_string(),
                    attributes: HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "p2".to_string(),
                    object_type: "process".to_string(),
                    attributes: HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
            ],
            object_relations: vec![],
        };

        let dfg = discover_ocel_dfg_pure(&ocel);

        // Compute in-degree and out-degree per node from the edge set
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        let mut out_degree: HashMap<String, usize> = HashMap::new();

        for edge in &dfg.edges {
            *out_degree.entry(edge.from.clone()).or_insert(0) += 1;
            *in_degree.entry(edge.to.clone()).or_insert(0) += 1;
        }

        // A diverges: it has out-degree 2 (A→B and A→C)
        // D converges: it has in-degree 2 (B→D and C→D)
        let has_divergence = out_degree.values().any(|&d| d > 1);
        let has_convergence = in_degree.values().any(|&d| d > 1);

        assert!(
            has_divergence || has_convergence,
            "OCEL DFG must contain at least one node with in-degree > 1 (convergence) \
             or out-degree > 1 (divergence). DFG edges: {:?}",
            dfg.edges
                .iter()
                .map(|e| format!("{}→{}", e.from, e.to))
                .collect::<Vec<_>>()
        );
    }
}
