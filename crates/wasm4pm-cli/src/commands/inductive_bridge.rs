//! Bridge that wires the real recursive Inductive Miner implementation
//! (`wasm4pm::more_discovery::InductiveMiner`, backed by
//! `inductive_miner_recursive` — genuine XOR/Sequence/Parallel/Loop cut
//! detection with a flower-model fallback) into the CLI's event-log type.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`discover_inductive`].
//!
//! `inductive_miner_recursive` itself returns a recursive `ProcessTreeNode`
//! (crate-private to `wasm4pm::more_discovery`); the public
//! `wasm4pm::more_discovery::InductiveMiner::discover` wrapper already
//! converts that into a flat `wasm4pm_compat::process_tree::ProcessTree`
//! (via `convert_to_compat_tree`) wrapped in admitted `Evidence`. This
//! bridge unwraps that `Evidence` and hands back the plain
//! `wasm4pm_compat::process_tree::ProcessTree` — a **process tree**, not a
//! DFG. (A DFG cannot represent Inductive Miner's soundness-guaranteeing
//! XOR/Sequence/Parallel/Loop operators without lossy flattening, so we
//! return the tree type Inductive Miner actually produces rather than force
//! it through `print_dfg`.)

use anyhow::Context;
use wasm4pm_compat::event_log::EventLog as CompatEventLog;
use wasm4pm_compat::process_tree::ProcessTree;

/// Discover a process tree from a loaded `wasm4pm_compat::event_log::EventLog`
/// using the real recursive Inductive Miner
/// (`wasm4pm::more_discovery::InductiveMiner::discover`).
///
/// Returns the discovered `ProcessTree` (compat crate type), not a `DFG` —
/// Inductive Miner's output is a tree of XOR/Sequence/Parallel/Loop
/// operators over leaf activities, which is what callers (e.g. a future
/// `mining.rs` integration) should print/serialize directly.
pub fn discover_inductive(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<ProcessTree> {
    // wasm4pm::models::EventLog has a `From<wasm4pm_compat::event_log::EventLog>`
    // impl already (see wasm4pm/src/models.rs), so this is a real structural
    // conversion (attributes + traces + events), not a stub.
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    // InductiveMiner::discover expects an `AdmittedEventLog<W>`
    // (= `Evidence<EventLog, Admitted, W>`). `Admission::new(..).into_evidence()`
    // is the standard unwitnessed admission path used elsewhere in this
    // workspace (see wasm4pm/src/more_discovery.rs `discover_inductive_miner`).
    let admitted =
        wasm4pm_compat::admission::Admission::<_, ()>::new(native_log).into_evidence();

    let typed_tree = wasm4pm::more_discovery::InductiveMiner::discover(&admitted, activity_key)
        .map_err(|e| anyhow::anyhow!(e))
        .context("Inductive Miner discovery failed")?;

    Ok(typed_tree.value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Two traces sharing the "a" -> ("b" xor "c") -> "d" pattern: a
        // minimal but real 3-event-per-trace log, not a degenerate
        // single-activity case.
        let trace1 = Trace::new(
            "case-1".to_string(),
            vec![
                Event::with_activity("a"),
                Event::with_activity("b"),
                Event::with_activity("d"),
            ],
        );
        let trace2 = Trace::new(
            "case-2".to_string(),
            vec![
                Event::with_activity("a"),
                Event::with_activity("c"),
                Event::with_activity("d"),
            ],
        );
        CompatEventLog {
            attributes: Vec::new(),
            traces: vec![trace1, trace2],
            extensions: None,
            classifiers: None,
            global_trace_attrs: None,
            global_event_attrs: None,
        }
    }

    #[test]
    fn discover_inductive_runs_on_small_log_and_returns_nonempty_tree() {
        let log = build_small_log();
        let tree = discover_inductive(&log, "concept:name")
            .expect("inductive miner should discover a process tree without panicking");

        assert!(
            !tree.nodes.is_empty(),
            "expected a non-empty process tree, got {tree:?}"
        );
        assert!(
            tree.root.is_some(),
            "expected the discovered tree to have a root node"
        );
    }
}
