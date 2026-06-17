//! Smullyan signed analytic tableaux for propositional validity (Smullyan 1968,
//! "First-Order Logic", Part I).
//!
//! Algorithm:
//! 1. Parse the goal formula from the `tableaux:formula` fact (propositional
//!    fragment of the shared Pratt parser: atoms, `!`, `&`, `|`, `->`,
//!    `true`, `false`). Temporal/CTL operators are refused.
//! 2. Sign the root `F φ` (assume the formula false) and expand the tableau:
//!    alpha (non-branching) rules are always applied before beta (branching)
//!    rules — alpha-first expansion is the structural fingerprint asserted by
//!    the hidden oracle (a valid alpha-only formula must produce ZERO
//!    `beta-expand` steps).
//! 3. A branch closes on a `T a` / `F a` clash; a saturated branch with no
//!    clash is open and yields a countermodel.
//! 4. `φ` is valid iff every branch closes.
//!
//! Caps: formula ≤ 64 AST nodes, ≤ 256 rule expansions (refusal, not silent
//! truncation).
//!
//! Signed-rule table (Smullyan's α/β classification):
//!   α: T(A&B)→{TA,TB}   F(A|B)→{FA,FB}   F(A->B)→{TA,FB}   T(!A)→{FA}   F(!A)→{TA}
//!   β: F(A&B)→{FA|FB}   T(A|B)→{TA|TB}   T(A->B)→{FA|TB}

use crate::breeds::support::breed_class::VerifierBreed;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::support::formula::Formula;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

/// Smullyan signed-tableau propositional validity prover.
pub struct Tableaux;

const MAX_NODES: usize = 64;
const MAX_EXPANSIONS: usize = 256;

/// Signed formula: (sign, formula). `true` = T, `false` = F.
type Signed = (bool, Formula);

/// One open tableau branch: pending signed formulas + literal valuation so far.
#[derive(Clone)]
struct Branch {
    todo: Vec<Signed>,
    lits: BTreeMap<String, bool>,
}

fn is_propositional(f: &Formula) -> bool {
    match f {
        Formula::True | Formula::False | Formula::Atom(_) => true,
        Formula::Not(a) => is_propositional(a),
        Formula::And(a, b) | Formula::Or(a, b) | Formula::Implies(a, b) => {
            is_propositional(a) && is_propositional(b)
        }
        _ => false,
    }
}

fn collect_atoms(f: &Formula, out: &mut std::collections::BTreeSet<String>) {
    match f {
        Formula::Atom(s) => {
            out.insert(s.clone());
        }
        Formula::Not(a) => collect_atoms(a, out),
        Formula::And(a, b) | Formula::Or(a, b) | Formula::Implies(a, b) => {
            collect_atoms(a, out);
            collect_atoms(b, out);
        }
        _ => {}
    }
}

/// Rule classification for a signed compound formula.
enum RuleKind {
    /// Non-branching: all components added to the same branch.
    Alpha(Vec<Signed>),
    /// Branching: each component opens its own branch.
    Beta(Vec<Signed>),
    /// Constant that immediately closes the branch (T false / F true).
    CloseConst,
    /// Constant that is trivially satisfied (T true / F false): discard.
    Discard,
    /// Literal: signed atom.
    Literal(String, bool),
}

fn classify(sf: &Signed) -> RuleKind {
    let (sign, f) = sf;
    match (sign, f) {
        (true, Formula::True) | (false, Formula::False) => RuleKind::Discard,
        (true, Formula::False) | (false, Formula::True) => RuleKind::CloseConst,
        (s, Formula::Atom(a)) => RuleKind::Literal(a.clone(), *s),
        (true, Formula::Not(a)) => RuleKind::Alpha(vec![(false, (**a).clone())]),
        (false, Formula::Not(a)) => RuleKind::Alpha(vec![(true, (**a).clone())]),
        (true, Formula::And(a, b)) => {
            RuleKind::Alpha(vec![(true, (**a).clone()), (true, (**b).clone())])
        }
        (false, Formula::Or(a, b)) => {
            RuleKind::Alpha(vec![(false, (**a).clone()), (false, (**b).clone())])
        }
        (false, Formula::Implies(a, b)) => {
            RuleKind::Alpha(vec![(true, (**a).clone()), (false, (**b).clone())])
        }
        (false, Formula::And(a, b)) => {
            RuleKind::Beta(vec![(false, (**a).clone()), (false, (**b).clone())])
        }
        (true, Formula::Or(a, b)) => {
            RuleKind::Beta(vec![(true, (**a).clone()), (true, (**b).clone())])
        }
        (true, Formula::Implies(a, b)) => {
            RuleKind::Beta(vec![(false, (**a).clone()), (true, (**b).clone())])
        }
        // Non-propositional operators are refused in preconditions; unreachable here.
        _ => RuleKind::Discard,
    }
}

