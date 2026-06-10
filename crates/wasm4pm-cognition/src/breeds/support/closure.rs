//! Horn forward-closure fixpoint engine.
//!
//! Computes the least fixed point of a set of Horn clauses (rules).
//! Reused by ASP, abductive LP, default logic, naive physics, etc.

use std::collections::BTreeSet;

/// A simple propositional Horn clause rule.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HornRule {
    /// The literal derived when the body is satisfied
    pub head: String,
    /// The required literals to satisfy this rule
    pub body: Vec<String>,
}

/// Computes the forward closure of a set of facts under a set of rules.
pub fn forward_close(facts: &BTreeSet<String>, rules: &[HornRule]) -> BTreeSet<String> {
    let mut closure = facts.clone();
    let mut changed = true;
    while changed {
        changed = false;
        for rule in rules {
            if !closure.contains(&rule.head) && rule.body.iter().all(|b| closure.contains(b)) {
                closure.insert(rule.head.clone());
                changed = true;
            }
        }
    }
    closure
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_horn_closure_monotonicity() {
        let mut facts = BTreeSet::new();
        facts.insert("A".to_string());
        
        let rules = vec![
            HornRule { head: "B".to_string(), body: vec!["A".to_string()] },
            HornRule { head: "C".to_string(), body: vec!["B".to_string()] },
        ];
        
        let closure1 = forward_close(&facts, &rules);
        assert!(closure1.contains("C"));
        
        // Monotonicity: adding facts can only increase the closure
        facts.insert("D".to_string());
        let closure2 = forward_close(&facts, &rules);
        assert!(closure1.is_subset(&closure2));
    }

    #[test]
    fn test_horn_closure_idempotence() {
        let mut facts = BTreeSet::new();
        facts.insert("A".to_string());
        
        let rules = vec![
            HornRule { head: "B".to_string(), body: vec!["A".to_string()] },
        ];
        
        let closure1 = forward_close(&facts, &rules);
        let closure2 = forward_close(&closure1, &rules);
        assert_eq!(closure1, closure2);
    }
}
