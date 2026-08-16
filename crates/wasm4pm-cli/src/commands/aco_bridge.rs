//! Bridge that wires the real Ant Colony Optimization discovery
//! implementation (`wasm4pm::genetic_discovery::discover_aco_algorithm_from_log`
//! — pheromone-trail / heuristic-guided probabilistic edge selection with
//! MMAS-style bounded pheromone, seeded deterministically) into the CLI's
//! event-log type.
//!
//! ACO lives in `wasm4pm::genetic_discovery` alongside the Genetic Algorithm
//! and PSO implementations, but it is a distinct, independently callable
//! "log in, DFG out" entry point (`discover_aco_algorithm_from_log`), not an
//! internal helper of the genetic algorithm — hence its own bridge file
//! rather than folding it into `genetic_bridge.rs`.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`discover_aco_real`]. Mirrors the pattern established by
//! `heuristic_bridge.rs` and `inductive_bridge.rs` in this same directory.

use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Default ant count, matching the "swarm intelligence" defaults documented
/// alongside `discover_genetic_algorithm` in the same module (50 for a
/// reasonable quality/speed tradeoff on small logs).
pub const DEFAULT_ANT_COUNT: usize = 50;

/// Default number of iterations, same rationale as above.
pub const DEFAULT_ITERATIONS: usize = 50;

/// Discover a DFG from a loaded `wasm4pm_compat::event_log::EventLog` using
/// the real Ant Colony Optimization algorithm
/// (`wasm4pm::genetic_discovery::discover_aco_algorithm_from_log`).
///
/// Returns `(DFG, final_fitness)` — the fitness score of the best ant's edge
/// set, mirroring what `discover_aco_algorithm` (the wasm-bindgen-facing
/// wrapper) reports as `final_fitness`.
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
pub fn discover_aco_real(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<(wasm4pm::models::DFG, f64)> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();
    let has_nontrivial_input = native_log.traces.iter().any(|t| t.events.len() >= 2);

    let (dfg, fitness) = wasm4pm::genetic_discovery::discover_aco_algorithm_from_log(
        &native_log,
        activity_key,
        DEFAULT_ANT_COUNT,
        DEFAULT_ITERATIONS,
    )
    .ok_or_else(|| anyhow::anyhow!("ACO discovery found no directly-follows edges"))?;

    // DEGENERATE_RESULT typed refusal: a real, observed failure mode where
    // discover_aco_algorithm_from_log returns Some((empty DFG, low fitness))
    // rather than None on a log that genuinely has directly-follows pairs to
    // find (empty-DFG success on a nontrivial input, confirmed live against
    // a real fixture during the W4PM-LEAN-GALL-009 audit — fitness 0.2, zero
    // edges). This must not be reported as a successful discovery; the
    // pheromone-trail search collapsed to nothing, which is a distinct,
    // named failure mode from "the algorithm ran and found no evidence at
    // all" (a genuinely empty/degenerate input, which is fine to report as
    // an empty DFG).
    if has_nontrivial_input && dfg.edges.is_empty() {
        return Err(anyhow::anyhow!(
            "DEGENERATE_RESULT: ACO discovery returned an empty DFG (fitness={fitness}) on a \
             log with directly-follows pairs present — the pheromone-trail search collapsed \
             to nothing rather than genuinely finding no structure. Not treated as success."
        ));
    }

    Ok((dfg, fitness))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Four repeats of "a" -> "b" -> "c" so the a->b->c edges have a real
        // observed frequency for the heuristic (eta) term to reward, giving
        // pheromone deposition something non-degenerate to reinforce.
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
    fn discover_aco_real_runs_on_small_log_and_finds_dominant_edges() {
        let log = build_small_log();
        let (dfg, fitness) = discover_aco_real(&log, "concept:name")
            .expect("ACO discovery should discover a DFG without panicking");

        assert!(!dfg.nodes.is_empty(), "expected a non-empty DFG, got {dfg:?}");
        assert!(
            fitness > 0.0,
            "expected the best ant's edge set to reach positive fitness on a log with \
             a single strong a->b->c pattern, got fitness={fitness}"
        );
        let has_a_to_b = dfg.edges.iter().any(|e| e.from == "a" && e.to == "b");
        assert!(
            has_a_to_b,
            "expected the dominant a->b edge to survive pheromone reinforcement, got edges: {:?}",
            dfg.edges
        );
    }
}
