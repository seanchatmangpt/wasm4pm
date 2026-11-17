use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Candidate, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Abduction as Inference to the Best Explanation (Thagard IBE) breed.
///
/// Surface-3 contract: `ibe:obs:` / `ibe:hyp:<H>:covers` / `:cost` facts;
/// score = |covered| − 0.1·cost; trace collect-observations → score-hypothesis
/// → compare → best-explanation.
pub struct AbductiveIbe;

/// All `k`-subsets of `0..n` in lexicographic order of their index tuples.
fn combinations(n: usize, k: usize) -> Vec<Vec<usize>> {
    let mut out = Vec::new();
    if k == 0 {
        out.push(vec![]);
        return out;
    }
    if k > n {
        return out;
    }
    let mut cur: Vec<usize> = (0..k).collect();
    loop {
        out.push(cur.clone());
        let mut i = k;
        while i > 0 {
            let idx = i - 1;
            if cur[idx] < n - (k - idx) {
                cur[idx] += 1;
                for j in (idx + 1)..k {
                    cur[j] = cur[j - 1] + 1;
                }
                break;
            }
            i -= 1;
        }
        if i == 0 {
            break;
        }
    }
    out
}

impl CognitionBreed for AbductiveIbe {
    fn id(&self) -> BreedId {
        BreedId::AbductiveIbe
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "inference_to_the_best_explanation".to_string(),
            "explanatory_coherence".to_string(),
            "thagard_echo_model".to_string(),
            "hypothesis_selection".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err(
                "AbductiveIbe requires facts to define observations and hypotheses".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // ── Parse the ibe: grammar ─────────────────────────────────────
        let mut observations: BTreeSet<String> = BTreeSet::new();
        let mut hypotheses: BTreeMap<String, (BTreeSet<String>, f32)> = BTreeMap::new();
        for f in &input.facts {
            if let Some(id) = f.key.strip_prefix("ibe:obs:") {
                observations.insert(id.to_string());
            } else if let Some(rest) = f.key.strip_prefix("ibe:hyp:") {
                if let Some(h) = rest.strip_suffix(":covers") {
                    let covered: BTreeSet<String> = f
                        .value
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    hypotheses.insert(h.to_string(), (covered, 0.0));
                } else if let Some(h) = rest.strip_suffix(":cost") {
                    let cost: f32 = f
                        .value
                        .trim()
                        .parse()
                        .map_err(|_| BreedError {
                            breed: self.id(),
                            message: format!(
                                "invalid assumption cost '{}' for hypothesis '{}'",
                                f.value, h
                            ),
                        })?;
                    if cost < 0.0 {
                        return Err(BreedError {
                            breed: self.id(),
                            message: format!(
                                "negative assumption cost {cost} for hypothesis '{h}'"
                            ),
                        });
                    }
                    hypotheses
                        .entry(h.to_string())
                        .or_insert_with(|| (BTreeSet::new(), 0.0))
                        .1 = cost;
                } else {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!("malformed hypothesis fact key '{key}'", key = f.key),
                    });
                }
            }
        }

