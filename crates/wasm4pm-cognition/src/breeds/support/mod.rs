//! Combinator core: shared, fully-validated algebraic machinery for the
//! periodic-table breeds (Stage C1). Hand-written, deterministic (BTreeMap /
//! sorted Vec everywhere); every module carries its own Rank-1 unit/property
//! tests proving its math. No breed-specific logic lives here.

/// MYCIN certainty-factor combination (promoted from production_rules).
pub mod certainty;
/// Lit/Clause types + resolution for SAT (CDCL) and circumscription.
pub mod clauses;
/// Horn forward-closure fixpoint engine (least-model semantics).
pub mod closure;
/// Finite-domain CSP: AC-3 + arithmetic revise + MRV/MAC labeling.
pub mod csp;
/// Typed parsers for prefix-based fact keys.
pub mod fact_keys;
/// Temporal-logic formula AST + Pratt parser (LTL core + CTL path quantifiers).
pub mod formula;
/// Deterministic BTreeMap digraph: topo sort, reachability.
pub mod graph;
/// MDP model + deterministic value iteration (Bellman fixed point).
pub mod mdp;
/// Seeded RNG helper to guarantee determinism.
pub mod rng;
/// S-expression parser (SME structure mapping).
pub mod sexpr;
/// Sorted, deduplicated-by-key Fact collection — enforces receipt determinism as a type invariant.
pub mod sorted_facts;
/// Typed staged computation with automatic OCEL trace emission.
pub mod pipeline;
/// Zero-copy assertion API over a breed's `inference_trace`.
pub mod trace_query;
/// Append-only `TraceStep` accumulator (replaces hand-rolled push closures).
pub mod tracer;
/// Universal anti-cheat oracle trait and harness.
pub mod oracle;
/// Breed class supertraits: VerifierBreed, PlannerBreed, ClassifierBreed, OptimizerBreed.
pub mod breed_class;
/// Typed complexity-cap enforcement via DomainBound + BoundedBreed trait.
pub mod domain_bound;
/// Append-only monotonically-indexed trace sequence.
pub mod monotonic_trace;
/// Per-breed [`oracle::BreedOracle`] implementations for the universal
/// anti-cheat harness. Feature-gated: oracle inputs are test surface, never
/// production or wasm code.
#[cfg(all(not(target_arch = "wasm32"), feature = "breed-oracles"))]
pub mod oracle_impls;
