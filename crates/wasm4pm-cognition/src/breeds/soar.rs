//! SOAR-style preference-based operator selection with impasse detection
//! (Laird 1987).
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
//! Algorithm:
//! 1. Eliminate prohibited candidates.
//! 2. If a `require` exists, restrict to that single candidate.
//! 3. Apply `better:` constraints transitively; eliminate dominated
//!    candidates.
//! 4. Among survivors, prefer `best`-tagged candidates over `worst`.
//! 5. If exactly one remains, select it. Otherwise, declare an impasse
//!    and fall back to the highest-score survivor.

use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep};
use std::collections::HashSet;

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

fn parse_prefs(input: &BreedInput) -> Prefs {
    let mut p = Prefs::default();
    for f in &input.facts {
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

impl CognitionBreed for Soar {
    fn id(&self) -> BreedId {
        BreedId::Soar
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "preference_resolution".to_string(),
            "impasse_detection".to_string(),
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
                    });
                }
            }
        }

        // Step 3: better-than dominance (transitive closure with cycle defence).
        //
        // We snapshot alive status *before* each iteration so that a candidate
        // eliminated earlier in the same pass can still propagate transitivity in
        // the next pass.  Example: alpha > beta > gamma.  Pass 1: alpha eliminates
        // beta (beta was alive at snapshot).  Pass 2: beta was alive at the *start*
        // of pass 1, so gamma gets eliminated now that the fixed-point loop re-runs.
        // Actually the correct fix is simpler: snapshot alive IDs at the start of
        // each iteration and use that snapshot for the `better_alive` check so that
        // within a single pass the read set is frozen.  This lets alpha→beta happen
        // and beta→gamma happen in the same pass because beta was alive when the
        // snapshot was taken.
        let mut iters = 0;
        let max_iters = prefs.better.len() * candidates.len() + 1;
        loop {
            iters += 1;
            if iters > max_iters {
                break;
            }
            // Snapshot alive IDs (owned Strings) before mutations in this
            // iteration so the immutable borrow on `candidates` is released
            // before the mutable borrow in the inner loop.
            let alive_snapshot: std::collections::HashSet<String> = candidates
                .iter()
                .filter(|c| !c.eliminated)
                .map(|c| c.id.clone())
                .collect();
            let mut changed = false;
            for (better, worse) in &prefs.better {
                if !alive_snapshot.contains(better.as_str()) {
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
                            depth: 0,
                        });
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }

        // Step 4: best/worst tags among survivors.
        let alive: Vec<&crate::breeds::Candidate> =
            candidates.iter().filter(|c| !c.eliminated).collect();
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

        let (selected, impasse) = match surviving_ids.len() {
            0 => (None, true),
            1 => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "evaluate-single".to_string(),
                    detail: surviving_ids[0].clone(),
                    depth: 0,
                });
                (Some(surviving_ids[0].clone()), false)
            }
            _ => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "impasse".to_string(),
                    detail: format!("tie among {} candidates", surviving_ids.len()),
                    depth: 0,
                });
                // Subgoal-like resolution: highest-score with id tiebreak.
                let pick = candidates
                    .iter()
                    .filter(|c| surviving_ids.contains(&c.id))
                    .max_by(|a, b| {
                        a.score
                            .partial_cmp(&b.score)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then_with(|| b.id.cmp(&a.id))
                    })
                    .map(|c| c.id.clone());
                (pick, true)
            }
        };

        let explanation =
            format!(
            "SOAR {} selected {:?} (best={}, worst={}, require={}, prohibit={}, better-pairs={})",
            if impasse { "impasse-resolved" } else { "decisive" },
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
            facts: input.facts.clone(),
            selected,
            explanation,
            inference_trace: trace,
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
    use crate::breeds::{Candidate, Fact};

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
}
