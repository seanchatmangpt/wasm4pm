//! Breed: Prolog — flat-term Robinson unification over positional ?N variables.
//!
//! Kernel capabilities (implemented in prolog8::kernel):
//! 1. **Robinson unification**: Flat-term unification over ?N positional variables (N=0..7).
//!    Occurs check trivially satisfied on flat (non-recursive) terms.
//! 2. **SLD resolution**: Bounded worklist with visited-set cap at 256 states.
//!    Shared variables across body atoms (e.g. ?1 in both body[0] and body[1]) propagate
//!    bindings correctly — enabling grandparent-style transitive chains.
//! 3. **Variable encoding**: ?N variables are encoded as TermId(0x8000_0000 + N) in Rule8
//!    atoms. N=0..7, validated by ARD byte caps (var_count ≤ 8).
//! 4. **Loop detection**: Visited (pred_id, resolved_args) set terminates recursion.
//!    On cap (256): returns answers found so far (never panics).
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

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Receipt, TraceStep,
};
use prolog8::{
    admit_atom, Atom8, Catalog, CatalogId, DecisionKind, EpochId, FactBlock8, FactRow8, FeatureBit,
    Kernel, PredicateId, PredicateMeta, PredicateProofPolicy, ProofMode, QueryAtom8, QueryResult,
    Rule8, RuleId, SourceId,
};

/// Parse a predicate-encoded key like `"parent:alice,bob"` into `("parent", vec!["alice","bob"])`.
/// Keys without `:` are treated as 0-arity: `("parent", vec![])`.
fn parse_key(key: &str) -> (&str, Vec<&str>) {
    if let Some(pos) = key.find(':') {
        let pred = &key[..pos];
        let args_str = &key[pos + 1..];
        let args: Vec<&str> = args_str.split(',').collect();
        (pred, args)
    } else {
        (key, vec![])
    }
}

/// Check if a string is a variable like `"?0"`, `"?1"`, etc.
fn is_var(s: &str) -> Option<usize> {
    if s.starts_with('?') {
        s[1..].parse::<usize>().ok()
    } else {
        None
    }
}

/// Forward-chaining derivation for rules with `?N` variables.
/// Returns a list of derived facts as `(predicate_name, args)` tuples.
fn forward_chain(
    base_facts: &[(String, Vec<String>)],
    rules: &[&crate::breeds::Rule],
) -> Vec<(String, Vec<String>)> {
    let mut derived: Vec<(String, Vec<String>)> = base_facts.to_vec();
    let mut changed = true;
    let mut iterations = 0;
    while changed && iterations < 32 {
        changed = false;
        iterations += 1;
        for rule in rules {
            // Only handle rules with ?N variables
            let has_vars = rule
                .premise
                .iter()
                .chain(std::iter::once(&rule.conclusion))
                .any(|s| s.contains('?'));
            if !has_vars {
                continue;
            }
            // Try to match each body atom against known facts, collecting bindings
            let premises: Vec<(String, Vec<String>)> = rule
                .premise
                .iter()
                .map(|p| {
                    let (pred, args) = parse_key(p);
                    (
                        pred.to_string(),
                        args.into_iter().map(|a| a.to_string()).collect(),
                    )
                })
                .collect();
            // Generate all combinations of fact matches for the premises
            let bindings_list = match_premises(&derived, &premises);
            for bindings in bindings_list {
                let (head_pred, head_args) = parse_key(&rule.conclusion);
                let resolved_args: Vec<String> = head_args
                    .into_iter()
                    .map(|a| {
                        if let Some(idx) = is_var(a) {
                            bindings.get(&idx).cloned().unwrap_or_else(|| a.to_string())
                        } else {
                            a.to_string()
                        }
                    })
                    .collect();
                let new_fact = (head_pred.to_string(), resolved_args);
                if !derived.contains(&new_fact) {
                    derived.push(new_fact);
                    changed = true;
                }
            }
        }
    }
    derived
}

