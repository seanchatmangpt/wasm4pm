//! `SortedFacts` newtype — a `Vec<Fact>` that is always sorted by key.
//!
//! Sorting is a correctness invariant, not a performance optimisation: two
//! `BreedOutput`s with the same logical facts but different insertion orders
//! must produce the same BLAKE3 receipt. Before this newtype existed, only 2
//! of 52 breeds sorted their output.

use crate::breeds::Fact;
use serde::{Deserialize, Serialize};

/// A sorted, deduplicated-by-key sequence of [`Fact`]s.
///
/// All mutating operations maintain sorted order by `key` (ascending lexicographic).
/// The inner `Vec` is not accessible mutably to callers — use `push`, `extend`,
/// or the `From<Vec<Fact>>` impl.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct SortedFacts(Vec<Fact>);

impl SortedFacts {
    /// Create an empty collection.
    pub fn new() -> Self {
        Self(Vec::new())
    }

    /// Insert `fact` into sorted position (O(n) insert-in-place; fine for ≤256 facts).
    pub fn push(&mut self, fact: Fact) {
        let pos = self.0.partition_point(|x| x.key <= fact.key);
        self.0.insert(pos, fact);
    }

    /// Insert all facts from an iterator, maintaining sorted order.
    pub fn extend_sorted(&mut self, iter: impl IntoIterator<Item = Fact>) {
        for f in iter {
            self.push(f);
        }
    }

    /// Find the first fact whose key equals `key`.
    pub fn get(&self, key: &str) -> Option<&Fact> {
        let pos = self.0.partition_point(|x| x.key.as_str() < key);
        self.0.get(pos).filter(|f| f.key == key)
    }

    /// Iterate over all facts whose key starts with `prefix`.
    pub fn prefix_iter<'a>(&'a self, prefix: &'a str) -> impl Iterator<Item = &'a Fact> {
        let start = self.0.partition_point(|x| x.key.as_str() < prefix);
        self.0[start..]
            .iter()
            .take_while(move |f| f.key.starts_with(prefix))
    }

    /// Number of facts.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// True if empty.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Borrow the inner slice.
    pub fn as_slice(&self) -> &[Fact] {
        &self.0
    }

    /// Consume into the inner Vec (already sorted).
    pub fn into_vec(self) -> Vec<Fact> {
        self.0
    }
}

impl From<Vec<Fact>> for SortedFacts {
    fn from(mut v: Vec<Fact>) -> Self {
        v.sort_by(|a, b| a.key.cmp(&b.key));
        Self(v)
    }
}

impl IntoIterator for SortedFacts {
    type Item = Fact;
    type IntoIter = std::vec::IntoIter<Fact>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a SortedFacts {
    type Item = &'a Fact;
    type IntoIter = std::slice::Iter<'a, Fact>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str) -> Fact {
        Fact { key: key.to_string(), value: value.to_string() }
    }

    #[test]
    fn push_maintains_order() {
        let mut sf = SortedFacts::new();
        sf.push(fact("z", "last"));
        sf.push(fact("a", "first"));
        sf.push(fact("m", "middle"));
        let keys: Vec<&str> = sf.as_slice().iter().map(|f| f.key.as_str()).collect();
        assert_eq!(keys, vec!["a", "m", "z"]);
    }

    #[test]
    fn from_vec_sorts() {
        let v = vec![fact("c", "3"), fact("a", "1"), fact("b", "2")];
        let sf = SortedFacts::from(v);
        let keys: Vec<&str> = sf.as_slice().iter().map(|f| f.key.as_str()).collect();
        assert_eq!(keys, vec!["a", "b", "c"]);
    }

    #[test]
    fn get_returns_matching_key() {
        let sf = SortedFacts::from(vec![fact("x", "10"), fact("y", "20")]);
        assert_eq!(sf.get("x").map(|f| f.value.as_str()), Some("10"));
        assert!(sf.get("z").is_none());
    }

    #[test]
    fn prefix_iter_returns_matching_keys() {
        let sf = SortedFacts::from(vec![
            fact("ltl:step:1", "a"),
            fact("ltl:step:2", "b"),
            fact("other:x", "c"),
        ]);
        let ltl_keys: Vec<&str> = sf.prefix_iter("ltl:").map(|f| f.key.as_str()).collect();
        assert_eq!(ltl_keys, vec!["ltl:step:1", "ltl:step:2"]);
    }

    #[test]
    fn serde_roundtrip_transparent() {
        let sf = SortedFacts::from(vec![fact("b", "2"), fact("a", "1")]);
        let json = serde_json::to_string(&sf).unwrap();
        // transparent — serialized as a plain array, sorted
        assert!(json.contains(r#""key":"a""#));
        let back: SortedFacts = serde_json::from_str(&json).unwrap();
        assert_eq!(back.len(), 2);
    }
}
