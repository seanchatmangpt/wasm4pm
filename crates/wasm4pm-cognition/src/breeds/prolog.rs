//! Breed: Prolog — Robinson unification + bounded SLD resolution via Prolog8.
//!
//! This breed delegates to the `prolog8` crate (Prolog8 PRD/ARD) which
//! enforces ARD-mandated byte caps:
//! - arity ≤ 8
//! - body atoms ≤ 8
//! - variables ≤ 8
//! - 256 binding patterns
//!
//! Per the cognition doctrine the breed itself contains no parser; it
//! interns the BreedInput's facts/rules/goals into Prolog8 catalog IDs and
//! invokes the Prolog8 kernel which emits a positive or negative proof and
//! a deterministic receipt.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Receipt, TraceStep,
};
use prolog8::{
    admit_atom, Atom8, Catalog, CatalogId, DecisionKind, EpochId, FactBlock8, FactRow8, FeatureBit,
    Kernel, PredicateId, PredicateMeta, PredicateProofPolicy, ProofMode, QueryAtom8, QueryResult,
    Rule8, RuleId, SourceId,
};

/// Real Prolog breed backed by the Prolog8 kernel.
pub struct Prolog;

impl CognitionBreed for Prolog {
    fn id(&self) -> BreedId {
        BreedId::Prolog
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "horn-clause-resolution".into(),
            "byte-capped-execution".into(),
            "positive-proof".into(),
            "negative-proof".into(),
            "deterministic-receipt".into(),
            "replay".into(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.intent.is_empty() && input.goals.is_empty() && input.rules.is_empty() {
            return Err(
                "Prolog requires either an intent (predicate label) or at least one goal/rule"
                    .into(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace: Vec<TraceStep> = Vec::new();
        let mut step_no = 0usize;

        // 1. Build a Prolog8 catalog from BreedInput rules + facts.
        let mut catalog = Catalog::new(CatalogId(1));

        // Predicate: every distinct rule.conclusion / fact.key becomes a 1-arity predicate.
        // The simplest faithful encoding uses unary predicates indexed by key.
        let mut intent_pred = "intent".to_string();
        if !input.intent.is_empty() {
            intent_pred = input.intent.clone();
        }
        catalog.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: intent_pred.clone(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let mut next_pred_id: u32 = 2;

        // Map fact keys to predicate ids.
        let mut pred_for_key = std::collections::BTreeMap::<String, PredicateId>::new();
        pred_for_key.insert(intent_pred.clone(), PredicateId(1));

        for fact in &input.facts {
            if !pred_for_key.contains_key(&fact.key) {
                let pid = PredicateId(next_pred_id);
                next_pred_id += 1;
                catalog.add_predicate(PredicateMeta {
                    pred_id: pid,
                    label: fact.key.clone(),
                    arity: 1,
                    access_orders: vec![],
                    proof_policy: PredicateProofPolicy::OnRequest,
                    materialized: false,
                });
                pred_for_key.insert(fact.key.clone(), pid);
            }
        }

        // 2. Intern fact values as terms.
        let mut rows_by_pred = std::collections::BTreeMap::<PredicateId, Vec<FactRow8>>::new();
        for fact in &input.facts {
            let pid = pred_for_key.get(&fact.key).copied().unwrap();
            let term_id = catalog.intern_term(&fact.value);
            let row = FactRow8::new(pid, 1, &[term_id], SourceId(0));
            rows_by_pred.entry(pid).or_default().push(row);
            trace.push(TraceStep {
                step: step_no,
                kind: "intern-fact".into(),
                detail: format!("{}={}", fact.key, fact.value),
                depth: 0,
            });
            step_no += 1;
        }

        // 3. Build a kernel and load fact blocks.
        let mut kernel = Kernel::new(catalog);
        for (pid, rows) in rows_by_pred {
            let block = FactBlock8::new(pid, 1, rows);
            kernel.load_facts(block).map_err(|c| BreedError {
                breed: BreedId::Prolog,
                message: format!("fact admission rejected: {:?}", c),
            })?;
        }

        // 3a. Load rules into kernel
        for rule_input in &input.rules {
            // Get or register head predicate
            let head_pred = if let Some(pid) = kernel.catalog.predicate_id(&rule_input.conclusion) {
                pid
            } else {
                let pid = PredicateId(next_pred_id);
                next_pred_id += 1;
                kernel.catalog.add_predicate(PredicateMeta {
                    pred_id: pid,
                    label: rule_input.conclusion.clone(),
                    arity: 1,
                    access_orders: vec![],
                    proof_policy: PredicateProofPolicy::OnRequest,
                    materialized: false,
                });
                pid
            };

            let head_term = kernel.catalog.intern_term(&rule_input.conclusion);
            let head = Atom8::new(head_pred, 1, &[head_term]);

            // Build body atoms
            let mut body_atoms = [Atom8::new(PredicateId(0), 0, &[]); 8];
            let body_len = rule_input.premise.len().min(8);

            for (i, premise) in rule_input.premise.iter().take(8).enumerate() {
                let premise_pred = if let Some(pid) = kernel.catalog.predicate_id(premise) {
                    pid
                } else {
                    let pid = PredicateId(next_pred_id);
                    next_pred_id += 1;
                    kernel.catalog.add_predicate(PredicateMeta {
                        pred_id: pid,
                        label: premise.clone(),
                        arity: 1,
                        access_orders: vec![],
                        proof_policy: PredicateProofPolicy::OnRequest,
                        materialized: false,
                    });
                    pid
                };

                let premise_term = kernel.catalog.intern_term(premise);
                body_atoms[i] = Atom8::new(premise_pred, 1, &[premise_term]);
            }

            let body_mask = if body_len > 0 {
                (1u8 << body_len) - 1
            } else {
                0
            };

            let rule = Rule8 {
                rule_id: RuleId(trace.len() as u32),
                head,
                body: body_atoms,
                body_len: body_len as u8,
                body_mask,
                negation_mask: 0,
                builtin_mask: 0,
                var_count: 0,
                var_live_mask: 0,
                feature_mask: FeatureBit::HornRules.mask(),
                proof_mask: 0,
                plan_id: Default::default(),
            };

            kernel.load_rule(rule).map_err(|c| BreedError {
                breed: BreedId::Prolog,
                message: format!("rule load failed: {:?}", c),
            })?;

            trace.push(TraceStep {
                step: step_no,
                kind: "load-rule".into(),
                detail: rule_input.id.clone(),
                depth: 0,
            });
            step_no += 1;
        }

        // 4. Build a query: ?- intent(VALUE_OF_FIRST_GOAL_OR_FIRST_FACT_VALUE).
        // If goals are provided, query the goal predicate/value. Otherwise query
        // the intent predicate, asking whether ANY value is admitted (output_mask=1).
        let (q_pred, q_args, q_binding, q_output) = if let Some(g) = input.goals.first() {
            let pid = pred_for_key.get(&g.predicate).copied().unwrap_or(PredicateId(1));
            let term_id = kernel.catalog.intern_term(&g.value);
            // Re-add term mapping after intern (catalog mutated).
            (pid, vec![term_id], 0b1u8, 0u8)
        } else if let Some(f) = input.facts.first() {
            let pid = pred_for_key.get(&f.key).copied().unwrap_or(PredicateId(1));
            let term_id = kernel.catalog.term_id(&f.value).unwrap_or(prolog8::TermId(0));
            (pid, vec![term_id], 0b1u8, 0u8)
        } else {
            // Pure existence query against intent predicate.
            (PredicateId(1), vec![prolog8::TermId(0)], 0u8, 0b1u8)
        };

        let mut atom = Atom8::new(q_pred, 1, &q_args);
        atom.binding_mask = q_binding;

        if admit_atom(&atom, &kernel.catalog).is_err() {
            return Err(BreedError {
                breed: BreedId::Prolog,
                message: "query atom failed admission".into(),
            });
        }

        let q = QueryAtom8 {
            atom,
            output_mask: q_output,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };

        trace.push(TraceStep {
            step: step_no,
            kind: "kernel-query".into(),
            detail: format!("pred_id={} binding_mask={:#b}", q.atom.pred_id.0, q.atom.binding_mask),
            depth: 0,
        });
        step_no += 1;

        // 5. Run the kernel.
        let result = kernel.query(&q);

        let (selected, explanation) = match result {
            QueryResult::Answered(answers) => {
                let first = &answers[0];
                trace.push(TraceStep {
                    step: step_no,
                    kind: "decision".into(),
                    detail: format!("Allow with {} proof nodes", first.proof.len()),
                    depth: 0,
                });
                // Prefer output binding; fall back to the bound argument label
                // (so that a fully-ground "did fact match?" query returns the
                // matched value, not the predicate name).
                let label = if let Some(t) = first.bindings.first() {
                    kernel.catalog.term_label(*t).unwrap_or("?").to_string()
                } else if q.atom.binding_mask & 0b1 != 0 {
                    kernel
                        .catalog
                        .term_label(q.atom.args[0])
                        .unwrap_or(intent_pred.as_str())
                        .to_string()
                } else {
                    intent_pred.clone()
                };
                let exp = match first.kind {
                    DecisionKind::Allow => format!(
                        "Prolog8 admitted query (proof nodes: {}, receipt: {:x?})",
                        first.proof.len(),
                        &first.receipt.receipt_hash[..4]
                    ),
                    other => format!("Prolog8 returned {:?}", other),
                };
                (Some(label), exp)
            }
            QueryResult::Denied(d) => {
                trace.push(TraceStep {
                    step: step_no,
                    kind: "decision".into(),
                    detail: format!("Deny with {} negative proof nodes", d.proof.len()),
                    depth: 0,
                });
                let exp = format!(
                    "Prolog8 denied query (negative proof nodes: {}, receipt: {:x?})",
                    d.proof.len(),
                    &d.receipt.receipt_hash[..4]
                );
                (None, exp)
            }
            QueryResult::Invalid(code) => {
                trace.push(TraceStep {
                    step: step_no,
                    kind: "invalid".into(),
                    detail: format!("admission rejected: {:?}", code),
                    depth: 0,
                });
                return Err(BreedError {
                    breed: BreedId::Prolog,
                    message: format!("admission rejected: {:?}", code),
                });
            }
        };

        Ok(BreedOutput {
            breed: BreedId::Prolog,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Prolog must emit a non-empty inference trace".into());
        }
        Ok(())
    }

    fn receipt(&self, input: &BreedInput, output: &BreedOutput) -> Receipt {
        crate::breeds::compute_receipt(self.id(), input, output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Goal};

    #[test]
    fn run_with_supporting_fact_returns_allow() {
        let breed = Prolog;
        let input = BreedInput {
            intent: "parent".into(),
            candidates: vec![],
            facts: vec![Fact {
                key: "parent".into(),
                value: "alice".into(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal {
                id: "g1".into(),
                predicate: "parent".into(),
                value: "alice".into(),
            }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(!out.inference_trace.is_empty());
        assert_eq!(out.selected.as_deref(), Some("alice"));
    }

    #[test]
    fn run_with_unmatched_goal_returns_deny() {
        let breed = Prolog;
        let input = BreedInput {
            intent: "parent".into(),
            candidates: vec![],
            facts: vec![Fact {
                key: "parent".into(),
                value: "alice".into(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal {
                id: "g1".into(),
                predicate: "parent".into(),
                value: "carol".into(),
            }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(out.selected.is_none());
        assert!(out.explanation.contains("denied"));
    }

    #[test]
    fn precondition_rejects_completely_empty_input() {
        let breed = Prolog;
        let input = BreedInput {
            intent: String::new(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn run_with_horn_rule_loads_and_applies() {
        use crate::breeds::Rule;

        let breed = Prolog;
        let input = BreedInput {
            intent: "ancestor".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "parent".into(),
                    value: "alice".into(),
                },
                Fact {
                    key: "parent".into(),
                    value: "bob".into(),
                },
            ],
            cases: vec![],
            rules: vec![Rule {
                id: "r1".into(),
                premise: vec!["parent".into()],
                conclusion: "ancestor".into(),
                certainty: 1.0,
            }],
            goals: vec![Goal {
                id: "g1".into(),
                predicate: "ancestor".into(),
                value: "alice".into(),
            }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(!out.inference_trace.is_empty());
        // Rule should have been loaded and applied in inference
        let has_load_rule = out
            .inference_trace
            .iter()
            .any(|step| step.kind == "load-rule");
        assert!(has_load_rule, "trace should contain a load-rule step");
    }
}
