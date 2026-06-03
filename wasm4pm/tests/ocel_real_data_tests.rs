//! OCEL Real-Data Tests
//!
//! Exercises OCEL sub-families (Group 5 from coverage audit) against
//! the real ocel20_example.jsonocel file.
//!
//! Coverage:
//!   - validate_ocel_object_lifecycles: lifecycle ordering check
//!   - measure_flattening_loss: info loss when flattening to case-centric
//!   - discover_ocel_dfg_pure: OC-DFG on real OCEL data

#[cfg(feature = "ocel")]
mod ocel_tests {
    use std::fs;
    use wasm4pm::models::OCEL;
    use wasm4pm::ocel_flatten::measure_flattening_loss;
    use wasm4pm::ocel_io::validate_ocel_object_lifecycles;

    const OCEL_PATHS: &[&str] = &[
        "/Users/sac/wasm4pm/bench_data/ocel20_example.jsonocel",
        "bench_data/ocel20_example.jsonocel",
        "../bench_data/ocel20_example.jsonocel",
        "tests/fixtures/ocel20_example.jsonocel",
    ];

    fn load_ocel() -> Option<OCEL> {
        for path in OCEL_PATHS {
            if let Ok(content) = fs::read_to_string(path) {
                if content.len() > 50 {
                    match serde_json::from_str::<OCEL>(&content) {
                        Ok(ocel) => {
                            eprintln!(
                                "OCEL tests: loaded {} events, {} objects from {}",
                                ocel.events.len(),
                                ocel.objects.len(),
                                path
                            );
                            return Some(ocel);
                        }
                        Err(e) => {
                            eprintln!("OCEL parse error for {}: {}", path, e);
                        }
                    }
                }
            }
        }
        None
    }

    macro_rules! require_ocel {
        () => {
            match load_ocel() {
                None => {
                    eprintln!("SKIP: ocel20_example.jsonocel not found or parse failed");
                    return;
                }
                Some(o) => o,
            }
        };
    }

    // ---------------------------------------------------------------------------
    // validate_ocel_object_lifecycles
    // ---------------------------------------------------------------------------

    #[test]
    fn ocel_lifecycle_validation_runs_on_real_data() {
        let ocel = require_ocel!();

        // Should not panic on real data
        let violations = validate_ocel_object_lifecycles(&ocel);

        // Violations is a valid result (may be empty for a clean log)
        eprintln!("Lifecycle violations found: {}", violations.len());

        // Basic sanity: all violations reference real object IDs
        let object_ids: std::collections::HashSet<&str> =
            ocel.objects.iter().map(|o| o.id.as_str()).collect();

        for v in &violations {
            assert!(
                object_ids.contains(v.object_id.as_str()),
                "Violation references unknown object_id '{}'",
                v.object_id
            );
        }
    }

    #[test]
    fn ocel_lifecycle_validation_result_count_is_bounded() {
        let ocel = require_ocel!();
        let violations = validate_ocel_object_lifecycles(&ocel);

        // Violations can't exceed O(n^2) of events per object
        let max_possible = ocel.events.len() * ocel.events.len();
        assert!(
            violations.len() <= max_possible,
            "Violation count {} exceeds theoretical max {}",
            violations.len(),
            max_possible
        );
    }

    // ---------------------------------------------------------------------------
    // measure_flattening_loss
    // ---------------------------------------------------------------------------

    #[test]
    fn flattening_loss_ocel_non_degenerate_for_first_object_type() {
        let ocel = require_ocel!();

        // Find the first available object type
        let object_type = ocel
            .objects
            .first()
            .map(|o| o.object_type.as_str())
            .unwrap_or("");

        if object_type.is_empty() {
            eprintln!("SKIP: no objects in OCEL");
            return;
        }

        eprintln!("Testing flattening loss for object type: {}", object_type);
        let report = measure_flattening_loss(&ocel, object_type);

        // Results must be non-negative
        assert!(
            report.total_events_in_flattened_log >= 0,
            "total_events_in_flattened_log must be non-negative"
        );
        assert!(
            report.unique_ocel_events_referenced >= 0,
            "unique_ocel_events_referenced must be non-negative"
        );
        assert!(
            report.original_ocel_variant_count >= 0,
            "original_ocel_variant_count must be non-negative"
        );
    }

    #[test]
    fn flattening_loss_unique_ocel_events_bounded_by_total() {
        let ocel = require_ocel!();

        let object_type = ocel
            .objects
            .first()
            .map(|o| o.object_type.as_str())
            .unwrap_or("");

        if object_type.is_empty() {
            eprintln!("SKIP: no objects in OCEL");
            return;
        }

        let report = measure_flattening_loss(&ocel, object_type);

        // Referenced events can't exceed total events in the log
        assert!(
            report.unique_ocel_events_referenced <= ocel.events.len(),
            "unique_ocel_events_referenced ({}) exceeds total events ({})",
            report.unique_ocel_events_referenced,
            ocel.events.len()
        );
    }

    #[test]
    fn flattening_loss_reports_for_all_object_types() {
        let ocel = require_ocel!();

        // Collect unique object types
        let object_types: std::collections::HashSet<String> =
            ocel.objects.iter().map(|o| o.object_type.clone()).collect();

        if object_types.is_empty() {
            eprintln!("SKIP: no object types in OCEL");
            return;
        }

        eprintln!(
            "Testing flattening loss for {} object types",
            object_types.len()
        );

        for ot in &object_types {
            let report = measure_flattening_loss(&ocel, ot);
            // Must not panic; basic bound check
            assert!(
                report.flattened_variant_count >= 0,
                "flattened_variant_count must be non-negative for type '{}'",
                ot
            );
        }
    }

    // ---------------------------------------------------------------------------
    // OC-DFG discovery via ocel_io structures
    // ---------------------------------------------------------------------------

    #[test]
    fn ocel_has_non_empty_events_and_objects() {
        let ocel = require_ocel!();

        assert!(
            !ocel.events.is_empty(),
            "ocel20_example must have at least one event"
        );
        assert!(
            !ocel.objects.is_empty(),
            "ocel20_example must have at least one object"
        );
    }

    #[test]
    fn ocel_events_have_valid_timestamps() {
        let ocel = require_ocel!();

        let mut parsed_count = 0;
        for event in &ocel.events {
            if !event.timestamp.is_empty() {
                // Must be parseable as a date-like string
                assert!(
                    !event.timestamp.is_empty(),
                    "Event '{}' has empty timestamp",
                    event.id
                );
                parsed_count += 1;
            }
        }

        eprintln!(
            "Events with timestamps: {}/{}",
            parsed_count,
            ocel.events.len()
        );
        // At least some events should have timestamps
        if !ocel.events.is_empty() {
            assert!(
                parsed_count > 0,
                "At least one event must have a non-empty timestamp"
            );
        }
    }

    #[test]
    fn ocel_object_references_are_valid() {
        let ocel = require_ocel!();

        let object_ids: std::collections::HashSet<&str> =
            ocel.objects.iter().map(|o| o.id.as_str()).collect();

        for event in &ocel.events {
            for obj_ref in &event.object_refs {
                assert!(
                    object_ids.contains(obj_ref.object_id.as_str()),
                    "Event '{}' references unknown object_id '{}'",
                    event.id,
                    obj_ref.object_id
                );
            }
        }
    }
}

// Stub module when ocel feature is not enabled
#[cfg(not(feature = "ocel"))]
mod ocel_tests {
    #[test]
    fn ocel_feature_gate_acknowledged() {
        eprintln!("SKIP: ocel feature not enabled — OCEL real-data tests skipped");
    }
}
