//! Paper-grounded integration tests — each breed is tested against the canonical worked example
//! from its source paper.
//!
//! Each test loads `tests/fixtures/papers/<breed>.json`, parses the "input" field into a
//! `BreedInput`, dispatches to the breed under test, and asserts structural and
//! paper-stated expectations from the "expected" field.
//!
//! Tests use graceful skip (if-let) if the fixture file is absent — they do not panic on
//! missing files, but they do panic on bad parses or failed runs once the fixture is present.

use std::fs;
use wasm4pm_cognition::breeds::*;

// ============================================================================
// MYCIN — Shortliffe & Buchanan 1975
// ============================================================================

#[test]
fn mycin_paper_grounded() {
    let path = "tests/fixtures/papers/mycin.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("diagnose")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = production_rules::Mycin;
            assert!(
                breed.preconditions(&input).is_ok(),
                "MYCIN paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("MYCIN paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Mycin);
            assert!(
                !output.explanation.is_empty(),
                "MYCIN explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "MYCIN trace must be non-empty"
            );
            assert!(
                output.inference_trace.iter().any(|t| t.kind == "fire-rule"),
                "MYCIN must have fired at least one rule (streptococcus chain from paper)"
            );

            let exp = &json["expected"];

            // Paper-grounded NUMERIC assertion: organism=streptococcus is derived at
            // CF=0.7 (Shortliffe & Buchanan 1975, p.247, MB[h,e]=0.7). The CF is
            // emitted in the fire-rule trace detail as "(cf=0.700)".
            let organism = exp
                .get("organism")
                .and_then(|v| v.as_str())
                .expect("fixture must declare expected.organism");
            let organism_cf =
                exp.get("organism_cf")
                    .and_then(|v| v.as_f64())
                    .expect("fixture must declare expected.organism_cf") as f32;
            let organism_detail = output
                .inference_trace
                .iter()
                .find(|t| t.detail.contains(&format!("organism={}", organism)))
                .unwrap_or_else(|| {
                    panic!("MYCIN must derive organism={organism} per Shortliffe & Buchanan 1975 p.247")
                });
            let derived_cf = parse_cf(&organism_detail.detail);
            assert!(
                (derived_cf - organism_cf).abs() < 1e-3,
                "MYCIN organism CF must equal paper value {organism_cf} (Shortliffe & Buchanan 1975 p.247); got {derived_cf}"
            );

            // The diagnostic answer (selected) is the terminal therapy recommendation,
            // not an intermediate organism or echoed input fact.
            let top = exp
                .get("top_conclusion")
                .and_then(|v| v.as_str())
                .expect("fixture must declare expected.top_conclusion");
            assert_eq!(
                output.selected.as_deref(),
                Some(top),
                "MYCIN selected must be the terminal conclusion {top}"
            );
        }
    }
}

/// Extract the certainty factor from a MYCIN fire-rule trace detail of the form
/// "RULE… ⇒ conclusion (cf=0.700)". Returns 0.0 if no CF token is present.
fn parse_cf(detail: &str) -> f32 {
    detail
        .rsplit_once("cf=")
        .and_then(|(_, rest)| rest.trim_end_matches(')').parse::<f32>().ok())
        .unwrap_or(0.0)
}

/// Extract a similarity score from a CBR score-case trace detail.
/// Accepts formats like "score=0.80" or "CASE-ID score=0.80" or "(score=0.80)".
/// Returns 0.0 if no score token is present.
fn parse_cbr_score(detail: &str) -> f32 {
    detail
        .split_whitespace()
        .find_map(|tok| {
            let tok = tok.trim_matches(|c| c == '(' || c == ')' || c == ',');
            tok.strip_prefix("score=")
                .and_then(|v| v.parse::<f32>().ok())
        })
        .unwrap_or(0.0)
}

// ============================================================================
// CBR — Aamodt & Plaza 1994
// ============================================================================

