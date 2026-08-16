//! Bridge that wires the real Heuristic Miner implementation
//! (`wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log`, which
//! implements the Weijters et al. dependency measure
//! `dep(a,b) = (|a>b| - |b>a|) / (|a>b| + |b>a| + 1)`) into the CLI's
//! event-log type.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`discover_heuristic_real`]. Mirrors the pattern already
//! established by `inductive_bridge.rs` and `conformance_bridge.rs` in this
//! same directory.

use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Default dependency threshold for the Heuristic Miner, matching the
/// threshold used by `wasm4pm::advanced_algorithms::discover_heuristic_miner`
/// (the wasm-bindgen-facing wrapper around the same pure function).
pub const DEFAULT_DEPENDENCY_THRESHOLD: f64 = 0.5;

/// Discover a DFG from a loaded `wasm4pm_compat::event_log::EventLog` using
/// the real Heuristic Miner
/// (`wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log`).
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
pub fn discover_heuristic_real(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<wasm4pm::models::DFG> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    let dfg = wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log(
        &native_log,
        activity_key,
        DEFAULT_DEPENDENCY_THRESHOLD,
    );

    Ok(dfg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Two traces sharing the "a" -> "b" -> "c" pattern (repeated a->b
        // dependency across both cases) plus a third, reversed trace
        // ("c" -> "b" -> "a") so the dependency measure has both directions
        // to weigh, not a degenerate single-direction case.
        let trace1 = Trace::new(
            "case-1".to_string(),
            vec![
                Event::with_activity("a"),
                Event::with_activity("b"),
                Event::with_activity("c"),
            ],
        );
        let trace2 = Trace::new(
            "case-2".to_string(),
            vec![
                Event::with_activity("a"),
                Event::with_activity("b"),
                Event::with_activity("c"),
            ],
        );
        let trace3 = Trace::new(
            "case-3".to_string(),
            vec![
                Event::with_activity("a"),
                Event::with_activity("b"),
                Event::with_activity("d"),
            ],
        );
        CompatEventLog {
            attributes: Vec::new(),
            traces: vec![trace1, trace2, trace3],
            extensions: None,
            classifiers: None,
            global_trace_attrs: None,
            global_event_attrs: None,
        }
    }

    #[test]
    fn discover_heuristic_real_runs_on_small_log_and_finds_strong_dependency() {
        let log = build_small_log();
        let dfg = discover_heuristic_real(&log, "concept:name")
            .expect("heuristic miner should discover a DFG without panicking");

        assert!(!dfg.nodes.is_empty(), "expected a non-empty DFG, got {dfg:?}");

        // a->b appears 3 times, never reversed: dep(a,b) = (3-0)/(3+0+1) = 0.75
        // which clears the default 0.5 threshold, so the edge must survive.
        let has_a_to_b = dfg
            .edges
            .iter()
            .any(|e| e.from == "a" && e.to == "b" && e.frequency == 3);
        assert!(
            has_a_to_b,
            "expected a repeated a->b dependency edge with frequency 3, got edges: {:?}",
            dfg.edges
        );

        // b->c appears twice (case-1, case-2), never reversed: dep(b,c) =
        // (2-0)/(2+0+1) ~= 0.667, also clears the threshold.
        let has_b_to_c = dfg
            .edges
            .iter()
            .any(|e| e.from == "b" && e.to == "c" && e.frequency == 2);
        assert!(
            has_b_to_c,
            "expected a repeated b->c dependency edge with frequency 2, got edges: {:?}",
            dfg.edges
        );
    }
}
