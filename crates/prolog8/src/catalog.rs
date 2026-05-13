//! Catalog: predicate / term registries with admission metadata.
//!
//! The catalog is the *only* mapping from external symbols to interned
//! identifiers. The kernel never sees strings; admission converts text to
//! IDs at the boundary.

use crate::hash::{hash_bytes, Hash, DOMAIN_PROLOG8_CATALOG};
use crate::types::{CatalogId, PredicateId, TermId, ARITY_CAP};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Proof emission policy for a predicate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PredicateProofPolicy {
    /// Always emit proof for queries on this predicate.
    Always,
    /// Only emit proof when the query asks for it.
    OnRequest,
    /// Never emit proof (e.g., bulk lookups where proof is contractually elsewhere).
    Never,
}

/// Per-predicate admission metadata. Mirrors ARD section 4.2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PredicateMeta {
    /// Predicate identifier.
    pub pred_id: PredicateId,
    /// Display label (NOT used for execution).
    pub label: String,
    /// Arity. Must be ≤ ARITY_CAP.
    pub arity: u8,
    /// Sorted column orders the catalog provides indexes for.
    pub access_orders: Vec<[u8; ARITY_CAP as usize]>,
    /// Proof policy.
    pub proof_policy: PredicateProofPolicy,
    /// True if a derived/materialized view exists.
    pub materialized: bool,
}

/// The catalog of admitted predicates and terms.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Catalog {
    /// Catalog identifier.
    pub catalog_id: CatalogId,
    /// Predicate metadata indexed by id.
    pub predicates: BTreeMap<PredicateId, PredicateMeta>,
    /// Term display labels (kept here only for explain rendering).
    pub term_labels: BTreeMap<TermId, String>,
    /// Reverse index: label → predicate id (boundary use only).
    pub predicate_by_label: BTreeMap<String, PredicateId>,
    /// Reverse index: label → term id (boundary use only).
    pub term_by_label: BTreeMap<String, TermId>,
}

impl Catalog {
    /// Construct an empty catalog with the given id.
    pub fn new(catalog_id: CatalogId) -> Self {
        Self {
            catalog_id,
            ..Default::default()
        }
    }

    /// Add a predicate. Replaces any existing entry under the same id.
    pub fn add_predicate(&mut self, meta: PredicateMeta) {
        self.predicate_by_label.insert(meta.label.clone(), meta.pred_id);
        self.predicates.insert(meta.pred_id, meta);
    }

    /// Intern a term label; returns the assigned `TermId`.
    /// Reserves id 0 as the sentinel.
    pub fn intern_term(&mut self, label: impl Into<String>) -> TermId {
        let label: String = label.into();
        if let Some(existing) = self.term_by_label.get(&label) {
            return *existing;
        }
        // First non-sentinel id is 1.
        let next_id = (self.term_labels.len() as u32).saturating_add(1);
        let id = TermId(next_id);
        self.term_by_label.insert(label.clone(), id);
        self.term_labels.insert(id, label);
        id
    }

    /// Lookup the metadata of a predicate by id.
    pub fn predicate(&self, id: PredicateId) -> Option<&PredicateMeta> {
        self.predicates.get(&id)
    }

    /// Lookup the display label of a term.
    pub fn term_label(&self, id: TermId) -> Option<&str> {
        self.term_labels.get(&id).map(String::as_str)
    }

    /// Lookup a predicate id by its display label (boundary only).
    pub fn predicate_id(&self, label: &str) -> Option<PredicateId> {
        self.predicate_by_label.get(label).copied()
    }

    /// Lookup a term id by its display label (boundary only).
    pub fn term_id(&self, label: &str) -> Option<TermId> {
        self.term_by_label.get(label).copied()
    }

    /// Compute the canonical catalog root.
    pub fn catalog_root(&self) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_CATALOG);
        hasher.update(&self.catalog_id.0.to_le_bytes());
        hasher.update(&(self.predicates.len() as u32).to_le_bytes());
        for (id, meta) in &self.predicates {
            hasher.update(&id.0.to_le_bytes());
            hasher.update(&[meta.arity]);
            hasher.update(meta.label.as_bytes());
        }
        hasher.update(&(self.term_labels.len() as u32).to_le_bytes());
        for (id, label) in &self.term_labels {
            hasher.update(&id.0.to_le_bytes());
            hasher.update(label.as_bytes());
        }
        hasher.finalize().into()
    }

    /// Hash a single label under the catalog domain (utility for tests).
    pub fn hash_label(label: &str) -> Hash {
        hash_bytes(&DOMAIN_PROLOG8_CATALOG, label.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intern_term_returns_existing_id() {
        let mut cat = Catalog::new(CatalogId(1));
        let a = cat.intern_term("alice");
        let b = cat.intern_term("alice");
        let c = cat.intern_term("bob");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn term_id_zero_is_sentinel_and_not_assigned() {
        let mut cat = Catalog::new(CatalogId(1));
        let a = cat.intern_term("alice");
        assert_ne!(a.0, 0);
    }

    #[test]
    fn predicate_round_trip() {
        let mut cat = Catalog::new(CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(7),
            label: "parent".into(),
            arity: 2,
            access_orders: vec![[0, 1, 0, 0, 0, 0, 0, 0]],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let id = cat.predicate_id("parent").expect("present");
        assert_eq!(id, PredicateId(7));
        let meta = cat.predicate(id).expect("meta present");
        assert_eq!(meta.arity, 2);
    }

    #[test]
    fn catalog_root_is_deterministic() {
        let mut cat = Catalog::new(CatalogId(99));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: "p".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::Always,
            materialized: false,
        });
        cat.intern_term("a");
        cat.intern_term("b");
        let h1 = cat.catalog_root();
        let h2 = cat.catalog_root();
        assert_eq!(h1, h2);
    }
}