#[test]
fn cbr_paper_grounded() {
    let path = "tests/fixtures/papers/cbr.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let mut cases = Vec::new();
            if let Some(arr) = inp.get("cases").and_then(|v| v.as_array()) {
                for c in arr {
                    if let (Some(id), Some(intent), Some(arch), Some(score)) = (
                        c.get("id").and_then(|v| v.as_str()),
                        c.get("intent").and_then(|v| v.as_str()),
                        c.get("architecture").and_then(|v| v.as_str()),
                        c.get("outcome_score").and_then(|v| v.as_f64()),
                    ) {
                        let case_facts = c
                            .get("facts")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|f| {
                                        let k = f.get("key").and_then(|v| v.as_str())?;
                                        let v = f.get("value").and_then(|v| v.as_str())?;
                                        Some(Fact {
                                            key: k.to_string(),
                                            value: v.to_string(),
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        cases.push(Case {
                            id: id.to_string(),
                            intent: intent.to_string(),
                            architecture: arch.to_string(),
                            outcome_score: score as f32,
                            facts: case_facts,
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("retrieve")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases,
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = cbr::Cbr;
            assert!(
                breed.preconditions(&input).is_ok(),
                "CBR paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("CBR paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Cbr);
            assert!(
                !output.explanation.is_empty(),
                "CBR explanation must be non-empty"
            );
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "score-case"),
                "CBR must emit score-case trace steps"
            );

            // Paper-grounded assertion: CASE-PHYSICIAN-2WK has the highest Jaccard similarity
            // (4 of 5 features match: domain, symptom_primary, symptom_secondary, urgency).
            // Aamodt & Plaza 1994 p.2 states the physician is reminded of the patient treated
            // two weeks ago. Assert retrieval unconditionally — no if-let guard.
            let exp = &json["expected"];
            let retrieved = exp["retrieved_case"]
                .as_str()
                .expect("fixture must declare expected.retrieved_case");
            // selected or trace should reference the best-scoring case
            let found_in_trace = output
                .inference_trace
                .iter()
                .any(|t| t.detail.contains(retrieved));
            let found_in_selected = output
                .selected
                .as_deref()
                .map(|s| s.contains(retrieved))
                .unwrap_or(false);
            assert!(
                found_in_trace || found_in_selected,
                "CBR must retrieve '{}' (highest Jaccard: 4/5 features match) \
                 per Aamodt & Plaza 1994 physician reminding example p.2; \
                 selected={:?}",
                retrieved,
                output.selected
            );
            // Assert the highest-scoring case scored above others in the trace
            let score_steps: Vec<_> = output
                .inference_trace
                .iter()
                .filter(|t| t.kind == "score-case")
                .collect();
            assert!(
                !score_steps.is_empty(),
                "CBR must emit score-case trace steps for each candidate"
            );
            // CASE-PHYSICIAN-2WK must have a higher score trace than CASE-CREDIT-TROUBLED-CO
            // (different domain: medical vs finance — zero matching features)
            let physician_2wk_score = score_steps
                .iter()
                .find(|t| t.detail.contains("CASE-PHYSICIAN-2WK"))
                .map(|t| parse_cbr_score(&t.detail));
            let credit_score = score_steps
                .iter()
                .find(|t| t.detail.contains("CASE-CREDIT-TROUBLED-CO"))
                .map(|t| parse_cbr_score(&t.detail));
            if let (Some(p2wk), Some(credit)) = (physician_2wk_score, credit_score) {
                assert!(
                    p2wk > credit,
                    "CBR: CASE-PHYSICIAN-2WK score ({}) must exceed CASE-CREDIT-TROUBLED-CO score ({}) \
                     — different domain means zero feature overlap",
                    p2wk, credit
                );
            }
        }
    }
}

// ============================================================================
// GPS — Newell & Simon 1963
// ============================================================================

#[test]
fn gps_paper_grounded() {
    let path = "tests/fixtures/papers/gps.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(pred), Some(val)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let mut state = Vec::new();
            if let Some(arr) = inp.get("state").and_then(|v| v.as_array()) {
                for s in arr {
                    if let (Some(pred), Some(val)) = (
                        s.get("predicate").and_then(|v| v.as_str()),
                        s.get("value").and_then(|v| v.as_str()),
                    ) {
                        state.push(StateAtom {
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("transform")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules,
                goals,
                state,
            };

            let breed = gps::Gps;
            assert!(
                breed.preconditions(&input).is_ok(),
                "GPS paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("GPS paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Gps);
            assert!(
                !output.explanation.is_empty(),
                "GPS explanation must be non-empty"
            );
            assert!(
                output.inference_trace.iter().any(|t| {
                    t.kind == "reduce-gap"
                        || t.kind == "apply-operator"
                        || t.kind == "check-presatisfied"
                }),
                "GPS must emit gap-reduction or operator-application steps"
            );

            // Paper-grounded assertion: Fig. 4 of Newell & Simon P-2257 shows exactly
            // two operators applied (R6 then R12) to transform L1 → L0.
            let exp = &json["expected"];
            let solution_steps = exp["solution_steps"]
                .as_array()
                .expect("fixture must declare expected.solution_steps");
            for op_id in solution_steps {
                let op = op_id.as_str().expect("solution_steps must be strings");
                let applied = output.inference_trace.iter().any(|t| {
                    (t.kind == "apply-operator" || t.kind == "reduce-gap") && t.detail.contains(op)
                });
                assert!(
                    applied,
                    "GPS must apply operator '{}' per Newell & Simon 1961 Fig. 4 trace",
                    op
                );
            }
            // The final state must satisfy the goal (expr=L0 reached)
            let goal_satisfied = output.inference_trace.iter().any(|t| {
                t.kind == "check-presatisfied"
                    || t.detail.contains("L0")
                    || output
                        .selected
                        .as_deref()
                        .map(|s| s.contains("L0"))
                        .unwrap_or(false)
            }) || output.explanation.contains("L0");
            assert!(
                goal_satisfied,
                "GPS must reach goal state expr=L0 per Newell & Simon 1961 Fig. 4"
            );
        }
    }
}

// ============================================================================
// SOAR — Laird, Rosenbloom & Newell 1987
// ============================================================================

#[test]
fn soar_paper_grounded() {
    let path = "tests/fixtures/papers/soar.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    if let Some(id) = c.get("id").and_then(|v| v.as_str()) {
                        let score = c.get("score").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
                        candidates.push(Candidate {
                            id: id.to_string(),
                            score,
                            eliminated: false,
                            elimination_reason: None,
                        });
                    }
                }
            }

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("operator_selection")
                .to_string();

            let input = BreedInput {
                intent,
                candidates,
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = soar::Soar;
            assert!(
                breed.preconditions(&input).is_ok(),
                "SOAR paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("SOAR paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Soar);
            assert!(
                !output.explanation.is_empty(),
                "SOAR explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "SOAR trace must be non-empty"
            );

            // Paper-expected: op-move-blank-up selected via "best" preference
            let exp = &json["expected"];
            if let Some(expected_op) = exp.get("selected_operator").and_then(|v| v.as_str()) {
                assert_eq!(
                    output.selected.as_deref(),
                    Some(expected_op),
                    "SOAR must select '{}' per Laird et al. 1987 Section 2.3 preference resolution",
                    expected_op
                );
            }
        }
    }
}

// ============================================================================
// STRIPS — Fikes & Nilsson 1971
// ============================================================================

#[test]
fn strips_paper_grounded() {
    let path = "tests/fixtures/papers/strips.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(pred), Some(val)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let mut state = Vec::new();
            if let Some(arr) = inp.get("state").and_then(|v| v.as_array()) {
                for s in arr {
                    if let (Some(pred), Some(val)) = (
                        s.get("predicate").and_then(|v| v.as_str()),
                        s.get("value").and_then(|v| v.as_str()),
                    ) {
                        state.push(StateAtom {
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("plan")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules,
                goals,
                state,
            };

            let breed = strips::Strips;
            assert!(
                breed.preconditions(&input).is_ok(),
                "STRIPS paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("STRIPS paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Strips);
            assert!(
                !output.explanation.is_empty(),
                "STRIPS explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "STRIPS trace must be non-empty"
            );

            // Paper-grounded assertion: fixture encodes a 2-step plan (turn-on-light, close-door1).
            // Fikes & Nilsson 1971 Section 2 validates the forward-search STRIPS loop with
            // exactly the number of operators in the plan sequence.
            let exp = &json["expected"];
            let expected_plan = exp["plan"]
                .as_array()
                .expect("fixture must declare expected.plan");
            let expected_step_count = expected_plan.len();
            assert!(
                expected_step_count > 0,
                "STRIPS fixture plan must have at least one step"
            );
            // STRIPS trace uses kind="execute" for each operator execution step.
            // Count execute steps in the trace to verify the plan length.
            let execute_steps = output
                .inference_trace
                .iter()
                .filter(|t| t.kind == "execute")
                .count();
            assert_eq!(
                execute_steps, expected_step_count,
                "STRIPS must produce exactly {} execute steps (turn-on-light, close-door1) \
                 per Fikes & Nilsson 1971 Section 2 two-goal room-navigation problem; got {}",
                expected_step_count, execute_steps
            );
            // Assert each operator in the plan appears in the trace (execute or try-action steps)
            for op_id in expected_plan {
                let op = op_id.as_str().expect("plan must be strings");
                let applied = output.inference_trace.iter().any(|t| {
                    (t.kind == "execute" || t.kind == "try-action") && t.detail.contains(op)
                });
                assert!(
                    applied,
                    "STRIPS plan must contain operator '{}' per fixture expected.plan",
                    op
                );
            }
        }
    }
}

// ============================================================================
// HEARSAY — Erman & Lesser 1980
// ============================================================================

#[test]
fn hearsay_paper_grounded() {
    let path = "tests/fixtures/papers/hearsay.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("speech_recognition")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = hearsay::Hearsay;
            assert!(
                breed.preconditions(&input).is_ok(),
                "Hearsay paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("Hearsay paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Hearsay);
            assert!(
                !output.explanation.is_empty(),
                "Hearsay explanation must be non-empty"
            );
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "seed" || t.kind == "post-hypothesis"),
                "Hearsay must seed or post hypotheses from KS activations"
            );

            // Paper-grounded assertions from Erman et al. 1980 Section 1.
            let exp = &json["expected"];

            // Assert final phrase and credibility (Erman & Lesser 1980 Step 38, Fig. 5h)
            let final_phrase = exp["final_phrase"]
                .as_str()
                .expect("fixture must declare expected.final_phrase");
            let expected_credibility = exp["credibility"]
                .as_u64()
                .expect("fixture must declare expected.credibility")
                as u32;
            let found_phrase = output
                .inference_trace
                .iter()
                .any(|t| t.detail.contains(final_phrase))
                || output.explanation.contains(final_phrase)
                || output
                    .selected
                    .as_deref()
                    .map(|s| s.contains(final_phrase))
                    .unwrap_or(false);
            assert!(
                found_phrase,
                "Hearsay must produce final phrase '{}' per Erman et al. 1980 Step 38",
                final_phrase
            );
            // Credibility 85 must appear in trace or explanation
            let cred_str = expected_credibility.to_string();
            let credibility_found = output
                .inference_trace
                .iter()
                .any(|t| t.detail.contains(&cred_str))
                || output.explanation.contains(&cred_str);
            assert!(
                credibility_found,
                "Hearsay credibility {} must appear in trace or explanation per Erman et al. 1980",
                expected_credibility
            );

            // Assert correct words hypothesized (unconditional — no is_empty guard)
            let correct_words = exp["correct_words_hypothesized"]
                .as_array()
                .expect("fixture must declare expected.correct_words_hypothesized");
            let found_any = correct_words.iter().any(|w| {
                w.as_str()
                    .map(|word| {
                        output
                            .facts
                            .iter()
                            .any(|f| f.value.to_uppercase().contains(word))
                            || output
                                .inference_trace
                                .iter()
                                .any(|t| t.detail.to_uppercase().contains(word))
                    })
                    .unwrap_or(false)
            });
            assert!(
                found_any,
                "Hearsay must hypothesize at least one correct word (ARE/BY/AND/FELDMAN) \
                 per Erman et al. 1980 Fig. 5e Step 5 MOW output"
            );
        }
    }
}

// ============================================================================
// PROLOG — Colmerauer & Roussel 1993 (Robinson 1965 SLD-resolution)
// ============================================================================

#[test]
fn prolog_paper_grounded() {
    let path = "tests/fixtures/papers/prolog.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(pred), Some(val)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("member")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals,
                state: vec![],
            };

            let breed = prolog::Prolog;
            assert!(
                breed.preconditions(&input).is_ok(),
                "Prolog paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("Prolog paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Prolog);
            assert!(
                !output.explanation.is_empty(),
                "Prolog explanation must be non-empty"
            );
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "intern-fact"
                        || t.kind == "kernel-query"
                        || t.kind == "decision"),
                "Prolog must emit intern-fact / kernel-query / decision trace steps"
            );

            // Paper-grounded assertion: Kowalski 1974 Fig. 2 — parent(bob,ann) is a direct
            // fact lookup. The Prolog8 kernel must return selected='bob-ann' containing 'ann'.
            let exp = &json["expected"];
            let bindings = exp["resolved_bindings"]
                .as_array()
                .expect("fixture must declare expected.resolved_bindings");
            // selected must be Some — no is_some guard; unwrap directly
            let selected = output.selected.as_deref().expect(
                "Prolog must produce a selected binding for parent(bob,ann) \
                          per Kowalski 1974 Fig. 2 direct fact lookup",
            );
            let explanation_lc = output.explanation.to_lowercase();
            let trace_details: String = output
                .inference_trace
                .iter()
                .map(|t| t.detail.to_lowercase())
                .collect::<Vec<_>>()
                .join(" ");
            let selected_lc = selected.to_lowercase();
            for binding in bindings {
                let b = binding.as_str().expect("resolved_bindings must be strings");
                let bl = b.to_lowercase();
                assert!(
                    selected_lc.contains(&bl)
                        || explanation_lc.contains(&bl)
                        || trace_details.contains(&bl),
                    "Prolog must resolve binding '{}' per Kowalski 1974 Fig. 2 parent/ancestor program; \
                     selected='{}'",
                    b,
                    selected
                );
            }
        }
    }
}

// ============================================================================
// DENDRAL — Feigenbaum, Buchanan & Lederberg 1971
// ============================================================================

