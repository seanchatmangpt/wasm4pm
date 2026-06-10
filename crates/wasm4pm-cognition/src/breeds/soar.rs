//! SOAR-style preference-based operator selection with impasse detection
//! and bounded subgoaling (Laird 1987).
//!
//! Encoding:
//! - Candidates are the operator population (`input.candidates`).
//! - Preferences are encoded in `input.facts` with `key == "pref"`:
//!   * `value = "best:<id>"`     — best preference for `<id>`
//!   * `value = "worst:<id>"`    — worst preference for `<id>`
//!   * `value = "require:<id>"`  — require `<id>` (vetoes others)
//!   * `value = "prohibit:<id>"` — prohibit `<id>`
//!   * `value = "better:<a>:<b>"` — `<a>` strictly better than `<b>`
//!
//! Subgoaling rules in `input.rules`:
//!   - Premise `["impasse:tie"]`       + conclusion `"pref:better:<a>:<b>"` → injects tie-resolution preference
//!   - Premise `["impasse:no-change"]` + conclusion `"pref:better:<a>:<b>"` → injects no-change preference
//!
//! Algorithm:
//! 1. Eliminate prohibited candidates.
//! 2. If a `require` exists, restrict to that single candidate.
//! 3. Apply `better:` constraints transitively; eliminate dominated candidates.
//! 4. Among survivors, prefer `best`-tagged candidates over `worst`.
//! 5. If exactly one remains, select it. Otherwise, declare an impasse:
//!    a. On tie:       look for `impasse:tie` rules, inject prefs, re-run (depth <= 2).
//!    b. If still unresolved after depth cap, fall back to score+lex with trace "impasse-unresolved-fallback".
//! 6. Emit a `chunk.pref` output fact recording winning operator and reason.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, Fact, Rule, TraceStep,
};
use std::collections::HashSet;
use tracing;

/// SOAR breed.
pub struct Soar;

#[derive(Debug, Default)]
struct Prefs {
    best: HashSet<String>,
    worst: HashSet<String>,
    require: HashSet<String>,
    prohibit: HashSet<String>,
    /// (better, worse)
    better: Vec<(String, String)>,
}

/// Collect `pref:better:a:b` conclusions from rules whose premise contains
/// the given impasse kind (e.g. `"impasse:tie"`).
fn collect_subgoal_prefs(rules: &[Rule], impasse_kind: &str) -> Vec<Fact> {
    rules
        .iter()
        .filter(|r| r.premise.iter().any(|p| p == impasse_kind))
        .filter(|r| r.conclusion.starts_with("pref:better:"))
        .map(|r| Fact {
            key: "pref".to_string(),
            value: r.conclusion["pref:".len()..].to_string(),
        })
        .collect()
}