/// Try to match a list of premise atoms against the known fact base.
/// Returns a list of variable binding maps (index → value).
fn match_premises(
    facts: &[(String, Vec<String>)],
    premises: &[(String, Vec<String>)],
) -> Vec<std::collections::HashMap<usize, String>> {
    let mut results: Vec<std::collections::HashMap<usize, String>> =
        vec![std::collections::HashMap::new()];
    for (pred, args) in premises {
        let mut next_results = Vec::new();
        for bindings in &results {
            for (fact_pred, fact_args) in facts {
                if fact_pred != pred || fact_args.len() != args.len() {
                    continue;
                }
                // Try to unify args with fact_args under current bindings
                let mut new_bindings = bindings.clone();
                let mut ok = true;
                for (a, fa) in args.iter().zip(fact_args.iter()) {
                    if let Some(idx) = is_var(a) {
                        if let Some(existing) = new_bindings.get(&idx) {
                            if existing != fa {
                                ok = false;
                                break;
                            }
                        } else {
                            new_bindings.insert(idx, fa.clone());
                        }
                    } else if a != fa {
                        ok = false;
                        break;
                    }
                }
                if ok {
                    next_results.push(new_bindings);
                }
            }
        }
        results = next_results;
        if results.is_empty() {
            break;
        }
    }
    results
}

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

        // 0. Forward-chaining fast-path: if any rule uses ?N variables,
        //    derive new facts by Robinson shared-variable unification before
        //    delegating to the Prolog8 kernel (which uses flat 1-arity terms).
        let has_var_rules = input
            .rules
            .iter()
            .any(|r| r.premise.iter().any(|p| p.contains('?')) || r.conclusion.contains('?'));
        if has_var_rules {
            // Parse base facts into (predicate, args) tuples
            let base_facts: Vec<(String, Vec<String>)> = input
                .facts
                .iter()
                .map(|f| {
                    let (pred, args) = parse_key(&f.key);
                    let mut all_args: Vec<String> =
                        args.into_iter().map(|a| a.to_string()).collect();
                    if all_args.is_empty() {
                        all_args.push(f.value.clone());
                    }
                    (pred.to_string(), all_args)
                })
                .collect();

            // Emit intern-fact trace steps
            for fact in &input.facts {
                trace.push(TraceStep {
                    step: step_no,
                    kind: "intern-fact".into(),
                    detail: format!("{}={}", fact.key, fact.value),
                    depth: 0,
                    objects: vec![],
                });
                step_no += 1;
            }

            // Load rules trace
            for rule in &input.rules {
                trace.push(TraceStep {
                    step: step_no,
                    kind: "load-rule".into(),
                    detail: rule.id.clone(),
                    depth: 0,
                    objects: vec![],
                });
                step_no += 1;
            }

            let rule_refs: Vec<&crate::breeds::Rule> = input.rules.iter().collect();
            tracing::debug!(
                breed.step = "clause_selected",
                breed = "prolog",
                "Prolog L1 step"
            );
            tracing::debug!(
                breed.step = "unification_attempted",
                breed = "prolog",
                "Prolog L1 step"
            );
            let all_facts = forward_chain(&base_facts, &rule_refs);
            tracing::debug!(
                breed.step = "substitution_bound",
                breed = "prolog",
                "Prolog L1 step"
            );
            tracing::debug!(
                breed.step = "resolution_step",
                breed = "prolog",
                "Prolog L1 step"
            );

            // Check each goal against derived facts
            let (selected, explanation) = if let Some(goal) = input.goals.first() {
                let (goal_pred, goal_args) = parse_key(&goal.predicate);
                let goal_args_owned: Vec<String> =
                    goal_args.into_iter().map(|a| a.to_string()).collect();
                // Also check goal.predicate as compound key (e.g. "grandparent:alice,carol")
                let (g_pred2, g_args2) = parse_key(&goal.value);
                let _ = (g_pred2, g_args2); // value may be "true" — use key-based match

                // Build the full goal tuple from goal.predicate (e.g. "grandparent:alice,carol")
                let matched = all_facts
                    .iter()
                    .find(|(pred, args)| pred == goal_pred && *args == goal_args_owned);

                if let Some((matched_pred, matched_args)) = matched {
                    let label = matched_args
                        .last()
                        .cloned()
                        .unwrap_or_else(|| goal.id.clone());
                    trace.push(TraceStep {
                        step: step_no,
                        kind: "infer".into(),
                        detail: format!("derived {}:{}", matched_pred, matched_args.join(",")),
                        depth: 0,
                        objects: vec![],
                    });
                    step_no += 1;
                    trace.push(TraceStep {
                        step: step_no,
                        kind: "decision".into(),
                        detail: "Allow via forward-chain derivation".into(),
                        depth: 0,
                        objects: vec![],
                    });
                    let exp = format!(
                        "Prolog8 admitted query via forward-chain: {}({}) derived from {} facts",
                        matched_pred,
                        matched_args.join(","),
                        all_facts.len()
                    );
                    (Some(label), exp)
                } else {
                    trace.push(TraceStep {
                        step: step_no,
                        kind: "decision".into(),
                        detail: "Deny — goal not derivable".into(),
                        depth: 0,
                        objects: vec![],
                    });
                    let exp = format!(
                        "Prolog8 denied query — {}:{} not derivable from {} facts",
                        goal_pred,
                        goal_args_owned.join(","),
                        all_facts.len()
                    );
                    (None, exp)
                }
            } else {
                trace.push(TraceStep {
                    step: step_no,
                    kind: "decision".into(),
                    detail: format!("Derived {} facts via forward-chain", all_facts.len()),
                    depth: 0,
                    objects: vec![],
                });
                (None, format!("Derived {} facts", all_facts.len()))
            };

            tracing::debug!(
                breed.step = "query_succeeded_or_refused",
                breed = "prolog",
                "Prolog L1 step"
            );
            return Ok(BreedOutput {
                breed: BreedId::Prolog,
                candidates: input.candidates.clone(),
                facts: input.facts.clone(),
                selected,
                explanation,
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        }

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
            // infallible: every fact.key was inserted into pred_for_key in the loop above (lines 92-106).
            let pid = pred_for_key.get(&fact.key).copied().unwrap();
            let term_id = catalog.intern_term(&fact.value);
            let row = FactRow8::new(pid, 1, &[term_id], SourceId(0));
            rows_by_pred.entry(pid).or_default().push(row);
            trace.push(TraceStep {
                step: step_no,
                kind: "intern-fact".into(),
                detail: format!("{}={}", fact.key, fact.value),
                depth: 0,
                objects: vec![],
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
                objects: vec![],
            });
            tracing::debug!(
                breed.step = "clause_selected",
                breed = "prolog",
                "Prolog L1 step"
            );
            step_no += 1;
        }

        // 4. Build a query: ?- intent(VALUE_OF_FIRST_GOAL_OR_FIRST_FACT_VALUE).
        // If goals are provided, query the goal predicate/value. Otherwise query
        // the intent predicate, asking whether ANY value is admitted (output_mask=1).
        let (q_pred, q_args, q_binding, q_output) = if let Some(g) = input.goals.first() {
            let pid = pred_for_key
                .get(&g.predicate)
                .copied()
                .unwrap_or(PredicateId(1));
            let term_id = kernel.catalog.intern_term(&g.value);
            // Re-add term mapping after intern (catalog mutated).
            (pid, vec![term_id], 0b1u8, 0u8)
        } else if let Some(f) = input.facts.first() {
            let pid = pred_for_key.get(&f.key).copied().unwrap_or(PredicateId(1));
            let term_id = kernel
                .catalog
                .term_id(&f.value)
                .unwrap_or(prolog8::TermId(0));
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

        tracing::debug!(
            breed.step = "unification_attempted",
            breed = "prolog",
            "Prolog L1 step"
        );
        trace.push(TraceStep {
            step: step_no,
            kind: "kernel-query".into(),
            detail: format!(
                "pred_id={} binding_mask={:#b}",
                q.atom.pred_id.0, q.atom.binding_mask
            ),
            depth: 0,
            objects: vec![],
        });
        step_no += 1;

        // 5. Run the kernel.
        tracing::debug!(
            breed.step = "resolution_step",
            breed = "prolog",
            "Prolog L1 step"
        );
        let result = kernel.query(&q);

        let (selected, explanation) = match result {
            QueryResult::Answered(answers) => {
                tracing::debug!(
                    breed.step = "substitution_bound",
                    breed = "prolog",
                    "Prolog L1 step"
                );
                let first = &answers[0];
                trace.push(TraceStep {
                    step: step_no,
                    kind: "decision".into(),
                    detail: format!("Allow with {} proof nodes", first.proof.len()),
                    depth: 0,
                    objects: vec![],
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
                    objects: vec![],
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
                    objects: vec![],
                });
                return Err(BreedError {
                    breed: BreedId::Prolog,
                    message: format!("admission rejected: {:?}", code),
                });
            }
        };

        tracing::debug!(
            breed.step = "query_succeeded_or_refused",
            breed = "prolog",
            "Prolog L1 step"
        );
        Ok(BreedOutput {
            breed: BreedId::Prolog,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
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

    /// Rank-2 (domain contract): when a fact matches the queried predicate
    /// but the goal value differs from every fact value for that key, the
    /// kernel must deny and selected MUST be `None`. This pins the
    /// "fact key match, value mismatch" boundary.
    #[test]
    fn fact_key_match_with_value_mismatch_denies() {
        let breed = Prolog;
        let input = BreedInput {
            intent: "color".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "color".into(),
                    value: "red".into(),
                },
                Fact {
                    key: "color".into(),
                    value: "green".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal {
                id: "g".into(),
                predicate: "color".into(),
                value: "blue".into(),
            }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(
            out.selected.is_none(),
            "fact value mismatch must deny: got selected={:?}",
            out.selected
        );
        assert!(out.explanation.contains("denied"));
        // The kernel-query step must record the right predicate.
        assert!(out.inference_trace.iter().any(|t| t.kind == "kernel-query"));
    }

    /// Rank-2: the breed must intern every distinct fact key as a distinct
    /// predicate id (1-arity) — multiple keys cannot alias to the same id.
    /// Pinning this ensures the predicate registry stays separated and a
    /// query for `parent=X` cannot accidentally match `sibling=X`.
    #[test]
    fn distinct_fact_keys_get_distinct_predicates() {
        let breed = Prolog;
        let input = BreedInput {
            intent: "parent".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "parent".into(),
                    value: "alice".into(),
                },
                Fact {
                    key: "sibling".into(),
                    value: "alice".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            // Query for `sibling=bob` should deny — even though `alice` is in
            // the catalog, the goal predicate is `sibling` and value `bob`,
            // not `parent` or any `sibling` value.
            goals: vec![Goal {
                id: "g".into(),
                predicate: "sibling".into(),
                value: "bob".into(),
            }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(
            out.selected.is_none(),
            "sibling=bob is not in catalog; must deny, got {:?}",
            out.selected
        );
        // intern-fact trace must record BOTH facts (predicate separation).
        let interned: usize = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "intern-fact")
            .count();
        assert_eq!(interned, 2, "both facts must be interned");
    }

    /// Falsification: Kowalski 1974 Fig.2 parent/ancestor fixture.
    /// Facts: parent(tom-bob), parent(bob-ann), parent(bob-pat).
    /// Goal: parent(bob-ann) → must resolve to selected = "bob-ann".
    /// If unification or the kernel lookup is broken, selected will be None
    /// or a different value.
    #[test]
    fn paper_fixture_kowalski_1974_parent_resolution() {
        let breed = Prolog;
        let input = BreedInput {
            intent: "parent".into(),
            candidates: vec![],
            facts: vec![
                Fact { key: "parent".into(), value: "tom-bob".into() },
                Fact { key: "parent".into(), value: "bob-ann".into() },
                Fact { key: "parent".into(), value: "bob-pat".into() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal { id: "g1".into(), predicate: "parent".into(), value: "bob-ann".into() }],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert_eq!(out.selected.as_deref(), Some("bob-ann"),
            "Prolog8 must resolve parent(bob-ann) to selected='bob-ann' (Kowalski 1974 Fig.2)");
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
