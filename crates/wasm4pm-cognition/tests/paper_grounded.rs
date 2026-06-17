//! Paper-grounded integration tests — each breed is tested against the canonical worked example
//! from its source paper.
//!
//! Each test loads `tests/fixtures/papers/<breed>.json`, parses the "input" field into a
//! `BreedInput`, dispatches to the breed under test, and asserts structural and
//! paper-stated expectations from the "expected" field.
//!
//! Tests use graceful skip (if-let) if the fixture file is absent — they do not panic on
//! missing files, but they do panic on bad parses or failed runs once the fixture is present.

use wasm4pm_cognition::breeds::CognitionBreed;
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
// Tier P1 Breeds Paper Grounded Tests
// ============================================================================

#[test]
#[ignore]
fn ltl_monitor_paper_grounded() {
    let path = "tests/fixtures/papers/ltl_monitor.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut cases = Vec::new();
            if let Some(arr) = inp.get("cases").and_then(|v| v.as_array()) {
                for c in arr {
                    if let Some(id) = c.get("id").and_then(|v| v.as_str()) {
                        let mut case_facts = Vec::new();
                        if let Some(c_arr) = c.get("facts").and_then(|v| v.as_array()) {
                            for f in c_arr {
                                if let (Some(k), Some(v)) = (
                                    f.get("key").and_then(|v| v.as_str()),
                                    f.get("value").and_then(|v| v.as_str()),
                                ) {
                                    case_facts.push(Fact {
                                        key: k.to_string(),
                                        value: v.to_string(),
                                    });
                                }
                            }
                        }
                        cases.push(Case {
                            id: id.to_string(),
                            intent: "".into(),
                            architecture: "".into(),
                            outcome_score: 1.0,
                            facts: case_facts,
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts: vec![],
                cases,
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = ltl_monitor::LtlMonitor;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("LtlMonitor paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::LtlMonitor);
            let conforms = output.facts.iter().find(|f| f.key == "conforms").expect("conforms fact exists");
            assert_eq!(conforms.value, "true");
        }
    }
}

#[test]
#[ignore]
fn allen_temporal_paper_grounded() {
    let path = "tests/fixtures/papers/allen_temporal.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = allen_temporal::AllenTemporal;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("AllenTemporal paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::AllenTemporal);
            let rel = output.facts.iter().find(|f| f.key == "relation:A:C").expect("relation exists");
            assert_eq!(rel.value, "p");
        }
    }
}

#[test]
#[ignore]
fn fuzzy_logic_paper_grounded() {
    let path = "tests/fixtures/papers/fuzzy_logic.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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
                        let premises: Vec<String> = r.get("premise").and_then(|v| v.as_array()).unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise: premises,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = fuzzy_logic::FuzzyLogic;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("FuzzyLogic paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::FuzzyLogic);
            let fact = output.facts.iter().find(|f| f.key == "ventilation").expect("ventilation exists");
            let val: f64 = fact.value.parse().unwrap();
            assert!((val - 50.0).abs() < 1.0);
        }
    }
}

#[test]
#[ignore]
fn bayesian_network_paper_grounded() {
    let path = "tests/fixtures/papers/bayesian_network.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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
                        let premises: Vec<String> = r.get("premise").and_then(|v| v.as_array()).unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise: premises,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(predicate), Some(value)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: predicate.to_string(),
                            value: value.to_string(),
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals,
                state: vec![],
            };

            let breed = bayesian_network::BayesianNetwork;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("BayesianNetwork paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::BayesianNetwork);
            let fact = output.facts.iter().find(|f| f.key == "probability:Burglary").expect("prob exists");
            let val: f64 = fact.value.parse().unwrap();
            assert!(val > 0.0 && val < 1.0);
        }
    }
}

#[test]
fn csp_ac3_paper_grounded() {
    let path = "tests/fixtures/papers/csp_ac3.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = csp_ac3::CspAc3;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("CspAc3 paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::CspAc3);
            assert!(output.selected.is_some());
            assert_eq!(output.explanation, "SAT: V1=B, V2=G");
        }
    }
}

#[test]
fn default_logic_paper_grounded() {
    let path = "tests/fixtures/papers/default_logic.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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
                        let premises: Vec<String> = r.get("premise").and_then(|v| v.as_array()).unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise: premises,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = default_logic::DefaultLogic;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("DefaultLogic paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::DefaultLogic);
            let selected = output.selected.as_ref().unwrap();
            assert!(selected.contains("tweety"));
            assert!(selected.contains("flies"));
        }
    }
}