fn sf_str(sf: &Signed) -> String {
    format!("{} {}", if sf.0 { "T" } else { "F" }, sf.1)
}

impl Tableaux {
    fn goal_formula(input: &BreedInput) -> Option<&str> {
        input
            .facts
            .iter()
            .find(|f| f.key == "tableaux:formula")
            .map(|f| f.value.as_str())
    }
}

impl VerifierBreed for Tableaux {
    fn valid_verdicts(&self) -> &'static [&'static str] {
        &["valid", "invalid"]
    }
}

impl CognitionBreed for Tableaux {
    fn id(&self) -> BreedId {
        BreedId::Tableaux
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "propositional_validity".to_string(),
            "signed_tableau".to_string(),
            "countermodel_extraction".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let src = Self::goal_formula(input)
            .ok_or_else(|| "tableaux requires a 'tableaux:formula' fact".to_string())?;
        if src.len() > 256 {
            return Err("formula exceeds 256 characters".to_string());
        }
        let f = Formula::parse(src).map_err(|e| format!("formula parse error: {}", e))?;
        if !is_propositional(&f) {
            return Err(
                "tableaux handles the propositional fragment only (no temporal/CTL operators)"
                    .to_string(),
            );
        }
        if f.size() > MAX_NODES {
            return Err(format!("formula exceeds {} AST nodes", MAX_NODES));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::Tableaux,
            message: m,
        };
        let src = Self::goal_formula(input)
            .ok_or_else(|| err("missing 'tableaux:formula' fact".to_string()))?;
        let formula = Formula::parse(src).map_err(|e| err(format!("parse error: {}", e)))?;
        if !is_propositional(&formula) || formula.size() > MAX_NODES {
            return Err(err("formula refused by structural caps".to_string()));
        }

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, depth: u32, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
        };
        push("parse-formula", format!("{}", formula), 0, &mut trace);
        push(
            "sign-root",
            format!("F {}", formula),
            0,
            &mut trace,
        );

        let mut atoms = std::collections::BTreeSet::new();
        collect_atoms(&formula, &mut atoms);

        // DFS over branches; root signed F φ.
        let mut stack: Vec<(Branch, u32)> = vec![(
            Branch {
                todo: vec![(false, formula.clone())],
                lits: BTreeMap::new(),
            },
            0,
        )];
        let mut expansions = 0usize;
        let mut countermodel: Option<BTreeMap<String, bool>> = None;

        'branches: while let Some((mut br, depth)) = stack.pop() {
            loop {
                if expansions > MAX_EXPANSIONS {
                    return Err(err(format!(
                        "expansion cap {} exceeded — formula refused",
                        MAX_EXPANSIONS
                    )));
                }
                // 1. Consume literals and constants first.
                let mut i = 0;
                let mut closed = false;
                while i < br.todo.len() {
                    match classify(&br.todo[i]) {
                        RuleKind::Literal(a, s) => {
                            let sf = br.todo.remove(i);
                            if let Some(&prev) = br.lits.get(&a) {
                                if prev != s {
                                    push(
                                        "close-branch",
                                        format!("clash on '{}' ({})", a, sf_str(&sf)),
                                        depth,
                                        &mut trace,
                                    );
                                    closed = true;
                                    break;
                                }
                            } else {
                                br.lits.insert(a, s);
                            }
                        }
                        RuleKind::Discard => {
                            br.todo.remove(i);
                        }
                        RuleKind::CloseConst => {
                            let sf = br.todo.remove(i);
                            push(
                                "close-branch",
                                format!("constant clash ({})", sf_str(&sf)),
                                depth,
                                &mut trace,
                            );
                            closed = true;
                            break;
                        }
                        _ => i += 1,
                    }
                }
                if closed {
                    continue 'branches;
                }
                // 2. Alpha-first: find first alpha formula.
                let alpha_idx = br
                    .todo
                    .iter()
                    .position(|sf| matches!(classify(sf), RuleKind::Alpha(_)));
                if let Some(idx) = alpha_idx {
                    let sf = br.todo.remove(idx);
                    if let RuleKind::Alpha(parts) = classify(&sf) {
                        expansions += 1;
                        push(
                            "alpha-expand",
                            format!(
                                "{} => {}",
                                sf_str(&sf),
                                parts.iter().map(sf_str).collect::<Vec<_>>().join(", ")
                            ),
                            depth,
                            &mut trace,
                        );
                        br.todo.extend(parts);
                    }
                    continue;
                }
                // 3. Beta: branch on the first beta formula.
                let beta_idx = br
                    .todo
                    .iter()
                    .position(|sf| matches!(classify(sf), RuleKind::Beta(_)));
                if let Some(idx) = beta_idx {
                    let sf = br.todo.remove(idx);
                    if let RuleKind::Beta(parts) = classify(&sf) {
                        expansions += 1;
                        push(
                            "beta-expand",
                            format!(
                                "{} => {}",
                                sf_str(&sf),
                                parts.iter().map(sf_str).collect::<Vec<_>>().join(" | ")
                            ),
                            depth,
                            &mut trace,
                        );
                        // Right branch deferred (deterministic order: left first).
                        let mut right = br.clone();
                        right.todo.push(parts[1].clone());
                        stack.push((right, depth + 1));
                        br.todo.push(parts[0].clone());
                    }
                    continue;
                }
                // 4. Saturated, no clash: open branch — countermodel found.
                let model: BTreeMap<String, bool> = atoms
                    .iter()
                    .map(|a| (a.clone(), br.lits.get(a).copied().unwrap_or(false)))
                    .collect();
                push(
                    "open-branch",
                    format!(
                        "countermodel: {}",
                        model
                            .iter()
                            .map(|(k, v)| format!("{}={}", k, v))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    depth,
                    &mut trace,
                );
                countermodel = Some(model);
                break 'branches;
            }
        }