        if observations.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no observations defined (need at least one ibe:obs: fact)".to_string(),
            });
        }
        if hypotheses.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no hypotheses defined (need at least one ibe:hyp:<H>:covers fact)"
                    .to_string(),
            });
        }
        if hypotheses.len() > 16 {
            return Err(BreedError {
                breed: self.id(),
                message: format!(
                    "too many hypotheses for exact IBE (max 16, got {})",
                    hypotheses.len()
                ),
            });
        }

        // ── collect-observations ───────────────────────────────────────
        let obs_list: Vec<String> = observations.iter().cloned().collect();
        trace.push(TraceStep {
            step: trace.len(),
            kind: "collect-observations".into(),
            detail: format!(
                "{} observations [{}], {} hypotheses",
                obs_list.len(),
                obs_list.join(","),
                hypotheses.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // ── Score non-empty hypothesis subsets, size-then-lex ─────────
        let names: Vec<String> = hypotheses.keys().cloned().collect();
        let mut best: Option<(String, f32)> = None;
        let mut evaluated: Vec<(String, f32)> = Vec::new();

        for size in 1..=names.len() {
            for combo in combinations(names.len(), size) {
                let members: Vec<&str> = combo.iter().map(|&i| names[i].as_str()).collect();
                let name = {
                    let mut ms: Vec<&str> = members.clone();
                    ms.sort();
                    ms.join("+")
                };
                let mut covered: BTreeSet<String> = BTreeSet::new();
                let mut cost = 0.0f32;
                for m in &members {
                    let (cov, c) = &hypotheses[*m];
                    covered.extend(cov.iter().cloned());
                    cost += c;
                }
                let score = covered.len() as f32 - 0.1f32 * cost;

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "score-hypothesis".into(),
                    detail: format!("{name} score={score:.4}"),
                    depth: 1,
                    objects: vec![],
                });

                let is_new_best = best.as_ref().map_or(true, |(_, s)| score > *s);
                if is_new_best {
                    let compare_detail = match &best {
                        None => format!("new best {name} ({score:.4})"),
                        Some((prev, prev_s)) => format!(
                            "new best {name} ({score:.4} beats {prev} {prev_s:.4})"
                        ),
                    };
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "compare".into(),
                        detail: compare_detail,
                        depth: 1,
                        objects: vec![],
                    });
                    best = Some((name.clone(), score));
                }

                evaluated.push((name, score));
            }
        }

        let (best_name, best_score) =
            best.expect("non-empty hypothesis set guarantees a best subset");
        trace.push(TraceStep {
            step: trace.len(),
            kind: "best-explanation".into(),
            detail: format!("{best_name} score={best_score:.4}"),
            depth: 0,
            objects: vec![],
        });

        // ── Output ─────────────────────────────────────────────────────
        let mut out_facts = vec![
            Fact {
                key: "ibe:best".to_string(),
                value: best_name.clone(),
            },
            Fact {
                key: "ibe:score".to_string(),
                value: format!("{best_score:.4}"),
            },
        ];

        // Upsert evaluated subsets into candidates, then sort score-desc.
        let mut candidates: Vec<Candidate> = input.candidates.clone();
        for cand in &mut candidates {
            if let Some((_, score)) = evaluated.iter().find(|(n, _)| *n == cand.id) {
                cand.score = *score;
            }
        }
        for (name, score) in &evaluated {
            if !candidates.iter().any(|c| &c.id == name) {
                candidates.push(Candidate {
                    id: name.clone(),
                    score: *score,
                    eliminated: false,
                    elimination_reason: None,
                });
            }
        }
        candidates.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));

        Ok(BreedOutput {
            breed: self.id(),
            candidates,
            facts: out_facts,
            selected: Some(best_name.clone()),
            explanation: format!(
                "IBE over {} candidate sets: best explanation '{}' with score {best_score:.4} (coverage − 0.1·cost).",
                evaluated.len(),
                best_name
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let trace = &output.inference_trace;
        if trace.is_empty() {
            return Err("AbductiveIbe must emit at least one trace step".to_string());
        }
        if trace[0].kind != "collect-observations" {
            return Err("first trace step must be 'collect-observations'".to_string());
        }
        if !trace.iter().any(|t| t.kind == "score-hypothesis") {
            return Err("trace must contain at least one 'score-hypothesis' step".to_string());
        }
        let last = trace.last().unwrap();
        if last.kind != "best-explanation" {
            return Err("last trace step must be 'best-explanation'".to_string());
        }
        let best_fact = output
            .facts
            .iter()
            .find(|f| f.key == "ibe:best")
            .ok_or("output must contain 'ibe:best'")?;
        let score_fact = output
            .facts
            .iter()
            .find(|f| f.key == "ibe:score")
            .ok_or("output must contain 'ibe:score'")?;
        let expected = format!("{} score={}", best_fact.value, score_fact.value);
        if last.detail != expected {
            return Err(format!(
                "best-explanation detail '{}' inconsistent with ibe:best/ibe:score ({})",
                last.detail, expected
            ));
        }
        if output.selected.as_deref() != Some(best_fact.value.as_str()) {
            return Err("selected must agree with ibe:best".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    fn oracle_novel() -> BreedInput {
        BreedInput {
            intent: "coherence".into(),
            candidates: vec![],
            facts: vec![
                fact("ibe:obs:t_o1", "true"),
                fact("ibe:obs:t_o2", "true"),
                fact("ibe:obs:t_o3", "true"),
                fact("ibe:hyp:t_grand:covers", "t_o1,t_o2,t_o3"),
                fact("ibe:hyp:t_grand:cost", "25"),
                fact("ibe:hyp:t_lean:covers", "t_o1,t_o2"),
                fact("ibe:hyp:t_lean:cost", "2"),
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// All six fitted data points of the score formula (plan risk #1):
    /// score = |covered observations| − 0.1·cost, asserted at 4 decimals.
    #[test]
    fn score_formula_fits_all_six_points() {
        // t_grand 3/25 -> 0.5000; t_lean 2/2 -> 1.8000;
        // pair {t_grand,t_lean} 3/27 -> 0.3000.
        let out = AbductiveIbe.run(&oracle_novel()).unwrap();
        let scored: Vec<&str> = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "score-hypothesis")
            .map(|t| t.detail.as_str())
            .collect();
        assert_eq!(scored, vec!["t_grand score=0.5000", "t_lean score=1.8000", "t_grand+t_lean score=0.3000"]);

        // H1 2/1.0 -> 1.9000; H2 1/1.0 -> 0.9000; H1+H2 2/2.0 -> 1.8000.
        let ex = BreedInput {
            intent: "coherence".into(),
            candidates: vec![
                Candidate {
                    id: "H1".into(),
                    score: 0.5,
                    eliminated: false,
                    elimination_reason: None,
                },
                Candidate {
                    id: "H2".into(),
                    score: 0.5,
                    eliminated: false,
                    elimination_reason: None,
                },
            ],
            facts: vec![
                fact("ibe:obs:E1", "true"),
                fact("ibe:obs:E2", "true"),
                fact("ibe:hyp:H1:covers", "E1,E2"),
                fact("ibe:hyp:H1:cost", "1.0"),
                fact("ibe:hyp:H2:covers", "E1"),
                fact("ibe:hyp:H2:cost", "1.0"),
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = AbductiveIbe.run(&ex).unwrap();
        let scored: Vec<&str> = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "score-hypothesis")
            .map(|t| t.detail.as_str())
            .collect();
        assert_eq!(
            scored,
            vec![
                "H1 score=1.9000",
                "H2 score=0.9000",
                "H1+H2 score=1.8000"
            ]
        );
        assert_eq!(out.selected.as_deref(), Some("H1"));
        assert_eq!(
            out.candidates.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["H1", "H1+H2", "H2"]
        );
        assert_eq!(
            out.explanation,
            "IBE over 3 candidate sets: best explanation 'H1' with score 1.9000 (coverage − 0.1·cost)."
        );
    }

    #[test]
    fn oracle_compare_and_best_details() {
        let out = AbductiveIbe.run(&oracle_novel()).unwrap();
        let cmp = out
            .inference_trace
            .iter()
            .filter(|t| t.kind == "compare")
            .map(|t| t.detail.clone())
            .collect::<Vec<_>>();
        assert_eq!(cmp.len(), 2);
        assert_eq!(cmp[0], "new best t_grand (0.5000)");
        assert_eq!(
            cmp[1],
            "new best t_lean (1.8000 beats t_grand 0.5000)"
        );
        let last = out.inference_trace.last().unwrap();
        assert_eq!(last.kind, "best-explanation");
        assert_eq!(last.detail, "t_lean score=1.8000");
    }

    #[test]
    fn cost_flip_flips_best() {
        let mut grand_wins = oracle_novel();
        for f in &mut grand_wins.facts {
            if f.key == "ibe:hyp:t_grand:cost" {
                f.value = "1".to_string();
            }
        }
        let out = AbductiveIbe.run(&grand_wins).unwrap();
        // grand: 3-0.1=2.9 vs lean: 2-0.2=1.8 vs pair 3-0.3=2.7 -> grand best.
        assert_eq!(out.selected.as_deref(), Some("t_grand"));
        assert_eq!(
            out.inference_trace.last().unwrap().detail,
            "t_grand score=2.9000"
        );
    }

    #[test]
    fn refuses_negative_cost() {
        let input = BreedInput {
            intent: "coherence".into(),
            candidates: vec![],
            facts: vec![
                fact("ibe:obs:t_o1", "true"),
                fact("ibe:hyp:t_h1:covers", "t_o1"),
                fact("ibe:hyp:t_h1:cost", "-3"),
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = AbductiveIbe.run(&input).unwrap_err();
        assert!(err.message.contains("negative assumption cost"));
    }

    #[test]
    fn refuses_invalid_cost_and_empties() {
        let bad_cost = BreedInput {
            intent: "coherence".into(),
            candidates: vec![],
            facts: vec![
                fact("ibe:obs:t_o1", "true"),
                fact("ibe:hyp:t_h1:covers", "t_o1"),
                fact("ibe:hyp:t_h1:cost", "abc"),
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(AbductiveIbe.run(&bad_cost).is_err());

        let no_obs = BreedInput {
            intent: "coherence".into(),
            candidates: vec![],
            facts: vec![fact("ibe:hyp:t_h1:covers", "t_o1")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(AbductiveIbe.run(&no_obs).is_err());

        let no_hyp = BreedInput {
            intent: "coherence".into(),
            candidates: vec![],
            facts: vec![fact("ibe:obs:t_o1", "true")],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(AbductiveIbe.run(&no_hyp).is_err());
    }
}