fn parse_prefs_from_facts(facts: &[Fact]) -> Prefs {
    let mut p = Prefs::default();
    for f in facts {
        if f.key != "pref" {
            continue;
        }
        let v = &f.value;
        if let Some(rest) = v.strip_prefix("best:") {
            p.best.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("worst:") {
            p.worst.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("require:") {
            p.require.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("prohibit:") {
            p.prohibit.insert(rest.to_string());
        } else if let Some(rest) = v.strip_prefix("better:") {
            // Use split (not splitn) so malformed "better:a:b:c" yields 3 parts
            // and is rejected rather than silently parsed as ("a", "b:c").
            // Candidate IDs are encoded without colons, so any extra colon is
            // a malformed preference declaration. (Deferred from PR #69.)
            let parts: Vec<&str> = rest.split(':').collect();
            if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                p.better.push((parts[0].to_string(), parts[1].to_string()));
            }
        }
    }
    p
}

fn parse_prefs(input: &BreedInput) -> Prefs {
    parse_prefs_from_facts(&input.facts)
}

/// Apply better-than dominance (transitive closure with cycle defence) to `candidates`.
fn apply_better_dominance(
    candidates: &mut Vec<Candidate>,
    better_pairs: &[(String, String)],
    trace: &mut Vec<TraceStep>,
    depth: u32,
) {
    let max_iters = better_pairs.len() * candidates.len() + 1;
    let mut iters = 0;
    loop {
        iters += 1;
        if iters > max_iters {
            break;
        }
        let alive_snapshot: HashSet<String> = candidates
            .iter()
            .filter(|c| !c.eliminated)
            .map(|c| c.id.clone())
            .collect();
        let mut changed = false;
        for (better, worse) in better_pairs {
            if !alive_snapshot.contains(better.as_str()) {
                continue;
            }
            if !alive_snapshot.contains(worse.as_str()) {
                continue;
            }
            for c in candidates.iter_mut() {
                if &c.id == worse && !c.eliminated {
                    c.eliminated = true;
                    c.elimination_reason = Some(format!("dominated by {}", better));
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "dominate".to_string(),
                        detail: format!("{} > {}", better, worse),
                        depth,
                        objects: vec![],
                    });
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
}

/// Score+lex fallback: highest score; on tie, reverse-lexicographic id.
fn score_lex_pick(candidates: &[Candidate], surviving_ids: &[String]) -> Option<String> {
    candidates
        .iter()
        .filter(|c| surviving_ids.contains(&c.id))
        .max_by(|a, b| {
            a.score
                .partial_cmp(&b.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.id.cmp(&a.id))
        })
        .map(|c| c.id.clone())
}

/// Attempt to resolve a tie impasse using subgoal rules (bounded by depth cap).
/// Returns `(winner_id, resolved_by_subgoal)`.
fn resolve_tie_with_subgoal(
    candidates: &mut Vec<Candidate>,
    surviving_ids: &[String],
    rules: &[Rule],
    base_facts: &[Fact],
    trace: &mut Vec<TraceStep>,
    depth: u32,
) -> (Option<String>, bool) {
    const MAX_DEPTH: u32 = 2;

    if depth >= MAX_DEPTH {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "impasse-unresolved-fallback".to_string(),
            detail: format!("depth cap {} reached, using score+lex", MAX_DEPTH),
            depth,
            objects: vec![],
        });
        return (score_lex_pick(candidates, surviving_ids), false);
    }

    let subgoal_facts = collect_subgoal_prefs(rules, "impasse:tie");
    if subgoal_facts.is_empty() {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "impasse-unresolved-fallback".to_string(),
            detail: "no impasse:tie rules, using score+lex".to_string(),
            depth,
            objects: vec![],
        });
        return (score_lex_pick(candidates, surviving_ids), false);
    }

    trace.push(TraceStep {
        step: trace.len(),
        kind: "subgoal:enter".to_string(),
        detail: format!(
            "depth {} — {} tie-rules injected",
            depth + 1,
            subgoal_facts.len()
        ),
        depth: depth + 1,
        objects: vec![],
    });

    // Reset elimination on tied candidates only, then apply new prefs.
    for c in candidates.iter_mut() {
        if surviving_ids.contains(&c.id) {
            c.eliminated = false;
            c.elimination_reason = None;
        }
    }

    let mut augmented_facts: Vec<Fact> = base_facts.to_vec();
    augmented_facts.extend(subgoal_facts);
    let sub_prefs = parse_prefs_from_facts(&augmented_facts);

    apply_better_dominance(candidates, &sub_prefs.better, trace, depth + 1);

    // Re-check survivors among tied set.
    let new_alive: Vec<String> = candidates
        .iter()
        .filter(|c| surviving_ids.contains(&c.id) && !c.eliminated)
        .map(|c| c.id.clone())
        .collect();

    match new_alive.len() {
        0 => {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "impasse-unresolved-fallback".to_string(),
                detail: "subgoal eliminated all tied candidates, using score+lex".to_string(),
                depth: depth + 1,
                objects: vec![],
            });
            (score_lex_pick(candidates, surviving_ids), false)
        }
        1 => {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "subgoal:tie-resolved".to_string(),
                detail: new_alive[0].clone(),
                depth: depth + 1,
                objects: vec![],
            });
            (Some(new_alive[0].clone()), true)
        }
        _ => {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "impasse".to_string(),
                detail: format!(
                    "still tied {} candidates at depth {}",
                    new_alive.len(),
                    depth + 1
                ),
                depth: depth + 1,
                objects: vec![],
            });
            resolve_tie_with_subgoal(
                candidates,
                &new_alive,
                rules,
                &augmented_facts,
                trace,
                depth + 1,
            )
        }
    }
}