#[test]
fn dendral_paper_grounded() {
    let path = "tests/fixtures/papers/dendral.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    if let Some(id) = c.get("id").and_then(|v| v.as_str()) {
                        let score = c.get("score").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
                        candidates.push(Candidate {
                            id: id.to_string(),
                            score,
                            eliminated: false,
                            elimination_reason: None,
                        });
                    }
                }
            }

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("constraint_enumeration")
                .to_string();

            let input = BreedInput {
                intent,
                candidates,
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = dendral::Dendral;
            assert!(
                breed.preconditions(&input).is_ok(),
                "DENDRAL paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("DENDRAL paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Dendral);
            assert!(
                !output.explanation.is_empty(),
                "DENDRAL explanation must be non-empty"
            );
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "eliminate" || t.kind == "survive"),
                "DENDRAL must emit eliminate or survive trace steps"
            );

            // Paper-expected: ketone-F1 (diethyl ketone) must survive; forbidden structures eliminated
            let exp = &json["expected"];
            if let Some(correct) = exp.get("correct_structure").and_then(|v| v.as_str()) {
                let surviving = output
                    .candidates
                    .iter()
                    .filter(|c| !c.eliminated)
                    .any(|c| c.id == correct);
                assert!(
                    surviving,
                    "DENDRAL must keep '{}' (3-pentanone / diethyl ketone) as surviving candidate \
                     per Feigenbaum et al. 1971 Table 4",
                    correct
                );
            }

            if let Some(eliminated_arr) =
                exp.get("eliminated_candidates").and_then(|v| v.as_array())
            {
                for item in eliminated_arr {
                    if let Some(elim_id) = item.as_str() {
                        let is_eliminated = output
                            .candidates
                            .iter()
                            .any(|c| c.id == elim_id && c.eliminated);
                        assert!(
                            is_eliminated,
                            "DENDRAL must eliminate '{}' per paper constraint pruning",
                            elim_id
                        );
                    }
                }
            }
        }
    }
}

// ============================================================================
// ELIZA — Weizenbaum 1966
// ============================================================================

#[test]
fn eliza_paper_grounded() {
    let path = "tests/fixtures/papers/eliza.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            // Use serde deserialization to ensure rules, facts, goals, state all load from fixture
            let input: BreedInput = serde_json::from_value(json["input"].clone())
                .unwrap_or_else(|e| panic!("ELIZA fixture input parse: {}", e));

            let breed = frame::Eliza;
            assert!(
                breed.preconditions(&input).is_ok(),
                "ELIZA paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("ELIZA paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Eliza);
            assert!(
                !output.explanation.is_empty(),
                "ELIZA explanation must be non-empty"
            );
            // When rules are present, the keyword engine runs (emitting "keyword-found" steps).
            // The traditional "try-pattern" path only runs when no keyword engine rules are loaded.
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "try-pattern" || t.kind == "keyword-found"),
                "ELIZA must emit try-pattern (traditional) or keyword-found (keyword engine) trace steps"
            );

            // Paper-grounded assertion: Weizenbaum 1966 p.36 opening dialogue turn 1.
            // "Men are all alike." → ALIKE (rank 10, equiv DIT) → "IN WHAT WAY"
            let exp = &json["expected"];
            let turn1 = exp["turn_1"]
                .as_object()
                .expect("fixture must declare expected.turn_1");

            // Assert ALIKE keyword was triggered (unconditional — no if-let guard)
            let keyword_triggered = turn1["keyword_triggered"]
                .as_str()
                .expect("fixture turn_1 must declare keyword_triggered");
            let kw_base = keyword_triggered
                .split_whitespace()
                .next()
                .unwrap_or(keyword_triggered);
            let kw_lc = kw_base.to_lowercase();
            let keyword_found = output
                .inference_trace
                .iter()
                .any(|t| t.detail.to_lowercase().contains(&kw_lc));
            assert!(
                keyword_found,
                "ELIZA must trigger '{}' keyword per Weizenbaum 1966 p.36 opening dialogue",
                kw_base
            );

            // Assert the verbatim response "IN WHAT WAY" per Weizenbaum 1966 p.36.
            // The Eliza breed emits the response in output.explanation (the reassembly result);
            // selected holds the keyword name that was triggered.
            let expected_response = turn1["eliza_response"]
                .as_str()
                .expect("fixture turn_1 must declare eliza_response");
            let explanation_uc = output.explanation.to_uppercase();
            let response_found = explanation_uc.contains(expected_response)
                || output
                    .inference_trace
                    .iter()
                    .any(|t| t.detail.to_uppercase().contains(expected_response));
            assert!(
                response_found,
                "ELIZA first response must be '{}' per Weizenbaum 1966 p.36 verbatim transcript; \
                 explanation='{}'",
                expected_response, output.explanation
            );
        }
    }
}

// ============================================================================
// AutoinstinctLearning — Winston 1975 (HACKER / STRIPS)
// ============================================================================

#[test]
fn autoinstinct_learning_paper_grounded() {
    let path = "tests/fixtures/papers/autoinstinct_learning.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(pred), Some(val)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: pred.to_string(),
                            value: val.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("learn")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals,
                state: vec![],
            };

            let breed = autoinstinct_learning::AutoinstinctLearning;
            assert!(
                breed.preconditions(&input).is_ok(),
                "AutoinstinctLearning paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("AutoinstinctLearning paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::AutoinstinctLearning);
            assert!(
                !output.explanation.is_empty(),
                "AutoinstinctLearning explanation must be non-empty"
            );
            assert!(
                output
                    .selected
                    .as_deref()
                    .map(|s| s.contains("steps to goal"))
                    .unwrap_or(false),
                "AutoinstinctLearning must report 'N steps to goal' per Winston 1975 HACKER curriculum"
            );
            assert!(
                output.inference_trace.iter().any(|t| t.kind == "plan-step"),
                "AutoinstinctLearning must emit plan-step trace events"
            );

            // Paper-expected: bitmask plan length must match fixture expected.selected
            let exp = &json["expected"];
            if let Some(expected_selected) = exp.get("selected").and_then(|v| v.as_str()) {
                assert_eq!(
                    output.selected.as_deref(),
                    Some(expected_selected),
                    "AutoinstinctLearning: selected must match fixture expected.selected (Sussman 1973 HACKER bitmask plan length)"
                );
            }
        }
    }
}

// ============================================================================
// AutoinstinctNeurosis — Boden 1977 / Colby PARRY
// ============================================================================

#[test]
fn autoinstinct_neurosis_paper_grounded() {
    let path = "tests/fixtures/papers/autoinstinct_neurosis.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    if let Some(id) = c.get("id").and_then(|v| v.as_str()) {
                        let score = c.get("score").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
                        candidates.push(Candidate {
                            id: id.to_string(),
                            score,
                            eliminated: false,
                            elimination_reason: None,
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("evaluate")
                .to_string();

            let input = BreedInput {
                intent,
                candidates,
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = autoinstinct_neurosis::AutoinstinctNeurosis;
            assert!(
                breed.preconditions(&input).is_ok(),
                "AutoinstinctNeurosis paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("AutoinstinctNeurosis paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::AutoinstinctNeurosis);
            assert!(
                !output.explanation.is_empty(),
                "AutoinstinctNeurosis explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "AutoinstinctNeurosis trace must be non-empty"
            );

            // Paper-expected: conflict pairs must trigger findings; status reflects conflict detection
            let exp = &json["expected"];
            if let Some(min_findings) = exp
                .get("expected_finding_count_min")
                .and_then(|v| v.as_u64())
            {
                // The trace should contain at least min_findings defensive response steps
                let response_steps = output
                    .inference_trace
                    .iter()
                    .filter(|t| {
                        t.kind == "defensive" || t.kind == "accepting" || t.kind == "seed-beliefs"
                    })
                    .count();
                assert!(
                    response_steps >= min_findings as usize,
                    "AutoinstinctNeurosis must emit at least {} defensive/accepting response steps for conflict pairs; \
                     Colby PARRY 1971 expects full paranoid conflict",
                    min_findings
                );
                let eliminated = output.candidates.iter().filter(|c| c.eliminated).count();
                assert!(
                    eliminated >= 6,
                    "AutoinstinctNeurosis: all 6 high-conflict stimuli must produce eliminated candidates; got {}",
                    eliminated
                );
            }
        }
    }
}

// ============================================================================
// AutoinstinctVision — Marr & Poggio 1976 (cooperative stereo algorithm)
// ============================================================================

#[test]
fn autoinstinct_vision_paper_grounded() {
    let path = "tests/fixtures/papers/autoinstinct_vision.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    if let (Some(k), Some(v)) = (
                        f.get("key").and_then(|v| v.as_str()),
                        f.get("value").and_then(|v| v.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("scene_analysis")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = autoinstinct_vision::AutoinstinctVision;
            assert!(
                breed.preconditions(&input).is_ok(),
                "AutoinstinctVision paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("AutoinstinctVision paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::AutoinstinctVision);
            assert!(
                !output.explanation.is_empty(),
                "AutoinstinctVision explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "AutoinstinctVision trace must be non-empty"
            );
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "observe-object"),
                "AutoinstinctVision must emit observe-object trace steps per Marr & Poggio 1976"
            );

            // Paper-expected: clear object selection from depth/support relations
            let exp = &json["expected"];
            if let Some(algo_outcome) = exp.get("algorithm_outcome").and_then(|v| v.as_str()) {
                // The explanation should reference convergence or the selected object
                assert!(
                    output.selected.is_some(),
                    "AutoinstinctVision must select a perceptually salient object; \
                     paper expects: {}",
                    algo_outcome
                );
            }
            if let Some(expected_id) = exp.get("selected").and_then(|v| v.as_str()) {
                assert_eq!(
                    output.selected.as_deref(),
                    Some(expected_id),
                    "AutoinstinctVision must select the correct clear object from the blocks-world scene"
                );
            }
        }
    }
}