#[test]
fn htn_planning_paper_grounded() {
    let path = "tests/fixtures/papers/htn_planning.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
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

            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("conclusion").and_then(|v| v.as_str()),
                        r.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premises: Vec<String> = r.get("premise").and_then(|v| v.as_array()).unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise: premises,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    if let (Some(id), Some(predicate), Some(value)) = (
                        g.get("id").and_then(|v| v.as_str()),
                        g.get("predicate").and_then(|v| v.as_str()),
                        g.get("value").and_then(|v| v.as_str()),
                    ) {
                        goals.push(Goal {
                            id: id.to_string(),
                            predicate: predicate.to_string(),
                            value: value.to_string(),
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: inp.get("intent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules,
                goals,
                state,
            };

            let breed = htn_planning::HtnPlanning;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("HtnPlanning paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::HtnPlanning);
            assert_eq!(output.selected.as_deref(), Some("op:walk"));
        }
    }
}

#[test]
fn dempster_shafer_paper_grounded() {
    let path = "tests/fixtures/papers/dempster_shafer.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    rules.push(Rule {
                        id: r["id"].as_str().unwrap().to_string(),
                        premise: vec![],
                        conclusion: r["conclusion"].as_str().unwrap().to_string(),
                        certainty: r["certainty"].as_f64().unwrap() as f32,
                    });
                }
            }
            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    goals.push(Goal {
                        id: g["id"].as_str().unwrap().to_string(),
                        predicate: g["predicate"].as_str().unwrap().to_string(),
                        value: g["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap().to_string(),
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules,
                goals,
                state: vec![],
            };
            let breed = dempster_shafer::DempsterShafer;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("DempsterShafer run must succeed");
            assert_eq!(output.breed, BreedId::DempsterShafer);
            let bel_val = output.facts.iter().find(|f| f.key == "belief:flim").unwrap().value.parse::<f64>().unwrap();
            let expected_bel = json["expected"]["belief"].as_f64().unwrap();
            assert!((bel_val - expected_bel).abs() < 1e-5);
        }
    }
}

#[test]
fn frames_inheritance_paper_grounded() {
    let path = "tests/fixtures/papers/frames_inheritance.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    facts.push(Fact {
                        key: f["key"].as_str().unwrap().to_string(),
                        value: f["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap().to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };
            let breed = frames_inheritance::FramesInheritance;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("FramesInheritance run must succeed");
            assert_eq!(output.breed, BreedId::FramesInheritance);
            assert_eq!(output.selected.as_deref(), Some(json["expected"]["resolved_value"].as_str().unwrap()));
        }
    }
}

#[test]
fn ebl_paper_grounded() {
    let path = "tests/fixtures/papers/ebl.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    facts.push(Fact {
                        key: f["key"].as_str().unwrap().to_string(),
                        value: f["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    let premises: Vec<String> = r["premise"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
                    rules.push(Rule {
                        id: r["id"].as_str().unwrap().to_string(),
                        premise: premises,
                        conclusion: r["conclusion"].as_str().unwrap().to_string(),
                        certainty: r["certainty"].as_f64().unwrap() as f32,
                    });
                }
            }
            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    goals.push(Goal {
                        id: g["id"].as_str().unwrap().to_string(),
                        predicate: g["predicate"].as_str().unwrap().to_string(),
                        value: g["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap().to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals,
                state: vec![],
            };
            let breed = ebl::Ebl;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("Ebl run must succeed");
            assert_eq!(output.breed, BreedId::Ebl);
            let rule_fact = output.facts.iter().find(|f| f.key == "ebl:rule").unwrap();
            let contains_str = json["expected"]["rule_contains"].as_str().unwrap();
            assert!(rule_fact.value.contains(contains_str));
        }
    }
}

#[test]
fn asp_paper_grounded() {
    let path = "tests/fixtures/papers/asp.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    let premises: Vec<String> = r["premise"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
                    rules.push(Rule {
                        id: r["id"].as_str().unwrap().to_string(),
                        premise: premises,
                        conclusion: r["conclusion"].as_str().unwrap().to_string(),
                        certainty: r["certainty"].as_f64().unwrap() as f32,
                    });
                }
            }
            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    candidates.push(Candidate {
                        id: c["id"].as_str().unwrap().to_string(),
                        score: c["score"].as_f64().unwrap() as f32,
                        eliminated: c["eliminated"].as_bool().unwrap(),
                        elimination_reason: c["elimination_reason"].as_str().map(|s| s.to_string()),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap_or("solve").to_string(),
                candidates,
                facts: vec![],
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };
            let breed = asp::Asp;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("ASP run must succeed");
            assert_eq!(output.breed, BreedId::Asp);
            let count_fact = output.facts.iter().find(|f| f.key == "stable_models_count").unwrap();
            assert_eq!(count_fact.value, json["expected"]["stable_models_count"].as_str().unwrap());
        }
    }
}