impl CognitionBreed for Soar {
    fn id(&self) -> BreedId {
        BreedId::Soar
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "preference_resolution".to_string(),
            "impasse_detection".to_string(),
            "subgoaling".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.candidates.is_empty() {
            return Err("SOAR requires at least one operator candidate".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let prefs = parse_prefs(input);
        let mut candidates = input.candidates.clone();
        let mut trace: Vec<TraceStep> = Vec::new();

        tracing::debug!(breed.step = "operator_proposed", breed = "soar", "L1 inference step");

        // Step 1: prohibit.
        for c in candidates.iter_mut() {
            if prefs.prohibit.contains(&c.id) {
                c.eliminated = true;
                c.elimination_reason = Some("prohibit".to_string());
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "prohibit".to_string(),
                    detail: c.id.clone(),
                    depth: 0,
                    objects: vec![],
                });
            }
        }

        // Step 2: require (if any).
        if !prefs.require.is_empty() {
            for c in candidates.iter_mut() {
                if !prefs.require.contains(&c.id) && !c.eliminated {
                    c.eliminated = true;
                    c.elimination_reason = Some("not in require-set".to_string());
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "veto-non-required".to_string(),
                        detail: c.id.clone(),
                        depth: 0,
                        objects: vec![],
                    });
                }
            }
        }

        // Step 3: better-than dominance (transitive closure with cycle defence).
        apply_better_dominance(&mut candidates, &prefs.better, &mut trace, 0);

        // Step 4: best/worst tags among survivors.
        tracing::debug!(breed.step = "preference_evaluated", breed = "soar", "L1 inference step");
        let alive: Vec<&Candidate> = candidates.iter().filter(|c| !c.eliminated).collect();
        let any_best = alive.iter().any(|c| prefs.best.contains(&c.id));
        let surviving_ids: Vec<String> = if any_best {
            alive
                .iter()
                .filter(|c| prefs.best.contains(&c.id))
                .map(|c| c.id.clone())
                .collect()
        } else {
            alive
                .iter()
                .filter(|c| !prefs.worst.contains(&c.id))
                .map(|c| c.id.clone())
                .collect()
        };

        let (selected, impasse, subgoal_resolved) = match surviving_ids.len() {
            0 => (None, true, false),
            1 => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "evaluate-single".to_string(),
                    detail: surviving_ids[0].clone(),
                    depth: 0,
                    objects: vec![],
                });
                (Some(surviving_ids[0].clone()), false, false)
            }
            _ => {
                tracing::debug!(breed.step = "impasse_detected", breed = "soar", "L1 inference step");
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "impasse".to_string(),
                    detail: format!("tie among {} candidates", surviving_ids.len()),
                    depth: 0,
                    objects: vec![],
                });

                let (winner, resolved) = resolve_tie_with_subgoal(
                    &mut candidates,
                    &surviving_ids,
                    &input.rules,
                    &input.facts,
                    &mut trace,
                    0,
                );
                (winner, true, resolved)
            }
        };

        tracing::debug!(breed.step = "operator_selected", breed = "soar", "L1 inference step");

        // Step 5: emit chunk.pref output fact.
        let chunk_reason = if subgoal_resolved {
            "subgoal:tie-resolved"
        } else if impasse {
            "impasse-unresolved-fallback"
        } else {
            "decisive"
        };
        let chunk_fact = Fact {
            key: "chunk.pref".to_string(),
            value: format!(
                "winner:{}:reason:{}",
                selected.as_deref().unwrap_or("none"),
                chunk_reason
            ),
        };

        let mut output_facts = input.facts.clone();
        output_facts.push(chunk_fact);

        let explanation = format!(
            "SOAR {} selected {:?} (best={}, worst={}, require={}, prohibit={}, better-pairs={})",
            if subgoal_resolved {
                "subgoal-resolved"
            } else if impasse {
                "impasse-resolved"
            } else {
                "decisive"
            },
            selected,
            prefs.best.len(),
            prefs.worst.len(),
            prefs.require.len(),
            prefs.prohibit.len(),
            prefs.better.len()
        );

        Ok(BreedOutput {
            breed: BreedId::Soar,
            candidates,
            facts: output_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("SOAR must record at least one evaluation step".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Candidate, Fact, Rule};

    fn make_fact(value: &str) -> Fact {
        Fact {
            key: "pref".to_string(),
            value: value.to_string(),
        }
    }

    fn make_cand(id: &str, score: f32) -> Candidate {
        Candidate {
            id: id.to_string(),
            score,
            eliminated: false,
            elimination_reason: None,
        }
    }

    fn make_rule(id: &str, premise: &[&str], conclusion: &str) -> Rule {
        Rule {
            id: id.to_string(),
            premise: premise.iter().map(|s| s.to_string()).collect(),
            conclusion: conclusion.to_string(),
            certainty: 1.0,
        }
    }

    /// Rank-2 (domain contract): `better:a:b` with exactly two colon-separated
    /// IDs is well-formed. The 'better' clause MUST be recorded and apply
    /// dominance during selection.
    #[test]
    fn parse_prefs_accepts_well_formed_better_pair() {
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("a", 0.5), make_cand("b", 0.6)],
            facts: vec![make_fact("better:a:b")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let prefs = parse_prefs(&input);
        assert_eq!(prefs.better.len(), 1, "well-formed pair must be parsed");
        assert_eq!(prefs.better[0].0, "a");
        assert_eq!(prefs.better[0].1, "b");
    }

    /// Rank-2 (domain contract): `better:a:b:c` is MALFORMED — candidate IDs
    /// are colon-free, so a third colon means the spec is ambiguous. Per the
    /// fix for deferred-finding #3, malformed prefs MUST be rejected (dropped)
    /// rather than silently parsed as ("a", "b:c"). This prevents a malformed
    /// pref from quietly creating a nonexistent "b:c" dominator that has no
    /// effect, masking the operator's misconfiguration.
    #[test]
    fn parse_prefs_rejects_better_with_three_colons() {
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("a", 0.5), make_cand("b", 0.6)],
            facts: vec![make_fact("better:a:b:c")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let prefs = parse_prefs(&input);
        assert!(
            prefs.better.is_empty(),
            "malformed `better:a:b:c` MUST be dropped, not parsed as (\"a\", \"b:c\")"
        );
    }

    /// Rank-2 (domain contract): empty operand on either side of `better:` is
    /// also malformed and MUST be dropped (no half-valid dominance edges).
    #[test]
    fn parse_prefs_rejects_better_with_empty_operand() {
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("a", 0.5)],
            facts: vec![make_fact("better::b"), make_fact("better:a:")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let prefs = parse_prefs(&input);
        assert!(
            prefs.better.is_empty(),
            "empty operand MUST be dropped — half-valid dominance edges are invalid"
        );
    }

    /// Rank-2 (domain contract): the malformed `better:a:b:c` MUST NOT cause
    /// candidate `a` to dominate anyone. End-to-end behavioral assertion:
    /// candidate `b` (highest score) wins because `better:a:b:c` is silently
    /// dropped — `a` never dominates `b`.
    #[test]
    fn run_with_malformed_better_does_not_dominate() {
        let breed = Soar;
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("a", 0.3), make_cand("b", 0.9)],
            facts: vec![make_fact("better:a:b:c")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        // No domination should have occurred — both candidates survive.
        // With a tie-resolution, the highest-score (b) is the impasse pick.
        assert_eq!(out.selected.as_deref(), Some("b"));
        assert!(
            out.inference_trace.iter().all(|t| t.kind != "dominate"),
            "malformed better MUST NOT produce a 'dominate' trace step"
        );
    }

    /// test_subgoal_resolves_tie: a rule with premise `impasse:tie` injects
    /// `pref:better:alpha:beta`, resolving the tie via subgoal (not score fallback).
    #[test]
    fn test_subgoal_resolves_tie() {
        let breed = Soar;
        // Both candidates have equal scores — normal resolution produces a tie.
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("alpha", 0.5), make_cand("beta", 0.5)],
            facts: vec![],
            cases: vec![],
            rules: vec![make_rule("r1", &["impasse:tie"], "pref:better:alpha:beta")],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some("alpha"),
            "subgoal rule must resolve tie in favour of alpha"
        );
        let has_resolved = out
            .inference_trace
            .iter()
            .any(|t| t.kind == "subgoal:tie-resolved");
        assert!(has_resolved, "trace must contain subgoal:tie-resolved step");
        // chunk.pref fact must be emitted with subgoal:tie-resolved reason.
        let chunk = out
            .facts
            .iter()
            .find(|f| f.key == "chunk.pref")
            .expect("chunk.pref fact must be present");
        assert!(
            chunk.value.contains("alpha"),
            "chunk.pref must name the winner"
        );
        assert!(
            chunk.value.contains("subgoal:tie-resolved"),
            "chunk.pref must record subgoal:tie-resolved reason"
        );
    }

    /// test_fallback_regression: when no impasse:tie rules exist, behavior falls
    /// back to score+lex (existing regression test).
    #[test]
    fn test_fallback_regression() {
        let breed = Soar;
        // b has higher score — score+lex fallback picks b.
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![make_cand("a", 0.3), make_cand("b", 0.9)],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert_eq!(
            out.selected.as_deref(),
            Some("b"),
            "score fallback must pick b"
        );
        let has_fallback = out
            .inference_trace
            .iter()
            .any(|t| t.kind == "impasse-unresolved-fallback");
        assert!(
            has_fallback,
            "must emit impasse-unresolved-fallback trace step"
        );
    }

    /// test_depth_cap: recursive impasse:tie rules that would loop forever are
    /// capped at depth 2 and fall back to score+lex.
    #[test]
    fn test_depth_cap() {
        let breed = Soar;
        // Three-way equal-score tie; rule injects better:x:z (leaves x and y tied).
        // At depth 1: x>z, z eliminated. x and y still tied, impasse again.
        // At depth 2: same rule fires, same result — depth cap triggers.
        let input = BreedInput {
            intent: "soar".into(),
            candidates: vec![
                make_cand("x", 0.5),
                make_cand("y", 0.5),
                make_cand("z", 0.5),
            ],
            facts: vec![],
            cases: vec![],
            rules: vec![make_rule("r1", &["impasse:tie"], "pref:better:x:z")],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).expect("run ok");
        assert!(
            out.selected.is_some(),
            "must select a winner even at depth cap"
        );
        let fallback_count = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "impasse-unresolved-fallback")
            .count();
        assert!(
            fallback_count >= 1,
            "must emit at least one impasse-unresolved-fallback trace step"
        );
        let max_fallback_depth = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "impasse-unresolved-fallback")
            .map(|t| t.depth)
            .max()
            .unwrap_or(0);
        assert!(
            max_fallback_depth <= 2,
            "fallback must not occur beyond depth 2, got depth {}",
            max_fallback_depth
        );
    }
}