// ============================================================================
// AutoinstinctSemantics — Schank 1972 (Conceptual Dependency)
// ============================================================================

#[test]
fn autoinstinct_semantics_paper_grounded() {
    let path = "tests/fixtures/papers/autoinstinct_semantics.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    {
        let json = serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));
        {
            let inp = &json["input"];

            let intent = inp
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("John give book to Mary")
                .to_string();

            let input = BreedInput {
                intent,
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = autoinstinct_semantics::AutoinstinctSemantics;
            assert!(
                breed.preconditions(&input).is_ok(),
                "AutoinstinctSemantics paper fixture must pass preconditions"
            );

            let output = breed
                .run(&input)
                .expect("AutoinstinctSemantics paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::AutoinstinctSemantics);
            assert!(
                !output.explanation.is_empty(),
                "AutoinstinctSemantics explanation must be non-empty"
            );
            assert!(
                !output.inference_trace.is_empty(),
                "AutoinstinctSemantics trace must be non-empty"
            );

            // Paper-expected: ATRANS primitive for "give"; actor=John, object=book, to=Mary
            let exp = &json["expected"];
            if let Some(cd_primitive) = exp.get("cd_primitive").and_then(|v| v.as_str()) {
                let selected = output
                    .selected
                    .as_deref()
                    .expect("AutoinstinctSemantics must produce a CD act for 'give'");
                assert!(
                    selected.contains(cd_primitive),
                    "AutoinstinctSemantics must extract '{}' from 'give' verb \
                     per Schank 1972 ATRANS definition; got: {}",
                    cd_primitive,
                    selected
                );
            }

            if let Some(actor) = exp.get("actor").and_then(|v| v.as_str()) {
                let selected = output.selected.as_deref().unwrap_or("");
                assert!(
                    selected.contains(actor),
                    "AutoinstinctSemantics: actor must be '{}', got: {}",
                    actor,
                    selected
                );
            }

            if let Some(obj) = exp.get("object").and_then(|v| v.as_str()) {
                let selected = output.selected.as_deref().unwrap_or("");
                assert!(
                    selected.contains(obj),
                    "AutoinstinctSemantics: object must be '{}', got: {}",
                    obj,
                    selected
                );
            }

            if let Some(to_role) = exp.get("to_role").and_then(|v| v.as_str()) {
                let selected = output.selected.as_deref().unwrap_or("");
                assert!(
                    selected.contains(to_role),
                    "AutoinstinctSemantics: to-role must be '{}' per Schank 1972, got: {}",
                    to_role,
                    selected
                );
            }

            // Trace must contain extract-act step for ATRANS
            assert!(
                output
                    .inference_trace
                    .iter()
                    .any(|t| t.kind == "extract-act" && t.detail.contains("Atrans")),
                "AutoinstinctSemantics must emit extract-act/Atrans trace step"
            );
        }
    }
}

// ============================================================================
// P1 TIER — paper-grounded oracles with published values asserted
// ============================================================================

/// Shared fixture parser for the P1 tier: builds a `BreedInput` from a
/// fixture's `input`-shaped JSON object (intent/facts/rules/goals/state).
fn parse_breed_input(inp: &serde_json::Value) -> BreedInput {
    let mut facts = Vec::new();
    if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
        for f in arr {
            if let (Some(k), Some(v)) = (
                f.get("key").and_then(|v| v.as_str()),
                f.get("value").and_then(|v| v.as_str()),
            ) {
                facts.push(Fact {
                    key: k.to_string(),
                    value: v.to_string(),
                });
            }
        }
    }
    let mut rules = Vec::new();
    if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
        for r in arr {
            if let (Some(id), Some(conclusion), Some(certainty)) = (
                r.get("id").and_then(|v| v.as_str()),
                r.get("conclusion").and_then(|v| v.as_str()),
                r.get("certainty").and_then(|v| v.as_f64()),
            ) {
                let premise = r
                    .get("premise")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|p| p.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                rules.push(Rule {
                    id: id.to_string(),
                    premise,
                    conclusion: conclusion.to_string(),
                    certainty: certainty as f32,
                });
            }
        }
    }
    let mut goals = Vec::new();
    if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
        for g in arr {
            if let (Some(id), Some(pred), Some(val)) = (
                g.get("id").and_then(|v| v.as_str()),
                g.get("predicate").and_then(|v| v.as_str()),
                g.get("value").and_then(|v| v.as_str()),
            ) {
                goals.push(Goal {
                    id: id.to_string(),
                    predicate: pred.to_string(),
                    value: val.to_string(),
                });
            }
        }
    }
    let mut state = Vec::new();
    if let Some(arr) = inp.get("state").and_then(|v| v.as_array()) {
        for s in arr {
            if let (Some(pred), Some(val)) = (
                s.get("predicate").and_then(|v| v.as_str()),
                s.get("value").and_then(|v| v.as_str()),
            ) {
                state.push(StateAtom {
                    predicate: pred.to_string(),
                    value: val.to_string(),
                });
            }
        }
    }
    BreedInput {
        intent: inp
            .get("intent")
            .and_then(|v| v.as_str())
            .unwrap_or("test")
            .to_string(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules,
        goals,
        state,
    }
}

fn load_fixture(breed: &str) -> serde_json::Value {
    let path = format!("tests/fixtures/papers/{}.json", breed);
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("mandatory paper fixture {} missing: {}", path, e));
    serde_json::from_str(&content).unwrap_or_else(|e| panic!("fixture {} unparsable: {}", path, e))
}

/// Havelund & Roşu 2001 — progression over a finite trace: the traffic-light
/// safety formula is SATISFIED on the conforming trace (good-prefix G
/// semantics) and VIOLATED at exactly the red∧green event on the bad trace.
#[test]
fn ltl_monitor_paper_grounded() {
    let json = load_fixture("ltl_monitor");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("ltl_monitor", &input).expect("ltl run");
    let exp = &json["expected"];
    assert_eq!(
        out.selected.as_deref(),
        Some(if exp["verdict"].as_bool().unwrap() {
            "true"
        } else {
            "false"
        }),
        "Havelund-Rosu 2001: conforming trace must satisfy G (red -> !green)"
    );
    let progress = out
        .inference_trace
        .iter()
        .filter(|t| t.kind == "ltl-progress")
        .count();
    assert_eq!(progress as u64, exp["progress_steps"].as_u64().unwrap());

    let bad = parse_breed_input(&json["violating_input"]);
    let out_bad = dispatch_breed_test("ltl_monitor", &bad).expect("ltl run");
    assert_eq!(out_bad.selected.as_deref(), Some("false"));
    let progress_bad = out_bad
        .inference_trace
        .iter()
        .filter(|t| t.kind == "ltl-progress")
        .count();
    assert_eq!(
        progress_bad as u64,
        exp["violating_progress_steps"].as_u64().unwrap()
    );
}

/// Allen 1983 Table 1 — m∘d = (o s d): published transitivity-table entry.
#[test]
fn allen_temporal_paper_grounded() {
    let json = load_fixture("allen_temporal");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("allen_temporal", &input).expect("allen run");
    for (key, val) in json["expected"]["derived"].as_object().unwrap() {
        let actual = out
            .facts
            .iter()
            .find(|f| &f.key == key)
            .unwrap_or_else(|| panic!("missing derived fact {}", key));
        assert_eq!(
            &actual.value,
            val.as_str().unwrap(),
            "Allen 1983 Table 1 entry mismatch for {}",
            key
        );
    }
}

// ============================================================================
// P2 tier — paper-grounded tests (12 breeds)
// All P2 runs go through breeds::dispatch::dispatch_breed, which enforces
// preconditions, postconditions, and the OCEL conformance gate (fitness 1.0).
// ============================================================================

/// Load a P2 fixture and deserialize its "input" object into a BreedInput.
fn p2_load(breed: &str) -> (BreedInput, serde_json::Value) {
    let path = format!("tests/fixtures/papers/{}.json", breed);
    let content =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("fixture {} must exist: {}", path, e));
    let json: serde_json::Value =
        serde_json::from_str(&content).unwrap_or_else(|e| panic!("fixture {} parse: {}", path, e));
    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .unwrap_or_else(|e| panic!("fixture {} input parse: {}", path, e));
    (input, json)
}

fn p2_fact_value<'a>(out: &'a BreedOutput, key: &str) -> &'a str {
    out.facts
        .iter()
        .find(|f| f.key == key)
        .map(|f| f.value.as_str())
        .unwrap_or_else(|| panic!("missing output fact '{}'", key))
}

/// Gelfond & Lifschitz 1988: unique stable model {p(1,2), q(1)}.
#[test]
fn asp_paper_grounded() {
    let (input, json) = p2_load("asp");
    let out = dispatch::dispatch_breed("asp", &input).expect("ASP paper run");
    assert_eq!(
        p2_fact_value(&out, "asp:answer_set_count"),
        json["expected"]["answer_set_count"].as_str().unwrap()
    );
    assert_eq!(
        p2_fact_value(&out, "asp:answer_set:0"),
        json["expected"]["answer_set_0"].as_str().unwrap()
    );
    assert!(out.ocel_log.is_some(), "OCEL log must be attached");
}

