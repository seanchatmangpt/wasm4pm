//! Propositional literal/clause types for SAT (CDCL) and circumscription.
//!
//! Rank-1 properties proven below: double negation is the identity; clauses
//! are canonical (sorted, deduplicated); resolution of `(a ∨ b)` and
//! `(¬a ∨ c)` on `a` is `(b ∨ c)`; tautology detection is exact.

use std::collections::BTreeMap;

/// A propositional literal: variable index + polarity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Lit {
    /// Variable index (0-based).
    pub var: u32,
    /// `true` for the positive literal `x`, `false` for `¬x`.
    pub positive: bool,
}

impl Lit {
    /// Positive literal of `var`.
    pub fn pos(var: u32) -> Self {
        Lit {
            var,
            positive: true,
        }
    }

    /// Negative literal of `var`.
    pub fn neg(var: u32) -> Self {
        Lit {
            var,
            positive: false,
        }
    }

    /// The complementary literal.
    pub fn negated(self) -> Self {
        Lit {
            var: self.var,
            positive: !self.positive,
        }
    }

    /// Evaluate under a (partial) assignment; `None` if the variable is unassigned.
    pub fn eval(self, assignment: &BTreeMap<u32, bool>) -> Option<bool> {
        assignment.get(&self.var).map(|&v| v == self.positive)
    }
}

/// A disjunction of literals in canonical form (sorted, deduplicated).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Clause {
    lits: Vec<Lit>,
}

impl Clause {
    /// Build a canonical clause: literals sorted and deduplicated.
    pub fn new(mut lits: Vec<Lit>) -> Self {
        lits.sort_unstable();
        lits.dedup();
        Clause { lits }
    }

    /// The literals in canonical (sorted) order.
    pub fn lits(&self) -> &[Lit] {
        &self.lits
    }

    /// Number of literals.
    pub fn len(&self) -> usize {
        self.lits.len()
    }

    /// True iff the clause is empty (i.e. unsatisfiable).
    pub fn is_empty(&self) -> bool {
        self.lits.is_empty()
    }

    /// True iff the clause contains the literal.
    pub fn contains(&self, l: Lit) -> bool {
        self.lits.binary_search(&l).is_ok()
    }

    /// True iff the clause contains both `x` and `¬x` for some variable.
    pub fn is_tautology(&self) -> bool {
        self.lits
            .windows(2)
            .any(|w| w[0].var == w[1].var && w[0].positive != w[1].positive)
    }

    /// Evaluate under a partial assignment.
    ///
    /// `Some(true)` if any literal is true, `Some(false)` if all literals are
    /// assigned and false, `None` otherwise (undetermined).
    pub fn eval(&self, assignment: &BTreeMap<u32, bool>) -> Option<bool> {
        let mut all_false = true;
        for l in &self.lits {
            match l.eval(assignment) {
                Some(true) => return Some(true),
                Some(false) => {}
                None => all_false = false,
            }
        }
        if all_false {
            Some(false)
        } else {
            None
        }
    }

    /// Binary resolution on `var`: requires `self` to contain `var` positively
    /// and `other` to contain it negatively. Returns the (canonical) resolvent,
    /// or `None` if the pivot polarities are not present.
    pub fn resolve(&self, other: &Clause, var: u32) -> Option<Clause> {
        if !self.contains(Lit::pos(var)) || !other.contains(Lit::neg(var)) {
            return None;
        }
        let mut lits: Vec<Lit> = self
            .lits
            .iter()
            .chain(other.lits.iter())
            .copied()
            .filter(|l| l.var != var)
            .collect();
        lits.sort_unstable();
        lits.dedup();
        Some(Clause { lits })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn double_negation_is_identity(v in 0u32..64, p in any::<bool>()) {
            let l = Lit { var: v, positive: p };
            prop_assert_eq!(l.negated().negated(), l);
            prop_assert_ne!(l.negated(), l);
        }

        #[test]
        fn clause_canonical_form_is_order_independent(vs in proptest::collection::vec((0u32..16, any::<bool>()), 0..12)) {
            let lits: Vec<Lit> = vs.iter().map(|&(v, p)| Lit { var: v, positive: p }).collect();
            let mut rev = lits.clone();
            rev.reverse();
            prop_assert_eq!(Clause::new(lits), Clause::new(rev));
        }
    }

    #[test]
    fn resolution_textbook_case() {
        // (a ∨ b) ⊗_a (¬a ∨ c) = (b ∨ c)
        let c1 = Clause::new(vec![Lit::pos(0), Lit::pos(1)]);
        let c2 = Clause::new(vec![Lit::neg(0), Lit::pos(2)]);
        let r = c1.resolve(&c2, 0).expect("pivot present");
        assert_eq!(r, Clause::new(vec![Lit::pos(1), Lit::pos(2)]));
        // wrong polarity direction → None
        assert!(c2.resolve(&c1, 0).is_none());
    }

    #[test]
    fn resolving_unit_clauses_yields_empty_clause() {
        let c1 = Clause::new(vec![Lit::pos(3)]);
        let c2 = Clause::new(vec![Lit::neg(3)]);
        let r = c1.resolve(&c2, 3).unwrap();
        assert!(r.is_empty());
    }

    #[test]
    fn tautology_detection() {
        assert!(Clause::new(vec![Lit::pos(1), Lit::neg(1)]).is_tautology());
        assert!(!Clause::new(vec![Lit::pos(1), Lit::neg(2)]).is_tautology());
    }

    #[test]
    fn partial_evaluation() {
        let c = Clause::new(vec![Lit::pos(0), Lit::neg(1)]);
        let mut a = BTreeMap::new();
        assert_eq!(c.eval(&a), None);
        a.insert(0, false);
        assert_eq!(c.eval(&a), None); // ¬1 still open
        a.insert(1, true);
        assert_eq!(c.eval(&a), Some(false));
        a.insert(1, false);
        assert_eq!(c.eval(&a), Some(true));
    }
}
