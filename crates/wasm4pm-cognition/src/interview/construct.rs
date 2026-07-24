//! Rule-based derivation over the Semantic Graph (ARD §3.5 CONSTRUCT Engine).
//!
//! CONSTRUCT never writes to the graph directly — it only proposes candidate
//! triples that some caller must independently admit. On zero admitted facts
//! it must produce zero obligations (bootstrap: no fabricated defaults).

use super::admission::AdmittedFact;
use super::graph::{SemanticGraph, Triple};

/// A candidate triple proposed by CONSTRUCT — not yet part of the graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateTriple(pub Triple);

const REQUIRES_OBLIGATION: &str = "requires_obligation";

/// Derive candidate `(fact_id, "requires_obligation", obligation)` triples
/// for every admitted fact that doesn't already have a matching triple
/// recorded in `graph` (idempotent: re-running against a graph that already
/// admitted a prior candidate does not propose it again).
pub fn construct_obligations(graph: &SemanticGraph, admitted: &[AdmittedFact]) -> Vec<CandidateTriple> {
    admitted
        .iter()
        .filter(|fact| {
            graph
                .query(Some(&fact.fact_hash), Some(REQUIRES_OBLIGATION), None)
                .is_empty()
        })
        .map(|fact| {
            CandidateTriple(Triple {
                subject: fact.fact_hash.clone(),
                predicate: REQUIRES_OBLIGATION.to_string(),
                object: format!("explain:{}", fact.id),
            })
        })
        .collect()
}