/// Baader, Brandt & Lutz 2005: Pericarditis ⊑ HeartDisease via CR1–CR4.
#[test]
fn description_logic_paper_grounded() {
    let (input, json) = p2_load("description_logic");
    let out = dispatch::dispatch_breed("description_logic", &input).expect("DL paper run");
    for (key, val) in json["expected"]["verdicts"].as_object().unwrap() {
        assert_eq!(p2_fact_value(&out, key), val.as_str().unwrap(), "{}", key);
    }
    for kind in json["expected"]["required_trace_kinds"].as_array().unwrap() {
        let k = kind.as_str().unwrap();
        assert!(
            out.inference_trace.iter().any(|t| t.kind == k),
            "trace must contain '{}'",
            k
        );
    }
}

/// Kakas, Kowalski & Toni 1992: grass-wet — explanations {rained}, {sprinkler_on}.
#[test]
fn abductive_lp_paper_grounded() {
    let (input, json) = p2_load("abductive_lp");
    let out = dispatch::dispatch_breed("abductive_lp", &input).expect("ALP paper run");
    assert_eq!(
        p2_fact_value(&out, "alp:explanation_count"),
        json["expected"]["explanation_count"].as_str().unwrap()
    );
    let expls: Vec<&str> = out
        .facts
        .iter()
        .filter(|f| f.key.starts_with("alp:explanation:"))
        .map(|f| f.value.as_str())
        .collect();
    for e in json["expected"]["explanations"].as_array().unwrap() {
        assert!(expls.contains(&e.as_str().unwrap()), "missing {}", e);
    }
}

/// Harman 1965 / Thagard 1978: evolution is the best explanation (score 3.9).
#[test]
fn abductive_ibe_paper_grounded() {
    let (input, json) = p2_load("abductive_ibe");
    let out = dispatch::dispatch_breed("abductive_ibe", &input).expect("IBE paper run");
    assert_eq!(
        out.selected.as_deref(),
        Some(json["expected"]["best"].as_str().unwrap())
    );
    assert_eq!(
        p2_fact_value(&out, "ibe:score"),
        json["expected"]["score"].as_str().unwrap()
    );
    let creation = json["expected"]["creation_score"].as_str().unwrap();
    assert!(
        out.inference_trace
            .iter()
            .any(|t| t.kind == "score-hypothesis"
                && t.detail == format!("creation score={}", creation)),
        "creation score {} must appear in trace",
        creation
    );
}

/// McAllester & Rosenblitt 1991: Sussman anomaly — interleaved solution.
#[test]
fn partial_order_plan_paper_grounded() {
    let (input, json) = p2_load("partial_order_plan");
    let out = dispatch::dispatch_breed("partial_order_plan", &input).expect("SNLP paper run");
    assert_eq!(
        p2_fact_value(&out, "pop:plan"),
        json["expected"]["plan"].as_str().unwrap()
    );
    assert!(out.inference_trace.iter().any(|t| t.kind == "pop-resolve"));
}

/// Kowalski & Sergot 1986: hired/promoted narrative periods.
#[test]
fn event_calculus_paper_grounded() {
    let (input, json) = p2_load("event_calculus");
    let out = dispatch::dispatch_breed("event_calculus", &input).expect("EC paper run");
    for (key, val) in json["expected"]["verdicts"].as_object().unwrap() {
        assert_eq!(p2_fact_value(&out, key), val.as_str().unwrap(), "{}", key);
    }
}

/// Bellman 1957: closed-form fixed point of the functional equation.
#[test]
fn mdp_paper_grounded() {
    let (input, json) = p2_load("mdp");
    let out = dispatch::dispatch_breed("mdp", &input).expect("MDP paper run");
    let tol = json["expected"]["tolerance"].as_f64().unwrap();
    for (state, expected) in json["expected"]["values"].as_object().unwrap() {
        let v: f64 = p2_fact_value(&out, &format!("mdp:value:{}", state))
            .parse()
            .unwrap();
        assert!(
            (v - expected.as_f64().unwrap()).abs() < tol,
            "V({}) = {} != {}",
            state,
            v,
            expected
        );
    }
    for (state, action) in json["expected"]["policy"].as_object().unwrap() {
        assert_eq!(
            p2_fact_value(&out, &format!("mdp:policy:{}", state)),
            action.as_str().unwrap()
        );
    }
}

/// Mamdani & Assilian 1975 — min-firing + max aggregation + centroid:
/// hand-derived 101-point discrete centroid of Tri(0,25,100) = 41.66667.
#[test]
fn fuzzy_logic_paper_grounded() {
    let json = load_fixture("fuzzy_logic");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("fuzzy_logic", &input).expect("fuzzy run");
    let exp = &json["expected"];
    let fire = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "fuzzy-fire")
        .expect("fire step");
    let strength: f64 = fire.detail.rsplit(' ').next().unwrap().parse().unwrap();
    assert!((strength - exp["fire_strength"].as_f64().unwrap()).abs() < 1e-9);
    let out_fact = out
        .facts
        .iter()
        .find(|f| f.key == exp["output_fact"].as_str().unwrap())
        .expect("output fact");
    let centroid: f64 = out_fact.value.parse().unwrap();
    assert!(
        (centroid - exp["centroid"].as_f64().unwrap()).abs()
            < exp["centroid_tolerance"].as_f64().unwrap(),
        "Mamdani centroid of asymmetric Tri(0,25,100) must be 41.66667 (+-1e-3), got {}",
        centroid
    );
}

/// Pearl 1988 — burglary network: P(B | j, m) = 0.284171835… to 1e-6.
#[test]
fn bayesian_network_paper_grounded() {
    let json = load_fixture("bayesian_network");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("bayesian_network", &input).expect("bn run");
    let verdict = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "bn-verdict")
        .expect("verdict step");
    let p: f64 = verdict.detail.split('=').nth(1).unwrap().parse().unwrap();
    let expected = json["expected"]["posterior"].as_f64().unwrap();
    let tol = json["expected"]["tolerance"].as_f64().unwrap();
    assert!(
        (p - expected).abs() < tol,
        "Pearl 1988 P(B|j,m) must be 0.284171835 (+-1e-6), got {}",
        p
    );
}

/// Mackworth 1977 — AC-3 + search on a complete inequality triangle:
/// exact lex-least coloring.
#[test]
fn csp_ac3_paper_grounded() {
    let json = load_fixture("csp_ac3");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("csp_ac3", &input).expect("csp run");
    assert_eq!(
        out.explanation,
        json["expected"]["explanation"].as_str().unwrap()
    );
    assert!(out.inference_trace.iter().any(|t| t.kind == "csp-assign"));
}

/// Reiter 1980 — Tweety: the penguin exception blocks the flies default.
#[test]
fn default_logic_paper_grounded() {
    let json = load_fixture("default_logic");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("default_logic", &input).expect("dl run");
    let ext = out.selected.expect("extension");
    let atoms: Vec<&str> = ext.split(", ").collect();
    for atom in json["expected"]["extension_contains"].as_array().unwrap() {
        assert!(
            atoms.contains(&atom.as_str().unwrap()),
            "Reiter 1980 extension must contain {}: {}",
            atom,
            ext
        );
    }
    for atom in json["expected"]["extension_excludes"].as_array().unwrap() {
        assert!(
            !atoms.contains(&atom.as_str().unwrap()),
            "Reiter 1980 extension must NOT contain {}: {}",
            atom,
            ext
        );
    }
    assert!(out
        .inference_trace
        .iter()
        .any(|t| t.kind == "default-block"));
}

/// Nau et al. 2003 — SHOP2 total-order decomposition: exact delivery plan.
#[test]
fn htn_planning_paper_grounded() {
    let json = load_fixture("htn_planning");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("htn_planning", &input).expect("htn run");
    assert_eq!(
        out.selected.as_deref(),
        Some(json["expected"]["plan"].as_str().unwrap()),
        "SHOP2 logistics plan must be load,drive,unload exactly"
    );
}

/// Shafer 1976 — two witnesses at 0.9: Bel(life) = 0.99 exactly.
#[test]
fn dempster_shafer_paper_grounded() {
    let json = load_fixture("dempster_shafer");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("dempster_shafer", &input).expect("ds run");
    let bel: f64 = out
        .facts
        .iter()
        .find(|f| f.key == "belief:life")
        .expect("belief fact")
        .value
        .parse()
        .unwrap();
    let expected = json["expected"]["belief"].as_f64().unwrap();
    let tol = json["expected"]["tolerance"].as_f64().unwrap();
    assert!(
        (bel - expected).abs() < tol,
        "Shafer 1976 two-witness Bel must be 0.99 exactly, got {}",
        bel
    );
}

/// Minsky 1974 — default inheritance: my_chair inherits legs=4 from chair.
#[test]
fn frames_inheritance_paper_grounded() {
    let json = load_fixture("frames_inheritance");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("frames_inheritance", &input).expect("frames run");
    assert_eq!(
        out.selected.as_deref(),
        Some(json["expected"]["selected"].as_str().unwrap())
    );
    let walks = out
        .inference_trace
        .iter()
        .filter(|t| t.kind == "frame-walk")
        .count();
    assert_eq!(
        walks as u64,
        json["expected"]["walk_steps"].as_u64().unwrap()
    );
}

