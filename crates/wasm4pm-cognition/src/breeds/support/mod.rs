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
