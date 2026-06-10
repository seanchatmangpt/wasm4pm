//! Clause and Literal types for SAT CDCL and Circumscription.
//!
//! Provides the foundational `Lit` (a variable with a sign) and `Clause` (a disjunction of literals).

/// A literal representing a boolean variable and its sign.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Lit {
    /// The variable index
    pub var: u32,
    /// True if positive, false if negative
    pub sign: bool,
}

impl Lit {
    /// Create a new literal.
    pub fn new(var: u32, sign: bool) -> Self {
        Self { var, sign }
    }
    
    /// Return the negated version of this literal.
    pub fn negate(self) -> Self {
        Self { var: self.var, sign: !self.sign }
    }
}

/// A clause representing a disjunction of literals.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Clause {
    /// The literals in this disjunction
    pub lits: Vec<Lit>,
}

impl Clause {
    /// Create a new clause from a vector of literals.
    pub fn new(lits: Vec<Lit>) -> Self {
        Self { lits }
    }

    /// Check if the clause is empty.
    pub fn is_empty(&self) -> bool {
        self.lits.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lit_negation_involution() {
        let l = Lit::new(42, true);
        assert_eq!(l.negate().negate(), l);
    }
}