/// Mitchell et al. 1986 — SafeToStack EBG: the learned operational rule is
/// fully variablized over the training constants.
#[test]
fn ebl_paper_grounded() {
    let json = load_fixture("ebl");
    let input = parse_breed_input(&json["input"]);
    let out = dispatch_breed_test("ebl", &input).expect("ebl run");
    let learned = out
        .facts
        .iter()
        .find(|f| f.key == "ebl:rule")
        .expect("ebl:rule fact")
        .value
        .clone();
    let exp = &json["expected"];
    for s in exp["rule_contains"].as_array().unwrap() {
        assert!(
            learned.contains(s.as_str().unwrap()),
            "rule must contain {}: {}",
            s,
            learned
        );
    }
    for s in exp["rule_excludes"].as_array().unwrap() {
        assert!(
            !learned.contains(s.as_str().unwrap()),
            "training constant {} must be variablized away: {}",
            s,
            learned
        );
    }
    assert!(
        learned.contains('?'),
        "Mitchell 1986 EBG must produce a variablized rule"
    );
}

/// Mitchell 1982: EnjoySport — S4 = <Sunny,Warm,?,Strong,?,?>, |G3| = 3, |G4| = 2.
#[test]
fn version_space_paper_grounded() {
    let (input, json) = p2_load("version_space");
    let out = dispatch::dispatch_breed("version_space", &input).expect("VS paper run");
    assert_eq!(
        p2_fact_value(&out, "vs:s"),
        json["expected"]["s"].as_str().unwrap()
    );
    let g: Vec<&str> = out
        .facts
        .iter()
        .filter(|f| f.key.starts_with("vs:g:"))
        .map(|f| f.value.as_str())
        .collect();
    let expected_g: Vec<&str> = json["expected"]["g"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(g.len(), expected_g.len());
    for h in expected_g {
        assert!(g.contains(&h), "missing G member {}", h);
    }
    let ig = json["expected"]["intermediate_g_size"].as_u64().unwrap();
    assert!(
        out.inference_trace
            .iter()
            .any(|t| t.kind == "vs-update" && t.detail.contains(&format!("|G|={}", ig))),
        "intermediate |G|={} must appear in trace",
        ig
    );
}

/// Konieczny & Pino Pérez 2002: Σ (majoritarian) vs GMax (egalitarian).
#[test]
fn belief_merging_paper_grounded() {
    let (input, json) = p2_load("belief_merging");
    let out_sum = dispatch::dispatch_breed("belief_merging", &input).expect("Σ paper run");
    let sum_models: Vec<&str> = out_sum
        .facts
        .iter()
        .filter(|f| f.key.starts_with("bm:model:"))
        .map(|f| f.value.as_str())
        .collect();
    let expected_sum: Vec<&str> = json["expected"]["sum_models"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(sum_models, expected_sum);

    let input_gmax: BreedInput = serde_json::from_value(json["input_gmax"].clone()).unwrap();
    let out_gmax = dispatch::dispatch_breed("belief_merging", &input_gmax).expect("GMax paper run");
    let gmax_models: Vec<&str> = out_gmax
        .facts
        .iter()
        .filter(|f| f.key.starts_with("bm:model:"))
        .map(|f| f.value.as_str())
        .collect();
    let expected_gmax: Vec<&str> = json["expected"]["gmax_models"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(gmax_models.len(), expected_gmax.len());
    for m in expected_gmax {
        assert!(gmax_models.contains(&m), "missing GMax model {}", m);
    }
    assert_ne!(
        sum_models, gmax_models,
        "Σ and GMax must disagree on this profile"
    );
}

/// de Kleer & Brown 1984: pressure-regulator valve ambiguity — 3 states.
#[test]
fn qualitative_reason_paper_grounded() {
    let (input, json) = p2_load("qualitative_reason");
    let out = dispatch::dispatch_breed("qualitative_reason", &input).expect("QR paper run");
    assert_eq!(
        p2_fact_value(&out, "qr:state_count"),
        json["expected"]["state_count"].as_str().unwrap()
    );
    for q in json["expected"]["q_values"].as_array().unwrap() {
        let glyph = q.as_str().unwrap();
        assert!(
            out.facts.iter().any(
                |f| f.key.starts_with("qr:state:") && f.value.contains(&format!("q:{}", glyph))
            ),
            "missing q={} branch",
            glyph
        );
    }
    for kind in json["expected"]["required_trace_kinds"].as_array().unwrap() {
        let k = kind.as_str().unwrap();
        assert!(
            out.inference_trace.iter().any(|t| t.kind == k),
            "missing '{}'",
            k
        );
    }
}

/// Schank & Abelson 1977: restaurant story — eating scene inferred for John.
#[test]
fn script_sam_paper_grounded() {
    let (input, json) = p2_load("script_sam");
    let out = dispatch::dispatch_breed("script_sam", &input).expect("SAM paper run");
    assert_eq!(
        p2_fact_value(&out, "sam:script"),
        json["expected"]["script"].as_str().unwrap()
    );
    for (key, val) in json["expected"]["inferred"].as_object().unwrap() {
        assert_eq!(p2_fact_value(&out, key), val.as_str().unwrap(), "{}", key);
    }
    assert_eq!(
        p2_fact_value(&out, "sam:inferred_count"),
        json["expected"]["inferred_count"].as_str().unwrap()
    );
    for (key, val) in json["expected"]["role"].as_object().unwrap() {
        assert_eq!(p2_fact_value(&out, key), val.as_str().unwrap(), "{}", key);
    }
}

/// Jaffar & Lassez 1987: CLP scheme — propagation alone solves, zero backtracks.
#[test]
fn clp_paper_grounded() {
    let (input, json) = p2_load("clp");
    let out = dispatch::dispatch_breed("clp", &input).expect("CLP paper run");
    assert_eq!(
        out.selected.as_deref(),
        Some(json["expected"]["solution"].as_str().unwrap())
    );
    assert_eq!(
        p2_fact_value(&out, "clp:backtracks"),
        json["expected"]["backtracks"].as_str().unwrap()
    );
}

// ============================================================================
// P3 tier — paper-grounded tests. Fixtures carry full provenance; "input" is
// a complete serialized BreedInput, parsed directly via serde.
// ============================================================================

pub fn assert_paper_grounded(json: &serde_json::Value) {
    if json.get("expected").and_then(|e| e.get("value")).is_none() {
        panic!("A12 Violation: Fixture missing `expected.value`");
    }
    let prov = json
        .get("provenance")
        .expect("A12 Violation: Fixture missing `provenance` block");
    if prov.get("paper").is_none() {
        panic!("A12 Violation: Fixture missing `provenance.paper`");
    }
    if prov.get("citation").is_none() {
        panic!("A12 Violation: Fixture missing `provenance.citation`");
    }
    if prov.get("locus").is_none() {
        panic!("A12 Violation: Fixture missing `provenance.locus`");
    }
    if prov.get("extraction").is_none() {
        panic!("A12 Violation: Fixture missing `provenance.extraction`");
    }
}

fn p3_load_full(breed: &str) -> Option<(BreedInput, serde_json::Value, serde_json::Value)> {
    let path = format!("tests/fixtures/papers/{}.json", breed);
    let content = fs::read_to_string(&path).ok()?;
    let json: serde_json::Value =
        serde_json::from_str(&content).expect("fixture must be valid JSON");
    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .expect("fixture input must parse as BreedInput");
    let expected = json["expected"].clone();
    Some((input, expected, json))
}

fn p3_load(breed: &str) -> Option<(BreedInput, serde_json::Value)> {
    let path = format!("tests/fixtures/papers/{}.json", breed);
    let content = fs::read_to_string(&path).ok()?;
    let json: serde_json::Value =
        serde_json::from_str(&content).expect("fixture must be valid JSON");
    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .expect("fixture input must parse as BreedInput");
    let expected = json["expected"].clone();
    Some((input, expected))
}

/// Reiter 1991 — blocks-world successor-state axioms with frame inertia.
#[test]
fn situation_calculus_paper_grounded() {
    let Some((input, expected)) = p3_load("situation_calculus") else {
        return;
    };
    let out = dispatch_breed_test("situation_calculus", &input).expect("run ok");
    for f in expected["holds_final"].as_array().unwrap() {
        let key = format!("holds:{}", f.as_str().unwrap());
        assert!(out.facts.iter().any(|x| x.key == key), "missing {}", key);
    }
    for f in expected["not_holds_final"].as_array().unwrap() {
        let key = format!("holds:{}", f.as_str().unwrap());
        assert!(!out.facts.iter().any(|x| x.key == key), "stale {}", key);
    }
    for f in expected["frame_persist_fluents"].as_array().unwrap() {
        let name = f.as_str().unwrap();
        assert!(
            out.inference_trace
                .iter()
                .any(|t| t.kind == "frame-persist" && t.detail.contains(name)),
            "frame-persist must name {}",
            name
        );
    }
    assert_eq!(
        out.inference_trace
            .iter()
            .filter(|t| t.kind == "regress-step")
            .count() as u64,
        expected["regress_steps"].as_u64().unwrap()
    );
}

/// McCarthy 1980 — bird/penguin abnormality minimization.
#[test]
fn circumscription_paper_grounded() {
    let Some((input, expected)) = p3_load("circumscription") else {
        return;
    };
    let out = dispatch_breed_test("circumscription", &input).expect("run ok");
    for (atom, val) in expected["entailed"].as_object().unwrap() {
        let want = val.as_bool().unwrap().to_string();
        assert!(
            out.facts
                .iter()
                .any(|f| f.key == format!("entailed:{}", atom) && f.value == want),
            "entailed:{} must be {}",
            atom,
            want
        );
    }
    assert!(!out.inference_trace.is_empty());
}

/// Falkenhainer, Forbus & Gentner 1989 — solar-system/atom mapping.
#[test]
fn analogy_sme_paper_grounded() {
    let Some((input, expected)) = p3_load("analogy_sme") else {
        return;
    };
    let out = dispatch_breed_test("analogy_sme", &input).expect("run ok");
    for (b, t) in expected["mapping"].as_object().unwrap() {
        let want = t.as_str().unwrap();
        assert!(
            out.facts
                .iter()
                .any(|f| f.key == format!("map:{}", b) && f.value == want),
            "{} must map to {}",
            b,
            want
        );
    }
    let inference = expected["candidate_inference_contains"].as_str().unwrap();
    assert!(
        out.facts
            .iter()
            .any(|f| f.key.starts_with("inference:") && f.value == inference),
        "candidate inference must carry over the causal structure"
    );
}

/// Anderson & Lebiere 1998 — addition-fact retrieval by activation.
#[test]
fn act_r_paper_grounded() {
    let Some((input, expected)) = p3_load("act_r") else {
        return;
    };
    let out = dispatch_breed_test("act_r", &input).expect("run ok");
    assert_eq!(
        out.selected.as_deref(),
        expected["retrieved"].as_str(),
        "fact34 must be retrieved"
    );
    let sum = &expected["sum_fact"];
    assert!(
        out.facts
            .iter()
            .any(|f| f.key == sum["key"].as_str().unwrap()
                && f.value == sum["value"].as_str().unwrap()),
        "the retrieved chunk's sum slot must reach working memory"
    );
    // Activation A = B + ΣW·S asserted from the trace detail.
    let a_expect = expected["activation_fact34"].as_f64().unwrap();
    let tol = expected["activation_tolerance"].as_f64().unwrap();
    let retrieve = out
        .inference_trace
        .iter()
        .find(|t| t.kind == "retrieve-chunk")
        .expect("retrieve-chunk step");
    let i = retrieve.detail.find("A=").unwrap() + 2;
    let j = retrieve.detail[i..].find(' ').unwrap() + i;
    let a: f64 = retrieve.detail[i..j].parse().unwrap();
    assert!(
        (a - a_expect).abs() < tol,
        "activation {} vs {}",
        a,
        a_expect
    );
}

/// De Raedt, Kimmig & Toivonen 2007 — P(wet) = 0.552 exact to 1e-6.
#[test]
fn problog_paper_grounded() {
    let Some((input, expected)) = p3_load("problog") else {
        return;
    };
    let out = dispatch_breed_test("problog", &input).expect("run ok");
    let p: f64 = out
        .facts
        .iter()
        .find(|f| f.key == "prob:wet")
        .expect("prob:wet fact")
        .value
        .parse()
        .unwrap();
    let want = expected["probability"].as_f64().unwrap();
    let tol = expected["tolerance"].as_f64().unwrap();
    assert!((p - want).abs() < tol, "P(wet) = {} must equal {}", p, want);
    assert_eq!(
        out.inference_trace
            .iter()
            .filter(|t| t.kind == "enumerate-world")
            .count() as u64,
        expected["worlds"].as_u64().unwrap()
    );
}

/// Marques-Silva & Sakallah 1999 — GRASP conflict learning on PHP(3,2).
#[test]
fn sat_cdcl_paper_grounded() {
    let Some((input, expected)) = p3_load("sat_cdcl") else {
        return;
    };
    let out = dispatch_breed_test("sat_cdcl", &input).expect("run ok");
    assert_eq!(out.selected.as_deref(), expected["verdict"].as_str());
    let learned = out
        .inference_trace
        .iter()
        .filter(|t| t.kind == "learn-clause")
        .count() as u64;
    assert!(
        learned >= expected["min_learned_clauses"].as_u64().unwrap(),
        "GRASP-style learning must fire"
    );
}

/// Tulving 1983 / Nuxoll & Laird 2007 — temporal organisation of recall.
#[test]
fn episodic_memory_paper_grounded() {
    let Some((input, expected)) = p3_load("episodic_memory") else {
        return;
    };
    let out = dispatch_breed_test("episodic_memory", &input).expect("run ok");
    assert_eq!(out.selected.as_deref(), expected["recalled"].as_str());
    let tol = expected["tolerance"].as_f64().unwrap();
    for (id, key) in [
        ("ep-breakfast", "score_breakfast"),
        ("ep-dinner", "score_dinner"),
    ] {
        let got: f64 = out
            .facts
            .iter()
            .find(|f| f.key == format!("score:{}", id))
            .unwrap()
            .value
            .parse()
            .unwrap();
        let want = expected[key].as_f64().unwrap();
        assert!((got - want).abs() < tol, "{}: {} vs {}", id, got, want);
    }
}

/// Watkins & Dayan 1992 — Q-learning convergence to the Bellman fixed point.
#[test]
fn rl_symbolic_paper_grounded() {
    let Some((input, expected, full_json)) = p3_load_full("rl_symbolic") else {
        return;
    };
    assert_paper_grounded(&full_json);
    let out = dispatch_breed_test("rl_symbolic", &input).expect("run ok");
    assert_eq!(
        out.facts
            .iter()
            .find(|f| f.key == "policy:s0")
            .unwrap()
            .value,
        expected["policy_s0"].as_str().unwrap()
    );
    let tol = expected["tolerance"].as_f64().unwrap();
    for (key, ekey) in [("q:s0:go", "q_s0_go"), ("q:s0:stay", "q_s0_stay")] {
        let got: f64 = out
            .facts
            .iter()
            .find(|f| f.key == key)
            .unwrap_or_else(|| panic!("missing {}", key))
            .value
            .parse()
            .unwrap();
        let want = expected[ekey].as_f64().unwrap();
        assert!((got - want).abs() < tol, "{}: {} vs {}", key, got, want);
    }
}

/// Clarke, Emerson & Sistla 1986 — mutual exclusion safety AG !(c1 & c2).
#[test]
fn ctl_check_paper_grounded() {
    let Some((input, expected, full_json)) = p3_load_full("ctl_check") else {
        return;
    };
    assert_paper_grounded(&full_json);
    let out = dispatch_breed_test("ctl_check", &input).expect("run ok");
    assert_eq!(out.selected.as_deref(), expected["verdict"].as_str());
    assert!(
        !out.inference_trace
            .iter()
            .any(|t| t.kind == "counterexample-step"),
        "a holding safety property must have no counterexample"
    );
}

/// Quinlan 1990 — FOIL daughter/parent: body == {parent(V1,V0), female(V0)}.
#[test]
fn ilp_paper_grounded() {
    let Some((input, expected, full_json)) = p3_load_full("ilp") else {
        return;
    };
    assert_paper_grounded(&full_json);
    let out = dispatch_breed_test("ilp", &input).expect("run ok");
    let rules: Vec<&str> = out
        .facts
        .iter()
        .filter(|f| f.key.starts_with("ilp:rule:"))
        .map(|f| f.value.as_str())
        .collect();
    assert_eq!(
        rules.len() as u64,
        expected["clause_count"].as_u64().unwrap()
    );
    let rule = rules[0];
    let (head, body) = rule.split_once(" :- ").expect("clause shape");
    assert_eq!(head, expected["head"].as_str().unwrap());
    let body_set: std::collections::BTreeSet<&str> = body.split(", ").collect();
    let want_set: std::collections::BTreeSet<&str> = expected["body_set"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(
        body_set, want_set,
        "learned body must equal the paper's definition as a set"
    );
}

/// Hayes 1979/1985 — the cup of water: cup falls, water spills, floor stays.
#[test]
fn naive_physics_paper_grounded() {
    let Some((input, expected, full_json)) = p3_load_full("naive_physics") else {
        return;
    };
    assert_paper_grounded(&full_json);
    let out = dispatch_breed_test("naive_physics", &input).expect("run ok");
    for f in expected["falls"].as_array().unwrap() {
        let key = format!("falls:{}", f.as_str().unwrap());
        assert!(out.facts.iter().any(|x| x.key == key), "missing {}", key);
    }
    for f in expected["spills"].as_array().unwrap() {
        let key = format!("spills:{}", f.as_str().unwrap());
        assert!(out.facts.iter().any(|x| x.key == key), "missing {}", key);
    }
    for f in expected["not_falls"].as_array().unwrap() {
        let key = format!("falls:{}", f.as_str().unwrap());
        assert!(
            !out.facts.iter().any(|x| x.key == key),
            "over-derivation: {}",
            key
        );
    }
}

// ============================================================================
// P4 tier paper-grounded tests
// ============================================================================

/// Load a P4 fixture's facts-only input. Panics on a malformed fixture once
/// the file exists; returns None (graceful skip) only when absent.
fn p4_fixture_input(path: &str) -> Option<(BreedInput, serde_json::Value)> {
    let content = fs::read_to_string(path).ok()?;
    let json: serde_json::Value =
        serde_json::from_str(&content).expect("fixture must be valid JSON");
    let inp = &json["input"];
    let facts = inp["facts"]
        .as_array()
        .expect("fixture input.facts must be an array")
        .iter()
        .map(|f| Fact {
            key: f["key"].as_str().expect("fact key").to_string(),
            value: f["value"].as_str().expect("fact value").to_string(),
        })
        .collect();
    let input = BreedInput {
        intent: inp["intent"].as_str().unwrap_or("test").to_string(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    Some((input, json["expected"].clone()))
}

fn fact_value<'a>(out: &'a BreedOutput, key: &str) -> &'a str {
    &out.facts
        .iter()
        .find(|f| f.key == key)
        .unwrap_or_else(|| panic!("missing fact '{}'", key))
        .value
}

/// Smullyan 1968 — K axiom closes alpha-only.
#[test]
fn tableaux_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/tableaux.json") {
        let out = dispatch_breed_test("tableaux", &input).expect("run ok");
        assert_eq!(
            fact_value(&out, "tableaux:verdict"),
            exp["verdict"].as_str().unwrap()
        );
        assert_eq!(
            out.inference_trace
                .iter()
                .filter(|t| t.kind == "beta-expand")
                .count() as u64,
            exp["beta_expansions"].as_u64().unwrap(),
            "Smullyan K-axiom proof must use zero beta expansions"
        );
        assert!(!out.inference_trace.is_empty());
    }
}

/// Goldberg 1995 — 'pat faxed bill the letter' is the ditransitive
/// construction; transitive 'fax' is coerced.
#[test]
fn construction_grammar_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/construction_grammar.json")
    {
        let out = dispatch_breed_test("construction_grammar", &input).expect("run ok");
        assert_eq!(
            fact_value(&out, "cxg:construction"),
            exp["construction"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "cxg:coerced"),
            exp["coerced"].as_str().unwrap()
        );
        assert!(fact_value(&out, "cxg:meaning").starts_with(exp["meaning_frame"].as_str().unwrap()));
        assert_eq!(
            fact_value(&out, "cxg:slot:rec"),
            exp["slot_rec"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "cxg:slot:theme"),
            exp["slot_theme"].as_str().unwrap()
        );
    }
}

/// Richardson & Domingos 2006 — smokes/friends ground MLN MAP state.
#[test]
fn markov_logic_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/markov_logic.json") {
        let out = dispatch_breed_test("markov_logic", &input).expect("run ok");
        assert_eq!(fact_value(&out, "mln:cost"), exp["cost"].as_str().unwrap());
        assert_eq!(
            fact_value(&out, "mln:atom:smokes_bob"),
            exp["smokes_bob"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "mln:atom:cancer_anna"),
            exp["cancer_anna"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "mln:atom:cancer_bob"),
            exp["cancer_bob"].as_str().unwrap()
        );
    }
}