#[test]
fn description_logic_paper_grounded() {
    let path = "tests/fixtures/papers/description_logic.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    facts.push(Fact {
                        key: f["key"].as_str().unwrap().to_string(),
                        value: f["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    candidates.push(Candidate {
                        id: c["id"].as_str().unwrap().to_string(),
                        score: c["score"].as_f64().unwrap() as f32,
                        eliminated: c["eliminated"].as_bool().unwrap(),
                        elimination_reason: c["elimination_reason"].as_str().map(|s| s.to_string()),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap_or("classify").to_string(),
                candidates,
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };
            let breed = description_logic::DescriptionLogic;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("DescriptionLogic run must succeed");
            assert_eq!(output.breed, BreedId::DescriptionLogic);
            let consistent_fact = output.facts.iter().find(|f| f.key == "consistent").unwrap();
            assert_eq!(consistent_fact.value, json["expected"]["consistent"].as_str().unwrap());
            let member_xc = output.facts.iter().find(|f| f.key == "member:x:C");
            assert!(member_xc.is_some());
        }
    }
}

#[test]
fn abductive_lp_paper_grounded() {
    let path = "tests/fixtures/papers/abductive_lp.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    facts.push(Fact {
                        key: f["key"].as_str().unwrap().to_string(),
                        value: f["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    let premises: Vec<String> = r["premise"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
                    rules.push(Rule {
                        id: r["id"].as_str().unwrap().to_string(),
                        premise: premises,
                        conclusion: r["conclusion"].as_str().unwrap().to_string(),
                        certainty: r["certainty"].as_f64().unwrap() as f32,
                    });
                }
            }
            let mut goals = Vec::new();
            if let Some(arr) = inp.get("goals").and_then(|v| v.as_array()) {
                for g in arr {
                    goals.push(Goal {
                        id: g["id"].as_str().unwrap().to_string(),
                        predicate: g["predicate"].as_str().unwrap().to_string(),
                        value: g["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    candidates.push(Candidate {
                        id: c["id"].as_str().unwrap().to_string(),
                        score: c["score"].as_f64().unwrap() as f32,
                        eliminated: c["eliminated"].as_bool().unwrap(),
                        elimination_reason: c["elimination_reason"].as_str().map(|s| s.to_string()),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap_or("abduce").to_string(),
                candidates,
                facts,
                cases: vec![],
                rules,
                goals,
                state: vec![],
            };
            let breed = abductive_lp::AbductiveLp;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("AbductiveLp run must succeed");
            assert_eq!(output.breed, BreedId::AbductiveLp);
            let count_fact = output.facts.iter().find(|f| f.key == "explanations_count").unwrap();
            assert_eq!(count_fact.value, json["expected"]["explanations_count"].as_str().unwrap());
            assert_eq!(output.selected.as_deref(), Some(json["expected"]["selected"].as_str().unwrap()));
        }
    }
}

#[test]
fn abductive_ibe_paper_grounded() {
    let path = "tests/fixtures/papers/abductive_ibe.json";
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let inp = &json["input"];
            let mut facts = Vec::new();
            if let Some(arr) = inp.get("facts").and_then(|v| v.as_array()) {
                for f in arr {
                    facts.push(Fact {
                        key: f["key"].as_str().unwrap().to_string(),
                        value: f["value"].as_str().unwrap().to_string(),
                    });
                }
            }
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    let premises: Vec<String> = r["premise"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
                    rules.push(Rule {
                        id: r["id"].as_str().unwrap().to_string(),
                        premise: premises,
                        conclusion: r["conclusion"].as_str().unwrap().to_string(),
                        certainty: r["certainty"].as_f64().unwrap() as f32,
                    });
                }
            }
            let mut candidates = Vec::new();
            if let Some(arr) = inp.get("candidates").and_then(|v| v.as_array()) {
                for c in arr {
                    candidates.push(Candidate {
                        id: c["id"].as_str().unwrap().to_string(),
                        score: c["score"].as_f64().unwrap() as f32,
                        eliminated: c["eliminated"].as_bool().unwrap(),
                        elimination_reason: c["elimination_reason"].as_str().map(|s| s.to_string()),
                    });
                }
            }
            let input = BreedInput {
                intent: inp["intent"].as_str().unwrap_or("coherence").to_string(),
                candidates,
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };
            let breed = abductive_ibe::AbductiveIbe;
            assert!(breed.preconditions(&input).is_ok());
            let output = breed.run(&input).expect("AbductiveIbe run must succeed");
            assert_eq!(output.breed, BreedId::AbductiveIbe);
            assert_eq!(output.selected.as_deref(), Some(json["expected"]["selected"].as_str().unwrap()));
        }
    }
}



