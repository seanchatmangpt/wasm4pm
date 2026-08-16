//! Bridge that wires the real region-based ILP-inspired Petri net discovery
//! (`wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log`, a 4-stage
//! causal-pair / candidate-place / token-replay / greedy-set-cover pipeline)
//! into the CLI's event-log type.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`discover_ilp_real`]. Mirrors the pattern established by
//! `heuristic_bridge.rs` and `inductive_bridge.rs` in this same directory.
//!
//! `discover_ilp_petri_net_from_log` returns `(PetriNet, f64, f64)` — a
//! **Petri net** with fitness and precision, not a DFG. A DFG cannot
//! represent the AND-split/AND-join places ILP discovers without lossy
//! flattening, so this bridge returns the Petri net type the algorithm
//! actually produces (plus its fitness/precision metrics), rather than
//! forcing it through a DFG shape.

use wasm4pm::models::PetriNet;
use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Result of running the real ILP-inspired region-based discovery algorithm:
/// the discovered Petri net plus its token-replay fitness and precision.
pub struct IlpDiscoveryResult {
    pub petri_net: PetriNet,
    pub fitness: f64,
    pub precision: f64,
}

/// Discover a Petri net from a loaded `wasm4pm_compat::event_log::EventLog`
/// using the real ILP-inspired region-based discovery algorithm
/// (`wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log`).
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
pub fn discover_ilp_real(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<IlpDiscoveryResult> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    let (petri_net, fitness, precision) =
        wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log(&native_log, activity_key);

    Ok(IlpDiscoveryResult {
        petri_net,
        fitness,
        precision,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Three traces of the "a" -> "b" -> "c" pattern, repeated, so the
        // causal a->b->c chain is strong enough to survive token-replay
        // validation and greedy set-cover (a degenerate single-trace log
        // would leave every candidate place trivially "consistent" without
        // exercising the coverage logic).
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
                Event::with_activity("c"),
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
    fn discover_ilp_real_runs_on_small_log_and_finds_causal_places() {
        let log = build_small_log();
        let result = discover_ilp_real(&log, "concept:name")
            .expect("ILP discovery should run without panicking");

        assert!(
            !result.petri_net.transitions.is_empty(),
            "expected transitions for a, b, c, got {:?}",
            result.petri_net.transitions
        );
        assert!(
            result.petri_net.places.len() > 2,
            "expected source/sink plus at least one causal region place, got places: {:?}",
            result.petri_net.places
        );
        assert!(
            result.fitness > 0.0,
            "expected positive replay fitness for a log that is fully covered by its own \
             discovered model, got fitness={}",
            result.fitness
        );
    }
}