/// Kaelbling, Littman & Cassandra 1998 — tiger posterior 0.85 after hear-left.
#[test]
fn pomdp_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/pomdp.json") {
        let out = dispatch_breed_test("pomdp", &input).expect("run ok");
        assert_eq!(
            fact_value(&out, "pomdp:belief:tiger-left"),
            exp["belief_tiger_left"].as_str().unwrap()
        );
        assert!(out.inference_trace.iter().any(|t| t.kind == "pbvi-backup"));
    }
}

/// Russell & Norvig AIMA §4.3.2 — vacuum AND-OR conditional plan.
#[test]
fn contingent_plan_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/contingent_plan.json") {
        let out = dispatch_breed_test("contingent_plan", &input).expect("run ok");
        assert_eq!(
            fact_value(&out, "plan:tree"),
            exp["plan_tree"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "plan:tree").matches("(sense ").count() as u64,
            exp["sense_nodes"].as_u64().unwrap()
        );
    }
}

/// Cox & Raja 2011 — meta-level detects the object-level conflict and arbitrates.
#[test]
fn meta_reasoning_paper_grounded() {
    if let Some((input, exp)) = p4_fixture_input("tests/fixtures/papers/meta_reasoning.json") {
        let out = dispatch_breed_test("meta_reasoning", &input).expect("run ok");
        assert_eq!(
            fact_value(&out, "meta:conflicts"),
            exp["conflicts"].as_str().unwrap()
        );
        assert_eq!(
            fact_value(&out, "meta:decision:therapy"),
            exp["decision_therapy"].as_str().unwrap()
        );
        assert_eq!(out.selected.as_deref(), exp["selected"].as_str());
    }
}