        let valid = countermodel.is_none();
        push(
            "verdict",
            if valid {
                "valid (all branches closed)".to_string()
            } else {
                "invalid (open saturated branch)".to_string()
            },
            0,
            &mut trace,
        );

        let mut facts = vec![Fact {
            key: "tableaux:verdict".to_string(),
            value: if valid { "valid" } else { "invalid" }.to_string(),
        }];
        if let Some(model) = &countermodel {
            for (a, v) in model {
                facts.push(Fact {
                    key: format!("tableaux:countermodel:{}", a),
                    value: v.to_string(),
                });
            }
        }

        let explanation = format!(
            "Tableaux on '{}': {} ({} expansions)",
            formula,
            if valid { "VALID" } else { "INVALID" },
            expansions
        );

        Ok(BreedOutput {
            breed: BreedId::Tableaux,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(if valid { "valid" } else { "invalid" }.to_string()),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_verdict_valid(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["verdict"])?;
        if !output
            .facts
            .iter()
            .any(|f| f.key == "tableaux:verdict")
        {
            return Err("missing tableaux:verdict fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(formula: &str) -> BreedInput {
        BreedInput {
            intent: "prove".into(),
            candidates: vec![],
            facts: vec![Fact {
                key: "tableaux:formula".into(),
                value: formula.into(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn k_axiom_valid_zero_beta() {
        // Smullyan K-axiom: A -> (B -> A) is valid via a single alpha-only branch.
        let out = Tableaux.run(&input("a -> (b -> a)")).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("valid"));
        assert_eq!(
            out.inference_trace
                .iter()
                .filter(|t| t.kind == "beta-expand")
                .count(),
            0,
            "K-axiom proof must be alpha-only"
        );
        assert!(out.inference_trace.iter().any(|t| t.kind == "close-branch"));
    }

    #[test]
    fn a_implies_b_invalid_with_countermodel() {
        let out = Tableaux.run(&input("a -> b")).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("invalid"));
        let cm_a = out
            .facts
            .iter()
            .find(|f| f.key == "tableaux:countermodel:a")
            .expect("a in countermodel");
        let cm_b = out
            .facts
            .iter()
            .find(|f| f.key == "tableaux:countermodel:b")
            .expect("b in countermodel");
        assert_eq!(cm_a.value, "true");
        assert_eq!(cm_b.value, "false");
    }

    #[test]
    fn excluded_middle_valid() {
        let out = Tableaux.run(&input("a | !a")).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("valid"));
    }

    #[test]
    fn pierce_law_valid_uses_beta() {
        // ((a -> b) -> a) -> a is valid and requires beta branching.
        let out = Tableaux.run(&input("((a -> b) -> a) -> a")).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("valid"));
        assert!(
            out.inference_trace.iter().any(|t| t.kind == "beta-expand"),
            "Peirce's law requires branching"
        );
    }

    #[test]
    fn refuses_temporal_operators() {
        assert!(Tableaux.preconditions(&input("G a")).is_err());
    }

    #[test]
    fn refuses_missing_formula() {
        let mut inp = input("a");
        inp.facts.clear();
        assert!(Tableaux.preconditions(&inp).is_err());
    }
}
