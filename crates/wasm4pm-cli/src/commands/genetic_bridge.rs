//! Bridge that wires the real Genetic Algorithm discovery implementation
//! (`wasm4pm::genetic_discovery::discover_genetic_algorithm_from_log` —
//! evolves a population of DFG edge-set candidates over generations via
//! elitism, crossover, and mutation, seeded deterministically) into the
//! CLI's event-log type.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`discover_genetic_real`]. Mirrors the pattern established by
//! `heuristic_bridge.rs` and `inductive_bridge.rs` in this same directory.

use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Default population size, matching the doc comment on
/// `wasm4pm::genetic_discovery::discover_genetic_algorithm` ("For faster
/// results at lower quality, reduce both to 50").
pub const DEFAULT_POPULATION_SIZE: usize = 50;

/// Default number of generations, same source as above.
pub const DEFAULT_GENERATIONS: usize = 50;

/// Discover a DFG from a loaded `wasm4pm_compat::event_log::EventLog` using
/// the real Genetic Algorithm
/// (`wasm4pm::genetic_discovery::discover_genetic_algorithm_from_log`).
///
/// Returns `(DFG, final_fitness)` — the fitness score the evolved edge set
/// achieved against the log, mirroring what `discover_genetic_algorithm`
/// (the wasm-bindgen-facing wrapper) reports as `final_fitness`.
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
pub fn discover_genetic_real(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<(wasm4pm::models::DFG, f64)> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    wasm4pm::genetic_discovery::discover_genetic_algorithm_from_log(
        &native_log,
        activity_key,
        DEFAULT_POPULATION_SIZE,
        DEFAULT_GENERATIONS,
    )
    .ok_or_else(|| anyhow::anyhow!("genetic algorithm discovery found no directly-follows edges"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Two traces sharing the "a" -> "b" -> "c" pattern, repeated across
        // several cases, so the a->b->c edges have real observed frequency
        // for the fitness function to reward (a single-trace log would make
        // every edge subset trivially "fully fit").
        let trace = || {
            Trace::new(
                "case".to_string(),
                vec![
                    Event::with_activity("a"),
                    Event::with_activity("b"),
                    Event::with_activity("c"),
                ],
            )
        };
        CompatEventLog {
            attributes: Vec::new(),
            traces: vec![trace(), trace(), trace(), trace()],
            extensions: None,
            classifiers: None,
            global_trace_attrs: None,
            global_event_attrs: None,
        }
    }

    #[test]
    fn discover_genetic_real_runs_on_small_log_and_evolves_a_fit_dfg() {
        let log = build_small_log();
        let (dfg, fitness) = discover_genetic_real(&log, "concept:name")
            .expect("genetic algorithm should discover a DFG without panicking");

        assert!(!dfg.nodes.is_empty(), "expected a non-empty DFG, got {dfg:?}");
        assert!(
            fitness > 0.0,
            "expected the evolved population to reach positive fitness on a log with \
             a single strong a->b->c pattern, got fitness={fitness}"
        );
        let has_a_to_b = dfg.edges.iter().any(|e| e.from == "a" && e.to == "b");
        assert!(
            has_a_to_b,
            "expected the dominant a->b edge to survive evolution, got edges: {:?}",
            dfg.edges
        );
    }
}
