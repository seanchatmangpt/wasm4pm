//! Horn forward-closure fixpoint engine, shared by asp, abductive_lp, ebl,
//! default_logic, naive_physics, and description-logic completion.
//!
//! Semantics: the least model of a definite (Horn) program — the smallest set
//! of atoms containing the initial facts and closed under every rule whose
//! premises are all present.
//!
//! Rank-1 properties proven below: idempotence (`close(close(F)) == close(F)`),
//! monotonicity (`F ⊆ G ⇒ close(F) ⊆ close(G)`), inflationarity
//! (`F ⊆ close(F)`), and exact chain derivation.

use std::collections::BTreeSet;

/// A definite Horn rule: if every premise atom holds, the conclusion holds.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HornRule {
    /// Rule identifier (used in fired-rule reporting).
    pub id: String,
    /// Premise atoms (all must be in the working set).
    pub premises: Vec<String>,
    /// Conclusion atom added when the rule fires.
    pub conclusion: String,
}

/// Result of a forward closure run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClosureResult {
    /// The least model: initial facts plus everything derivable.
    pub facts: BTreeSet<String>,
    /// Rules that fired, in deterministic firing order: `(rule_id, derived_atom)`.
    /// A rule is recorded at most once (the first time it adds its conclusion).
    pub fired: Vec<(String, String)>,
}

/// Compute the least Horn model of `facts` under `rules` by naive fixpoint
/// iteration (rules scanned in slice order, repeated until no change).
///
/// Terminates in at most `rules.len()` passes after the last new atom, since
/// each productive pass adds at least one atom and the universe is finite.
pub fn forward_close(facts: &BTreeSet<String>, rules: &[HornRule]) -> ClosureResult {
    let mut current = facts.clone();
    let mut fired: Vec<(String, String)> = Vec::new();
    loop {
        let mut changed = false;
        for rule in rules {
            if current.contains(&rule.conclusion) {
                continue;
            }
            if rule.premises.iter().all(|p| current.contains(p)) {
                current.insert(rule.conclusion.clone());
                fired.push((rule.id.clone(), rule.conclusion.clone()));
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    ClosureResult {
        facts: current,
        fired,
    }
}

/// True iff `atom` is in the least model of `facts` under `rules`.
pub fn derives(facts: &BTreeSet<String>, rules: &[HornRule], atom: &str) -> bool {
    forward_close(facts, rules).facts.contains(atom)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn rule(id: &str, premises: &[&str], conclusion: &str) -> HornRule {
        HornRule {
            id: id.to_string(),
            premises: premises.iter().map(|s| s.to_string()).collect(),
            conclusion: conclusion.to_string(),
        }
    }

    fn facts(xs: &[&str]) -> BTreeSet<String> {
        xs.iter().map(|s| s.to_string()).collect()
    }

    fn arb_atom() -> impl Strategy<Value = String> {
        "[a-e]".prop_map(|s| s.to_string())
    }

    fn arb_rules() -> impl Strategy<Value = Vec<HornRule>> {
        proptest::collection::vec(
            (
                proptest::collection::vec(arb_atom(), 0..3),
                arb_atom(),
            ),
            0..8,
        )
        .prop_map(|rs| {
            rs.into_iter()
                .enumerate()
                .map(|(i, (premises, conclusion))| HornRule {
                    id: format!("r{}", i),
                    premises,
                    conclusion,
                })
                .collect()
        })
    }

    fn arb_facts() -> impl Strategy<Value = BTreeSet<String>> {
        proptest::collection::btree_set(arb_atom(), 0..4)
    }

    proptest! {
        #[test]
        fn idempotent(f in arb_facts(), rules in arb_rules()) {
            let once = forward_close(&f, &rules);
            let twice = forward_close(&once.facts, &rules);
            prop_assert_eq!(&once.facts, &twice.facts);
            prop_assert!(twice.fired.is_empty(), "closure of a fixpoint must fire nothing");
        }

        #[test]
        fn inflationary(f in arb_facts(), rules in arb_rules()) {
            let closed = forward_close(&f, &rules);
            prop_assert!(f.is_subset(&closed.facts));
        }

        #[test]
        fn monotone(f in arb_facts(), extra in arb_atom(), rules in arb_rules()) {
            let small = forward_close(&f, &rules);
            let mut g = f.clone();
            g.insert(extra);
            let big = forward_close(&g, &rules);
            prop_assert!(small.facts.is_subset(&big.facts));
        }

        #[test]
        fn fired_count_equals_derived_count(f in arb_facts(), rules in arb_rules()) {
            let closed = forward_close(&f, &rules);
            prop_assert_eq!(closed.fired.len(), closed.facts.len() - f.len());
        }
    }

    #[test]
    fn chain_derivation_exact() {
        let rules = vec![
            rule("r1", &["a"], "b"),
            rule("r2", &["b"], "c"),
            rule("r3", &["c", "x"], "d"), // x never derivable → d must not appear
        ];
        let result = forward_close(&facts(&["a"]), &rules);
        assert_eq!(result.facts, facts(&["a", "b", "c"]));
        assert_eq!(
            result.fired,
            vec![
                ("r1".to_string(), "b".to_string()),
                ("r2".to_string(), "c".to_string())
            ]
        );
        assert!(derives(&facts(&["a"]), &rules, "c"));
        assert!(!derives(&facts(&["a"]), &rules, "d"));
    }

    #[test]
    fn multi_pass_fixpoint_needed() {
        // Rule order forces a second pass: r_late concludes 'b' which r_early needs.
        let rules = vec![rule("early", &["b"], "c"), rule("late", &["a"], "b")];
        let result = forward_close(&facts(&["a"]), &rules);
        assert_eq!(result.facts, facts(&["a", "b", "c"]));
        // Deterministic firing order: pass 1 fires "late", pass 2 fires "early".
        assert_eq!(result.fired[0].0, "late");
        assert_eq!(result.fired[1].0, "early");
    }

    #[test]
    fn empty_program_is_identity() {
        let f = facts(&["a", "b"]);
        let result = forward_close(&f, &[]);
        assert_eq!(result.facts, f);
        assert!(result.fired.is_empty());
    }
}
