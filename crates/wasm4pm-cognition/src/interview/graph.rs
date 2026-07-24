//! Real, queryable semantic graph (ARD §3.4 Semantic Graph).
//!
//! A deterministic (BTreeSet-backed) subject/predicate/object triple store
//! with wildcard pattern queries. Not the full SPARQL/RDF engine the ARD's
//! technology-choices section names — but real and queryable, not a stub.

use std::collections::BTreeSet;

/// One subject/predicate/object fact.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Triple {
    /// The subject of the triple.
    pub subject: String,
    /// The predicate (relation) of the triple.
    pub predicate: String,
    /// The object of the triple.
    pub object: String,
}

/// A deterministic, queryable graph of admitted triples.
#[derive(Debug, Clone, Default)]
pub struct SemanticGraph {
    triples: BTreeSet<Triple>,
}

impl SemanticGraph {
    /// A fresh, empty graph (bootstrap: zero triples).
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert a triple. Idempotent — inserting the same triple twice is a no-op.
    pub fn insert(&mut self, subject: impl Into<String>, predicate: impl Into<String>, object: impl Into<String>) {
        self.triples.insert(Triple {
            subject: subject.into(),
            predicate: predicate.into(),
            object: object.into(),
        });
    }

    /// Number of triples currently admitted into the graph.
    pub fn len(&self) -> usize {
        self.triples.len()
    }

    /// Whether the graph has no triples.
    pub fn is_empty(&self) -> bool {
        self.triples.is_empty()
    }

    /// Pattern-match query. `None` in any field acts as a wildcard.
    /// Results are returned in deterministic (sorted) order.
    pub fn query(
        &self,
        subject: Option<&str>,
        predicate: Option<&str>,
        object: Option<&str>,
    ) -> Vec<&Triple> {
        self.triples
            .iter()
            .filter(|triple| {
                subject.map(|s| triple.subject == s).unwrap_or(true)
                    && predicate.map(|p| triple.predicate == p).unwrap_or(true)
                    && object.map(|o| triple.object == o).unwrap_or(true)
            })
            .collect()
    }
}