// ============================================================================
// P5 tier — paper-grounded tests for morphological, triz, ocpm_route_discoverer
// ============================================================================

/// Zwicky 1969 — propulsive system morphology: lex-first surviving combination.
///
/// Fixture encodes the 6-parameter jet-engine morphological field from
/// Zwicky's 1947/1969 work, with one exclusion constraint. The breed must
/// enumerate all combinations (4×4×3×3×2×2 = 576 raw), apply the exclusion,
/// and select the lexicographically first surviving combination.
/// Expected: chemical-reactions=self-contained + operating-mode=continuous +
///           propellant-state=gaseous + reactivity=external-ignition +
///           thrust-augmentation-1=translatory-motion + thrust-augmentation-2=no-augmentation
#[test]
fn morphological_paper_grounded() {
    let path = "tests/fixtures/papers/morphological.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    let json = serde_json::from_str::<serde_json::Value>(&content)
        .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));

    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .unwrap_or_else(|e| panic!("fixture {} input parse: {}", path, e));

    let out = dispatch_breed_test("morphological", &input)
        .expect("morphological paper-grounded run must succeed");

    assert_eq!(
        out.breed,
        BreedId::Morphological,
        "breed id must be Morphological"
    );
    assert!(!out.explanation.is_empty(), "explanation must be non-empty");

    // Paper-grounded numeric assertion: the expected selected combination per fixture.
    let expected_selected = json["expected"]["selected"]
        .as_str()
        .expect("fixture must declare expected.selected");
    assert_eq!(
        out.selected.as_deref(),
        Some(expected_selected),
        "Morphological must select '{}' per Zwicky 1969 lex-first surviving combination; \
         got {:?}",
        expected_selected,
        out.selected
    );
}

/// Altshuller 1984 — TRIZ contradiction matrix: weight vs strength → principles 40,26.
///
/// Fixture encodes the classic technical contradiction (improving=weight, worsening=strength)
/// from Altshuller's contradiction matrix. The breed must apply the matrix rule and return
/// the exact principles string "principles=40,26".
#[test]
fn triz_paper_grounded() {
    let path = "tests/fixtures/papers/triz.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    let json = serde_json::from_str::<serde_json::Value>(&content)
        .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));

    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .unwrap_or_else(|e| panic!("fixture {} input parse: {}", path, e));

    let out = dispatch_breed_test("triz", &input).expect("triz paper-grounded run must succeed");

    assert_eq!(out.breed, BreedId::Triz, "breed id must be Triz");
    assert!(!out.explanation.is_empty(), "explanation must be non-empty");

    // Paper-grounded assertion: Altshuller 1984 contradiction matrix cell (weight, strength)
    // yields inventive principles 40 and 26.
    let expected_principles = json["expected"]["principles"]
        .as_str()
        .expect("fixture must declare expected.principles");
    let principles_found = out
        .inference_trace
        .iter()
        .any(|t| t.detail.contains(expected_principles))
        || out.explanation.contains(expected_principles)
        || out
            .selected
            .as_deref()
            .map(|s| s.contains(expected_principles))
            .unwrap_or(false)
        || out
            .facts
            .iter()
            .any(|f| f.value.contains(expected_principles));
    assert!(
        principles_found,
        "TRIZ must derive '{}' for (improving=weight, worsening=strength) \
         per Altshuller 1984 contradiction matrix; selected={:?}",
        expected_principles, out.selected
    );
}

/// van der Aalst 2019 — object-centric route discovery: o1→Create→Pay, i1→Create→Ship.
///
/// Fixture encodes a minimal OCEL with 3 events and 2 object types (orders, items).
/// The breed must discover routes per object: order o1 follows Create→Pay,
/// item i1 follows Create→Ship.
#[test]
fn ocpm_route_discoverer_paper_grounded() {
    let path = "tests/fixtures/papers/ocpm_route_discoverer.json";
    let content = fs::read_to_string(path).unwrap_or_else(|_| {
        panic!(
            "MISSING FIXTURE: {} — paper-grounded tests must not skip",
            path
        )
    });
    let json = serde_json::from_str::<serde_json::Value>(&content)
        .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {}: {}", path, e));

    let input: BreedInput = serde_json::from_value(json["input"].clone())
        .unwrap_or_else(|e| panic!("fixture {} input parse: {}", path, e));

    let out = dispatch_breed_test("ocpm_route_discoverer", &input)
        .expect("ocpm_route_discoverer paper-grounded run must succeed");

    assert_eq!(
        out.breed,
        BreedId::OcpmRouteDiscoverer,
        "breed id must be OcpmRouteDiscoverer"
    );
    assert!(!out.explanation.is_empty(), "explanation must be non-empty");

    // Paper-grounded assertion: van der Aalst 2019 — each object must have a discovered route.
    let expected_routes = json["expected"]["routes"]
        .as_object()
        .expect("fixture must declare expected.routes as an object");
    for (route_key, route_val) in expected_routes {
        let expected_route = route_val
            .as_str()
            .unwrap_or_else(|| panic!("route value for {} must be a string", route_key));
        let found = out
            .facts
            .iter()
            .any(|f| f.key == *route_key && f.value == expected_route)
            || out
                .inference_trace
                .iter()
                .any(|t| t.detail.contains(expected_route))
            || out.explanation.contains(expected_route);
        assert!(
            found,
            "OcpmRouteDiscoverer must derive route '{}' = '{}' \
             per van der Aalst 2019 object-centric route discovery; \
             output facts: {:?}",
            route_key,
            expected_route,
            out.facts
                .iter()
                .map(|f| format!("{}={}", f.key, f.value))
                .collect::<Vec<_>>()
        );
    }
}
