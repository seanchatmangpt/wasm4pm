//! Bridge that wires the real Particle Swarm Optimization discovery
//! implementation (`wasm4pm::genetic_discovery::discover_pso_algorithm_from_log`
//! — swarm of edge-set particles pulled toward personal-best (pBest) and
//! global-best (gBest) positions via seeded probabilistic blending, plus
//! mutation, seeded deterministically) into the CLI's event-log type.
//!
//! PSO lives in `wasm4pm::genetic_discovery` alongside the Genetic Algorithm
//! and ACO implementations, but it is a distinct, independently callable
//! "log in, DFG out" entry point (`discover_pso_algorithm_from_log`) with its
//! own particle/pbest/gbest update logic, not an internal helper of GA or
//! ACO — hence its own bridge file rather than folding it into
//! `genetic_bridge.rs` or `aco_bridge.rs`.
//!
//! Mirrors the pattern established by `genetic_bridge.rs` and
//! `aco_bridge.rs` in this same directory.

use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Default swarm size, matching the "swarm intelligence" defaults documented
/// alongside `discover_genetic_algorithm` / `discover_aco_algorithm` in the
/// same module (50 for a reasonable quality/speed tradeoff on small logs).
pub const DEFAULT_SWARM_SIZE: usize = 50;

/// Default number of iterations, same rationale as above.
pub const DEFAULT_ITERATIONS: usize = 50;

/// Discover a DFG from a loaded `wasm4pm_compat::event_log::EventLog` using
/// the real Particle Swarm Optimization algorithm
/// (`wasm4pm::genetic_discovery::discover_pso_algorithm_from_log`).
///
/// Returns `(DFG, final_fitness)` — the fitness score of the swarm's global
/// best edge set, mirroring what `discover_pso_algorithm` (the
/// wasm-bindgen-facing wrapper) reports as `final_fitness`.
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
pub fn discover_pso_real(
    log: &CompatEventLog,
    activity_key: &str,
) -> anyhow::Result<(wasm4pm::models::DFG, f64)> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    wasm4pm::genetic_discovery::discover_pso_algorithm_from_log(
        &native_log,
        activity_key,
        DEFAULT_SWARM_SIZE,
        DEFAULT_ITERATIONS,
    )
    .ok_or_else(|| anyhow::anyhow!("PSO discovery found no directly-follows edges"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{Event, Trace};

    fn build_small_log() -> CompatEventLog {
        // Four repeats of "a" -> "b" -> "c" so the a->b->c edges have a real
        // observed frequency for the fitness function to reward, giving the
        // pbest/gbest pull something non-degenerate to converge toward.
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
    fn discover_pso_real_runs_on_small_log_and_converges_to_a_fit_dfg() {
        let log = build_small_log();
        let (dfg, fitness) = discover_pso_real(&log, "concept:name")
            .expect("PSO discovery should discover a DFG without panicking");

        assert!(!dfg.nodes.is_empty(), "expected a non-empty DFG, got {dfg:?}");
        assert!(
            fitness > 0.0,
            "expected the swarm's global best to reach positive fitness on a log with \
             a single strong a->b->c pattern, got fitness={fitness}"
        );
        let has_a_to_b = dfg.edges.iter().any(|e| e.from == "a" && e.to == "b");
        assert!(
            has_a_to_b,
            "expected the dominant a->b edge to survive swarm convergence, got edges: {:?}",
            dfg.edges
        );
    }
}
