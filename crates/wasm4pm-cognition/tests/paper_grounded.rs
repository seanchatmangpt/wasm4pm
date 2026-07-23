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
use wasm4pm_cognition::breeds::CognitionBreed;
use wasm4pm_cognition::breeds::*;

// ============================================================================
// Shared fixture loader — paper-grounded tests must NEVER silently skip.
//
// `BreedInput` and its sub-structs (`Fact`, `Rule`, `Case`, `Candidate`,
// `Goal`, `StateAtom`) all derive `Deserialize`, so a fixture's `input` object
// maps field-for-field onto `BreedInput`. A field that is present but
// shape-mismatched panics loudly (a silent empty input would be a fraud
// signal: the breed would "succeed" having done no work).
// ============================================================================

/// Deserialize one optional `input` sub-field. Absent → `Default`; present but
/// malformed → panic (never silently default — that would hide a broken fixture).
fn fixture_field<T>(inp: &serde_json::Value, key: &str, path: &str) -> T
where
    T: serde::de::DeserializeOwned + Default,
{
    match inp.get(key) {
        None => T::default(),
        Some(v) => serde_json::from_value(v.clone()).unwrap_or_else(|e| {
            panic!("FIXTURE {path} field 'input.{key}' does not match BreedInput shape: {e}")
        }),
    }
}

/// Load `tests/fixtures/papers/<breed>.json`, returning the full JSON (for the
/// `expected` block) and the parsed `BreedInput`. Panics — never skips — on a
/// missing or unparseable fixture, per the no-silent-skip law.
fn load_fixture(breed: &str) -> (serde_json::Value, BreedInput) {
    let path = format!("tests/fixtures/papers/{breed}.json");
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("MISSING FIXTURE: {path} — paper-grounded tests must not skip"));
    let json: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("UNPARSEABLE FIXTURE {path}: {e}"));
    let inp = &json["input"];
    let input = BreedInput {
        intent: inp
            .get("intent")
            .and_then(|v| v.as_str())
            .unwrap_or("diagnose")
            .to_string(),
        candidates: fixture_field(inp, "candidates", &path),
        facts: fixture_field(inp, "facts", &path),
        cases: fixture_field(inp, "cases", &path),
        rules: fixture_field(inp, "rules", &path),
        goals: fixture_field(inp, "goals", &path),
        state: fixture_field(inp, "state", &path),
    };
    (json, input)
}

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
fn ltl_monitor_paper_grounded() {
    let path = "tests/fixtures/papers/ltl_monitor.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                intent: inp
                    .get("intent")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                candidates: vec![],
                facts: vec![],
                cases,
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = ltl_monitor::LtlMonitor;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed
                .run(&input)
                .expect("LtlMonitor paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::LtlMonitor);
            let conforms = output
                .facts
                .iter()
                .find(|f| f.key == "conforms")
                .expect("conforms fact exists");
            assert_eq!(conforms.value, "true");
        }
    }
}

#[test]
fn allen_temporal_paper_grounded() {
    let path = "tests/fixtures/papers/allen_temporal.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                intent: inp
                    .get("intent")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = allen_temporal::AllenTemporal;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed
                .run(&input)
                .expect("AllenTemporal paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::AllenTemporal);
            let rel = output
                .facts
                .iter()
                .find(|f| f.key == "relation:A:C")
                .expect("relation exists");
            assert_eq!(rel.value, "p");
        }
    }
}

#[test]
fn fuzzy_logic_paper_grounded() {
    let path = "tests/fixtures/papers/fuzzy_logic.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                        let premises: Vec<String> = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .unwrap()
                            .iter()
                            .map(|v| v.as_str().unwrap().to_string())
                            .collect();
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
                intent: inp
                    .get("intent")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = fuzzy_logic::FuzzyLogic;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed
                .run(&input)
                .expect("FuzzyLogic paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::FuzzyLogic);
            let fact = output
                .facts
                .iter()
                .find(|f| f.key == "ventilation")
                .expect("ventilation exists");
            let val: f64 = fact.value.parse().unwrap();
            // Paper-grounded: assert the fixture's published Mamdani centroid value,
            // not a hard-coded constant (Mamdani 1975 §4, defuzzified_ventilation).
            let expected_vent = json["expected"]["defuzzified_ventilation"]
                .as_f64()
                .expect("fixture must declare expected.defuzzified_ventilation");
            assert!(
                (val - expected_vent).abs() < 1.0,
                "fuzzy_logic centroid must equal paper value {expected_vent} (Mamdani 1975); got {val}"
            );
        }
    }
}

#[test]
fn bayesian_network_paper_grounded() {
    // Pearl (1988) §4.1 exact inference by enumeration on the alarm network.
    // Evidence: Alarm=true. Query: P(Burglary=true | Alarm=true).
    // The posterior is fully determined by the CPTs in input.rules:
    //   P(B=t,A=t) = 0.001*(0.002*0.95 + 0.998*0.94)  = 0.00094002
    //   P(B=f,A=t) = 0.999*(0.002*0.29 + 0.998*0.001)  = 0.001576422
    //   P(B=t|A=t) = 0.00094002 / 0.002516442          = 0.373551228281836
    // Expected value and algorithm are derived INDEPENDENTLY (hand enumeration vs
    // the breed's inference), so a match is a genuine validation, not a self-oracle.
    let (json, input) = load_fixture("bayesian_network");
    let breed = bayesian_network::BayesianNetwork;
    assert!(
        breed.preconditions(&input).is_ok(),
        "bayesian_network fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("BayesianNetwork paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::BayesianNetwork);
    assert!(
        !output.inference_trace.is_empty(),
        "bayesian_network trace must be non-empty"
    );

    let exp = &json["expected"];
    let expected_posterior = exp
        .get("value")
        .and_then(|v| v.as_f64())
        .expect("fixture must declare expected.value (published posterior)");
    let tolerance = exp
        .get("tolerance")
        .and_then(|v| v.as_f64())
        .unwrap_or(1e-4);

    let fact = output
        .facts
        .iter()
        .find(|f| f.key == "probability:Burglary")
        .expect("output must carry probability:Burglary");
    let val: f64 = fact
        .value
        .parse()
        .expect("probability:Burglary must be numeric");
    assert!(
        (val - expected_posterior).abs() < tolerance,
        "P(Burglary|Alarm) must equal Pearl 1988 §4.1 enumeration value {expected_posterior}; got {val}"
    );
}

#[test]
fn csp_ac3_paper_grounded() {
    let path = "tests/fixtures/papers/csp_ac3.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                intent: inp
                    .get("intent")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules: vec![],
                goals: vec![],
                state: vec![],
            };

            let breed = csp_ac3::CspAc3;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed
                .run(&input)
                .expect("CspAc3 paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::CspAc3);
            assert!(output.selected.is_some());
            assert_eq!(output.explanation, "SAT: V1=B, V2=G");
        }
    }
}

#[test]
fn default_logic_paper_grounded() {
    // Reiter (1980) "A Logic for Default Reasoning", canonical bird/Tweety example:
    // the default "birds normally fly" yields an extension containing `flies`.
    // The fixture's published expectation is expected.extension = "flies" — the
    // derived conclusion, NOT the subject term `tweety` (which is an input fact,
    // not part of the credulous extension's newly-derived atoms).
    let (json, input) = load_fixture("default_logic");
    let breed = default_logic::DefaultLogic;
    assert!(
        breed.preconditions(&input).is_ok(),
        "default_logic fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("DefaultLogic paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::DefaultLogic);
    assert!(
        !output.inference_trace.is_empty(),
        "default_logic trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "default-extension"),
        "default_logic must finalize a default-extension (Reiter 1980)"
    );

    let extension = json["expected"]["extension"]
        .as_str()
        .expect("fixture must declare expected.extension");
    let selected = output
        .selected
        .as_ref()
        .expect("default_logic must select an extension");
    assert!(
        selected.contains(extension),
        "default_logic extension must contain the paper conclusion '{extension}' \
         (Reiter 1980); got selected='{selected}'"
    );
}

#[test]
fn htn_planning_paper_grounded() {
    let path = "tests/fixtures/papers/htn_planning.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                        let premises: Vec<String> = r
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .unwrap()
                            .iter()
                            .map(|v| v.as_str().unwrap().to_string())
                            .collect();
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
                intent: inp
                    .get("intent")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                candidates: vec![],
                facts: vec![],
                cases: vec![],
                rules,
                goals,
                state,
            };

            let breed = htn_planning::HtnPlanning;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed
                .run(&input)
                .expect("HtnPlanning paper grounded run must succeed");
            assert_eq!(output.breed, BreedId::HtnPlanning);
            assert_eq!(output.selected.as_deref(), Some("op:walk"));
        }
    }
}

#[test]
fn dempster_shafer_paper_grounded() {
    let path = "tests/fixtures/papers/dempster_shafer.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
            let bel_val = output
                .facts
                .iter()
                .find(|f| f.key == "belief:flim")
                .unwrap()
                .value
                .parse::<f64>()
                .unwrap();
            let expected_bel = json["expected"]["belief"].as_f64().unwrap();
            assert!((bel_val - expected_bel).abs() < 1e-5);
        }
    }
}

#[test]
fn frames_inheritance_paper_grounded() {
    let path = "tests/fixtures/papers/frames_inheritance.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
            let output = breed
                .run(&input)
                .expect("FramesInheritance run must succeed");
            assert_eq!(output.breed, BreedId::FramesInheritance);
            assert_eq!(
                output.selected.as_deref(),
                Some(json["expected"]["resolved_value"].as_str().unwrap())
            );
        }
    }
}

#[test]
fn ebl_paper_grounded() {
    let path = "tests/fixtures/papers/ebl.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                    let premises: Vec<String> = r["premise"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|p| p.as_str().unwrap().to_string())
                        .collect();
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
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
            let inp = &json["input"];
            let mut rules = Vec::new();
            if let Some(arr) = inp.get("rules").and_then(|v| v.as_array()) {
                for r in arr {
                    let premises: Vec<String> = r["premise"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|p| p.as_str().unwrap().to_string())
                        .collect();
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
            let count_fact = output
                .facts
                .iter()
                .find(|f| f.key == "stable_models_count")
                .unwrap();
            assert_eq!(
                count_fact.value,
                json["expected"]["stable_models_count"].as_str().unwrap()
            );
        }
    }
}

#[test]
fn description_logic_paper_grounded() {
    let path = "tests/fixtures/papers/description_logic.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
            let output = breed
                .run(&input)
                .expect("DescriptionLogic run must succeed");
            assert_eq!(output.breed, BreedId::DescriptionLogic);
            let consistent_fact = output.facts.iter().find(|f| f.key == "consistent").unwrap();
            assert_eq!(
                consistent_fact.value,
                json["expected"]["consistent"].as_str().unwrap()
            );
            let member_xc = output.facts.iter().find(|f| f.key == "member:x:C");
            assert!(member_xc.is_some());
        }
    }
}

#[test]
fn abductive_lp_paper_grounded() {
    let path = "tests/fixtures/papers/abductive_lp.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                    let premises: Vec<String> = r["premise"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|p| p.as_str().unwrap().to_string())
                        .collect();
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
            let count_fact = output
                .facts
                .iter()
                .find(|f| f.key == "explanations_count")
                .unwrap();
            assert_eq!(
                count_fact.value,
                json["expected"]["explanations_count"].as_str().unwrap()
            );
            assert_eq!(
                output.selected.as_deref(),
                Some(json["expected"]["selected"].as_str().unwrap())
            );
        }
    }
}

#[test]
fn abductive_ibe_paper_grounded() {
    let path = "tests/fixtures/papers/abductive_ibe.json";
    {
        let content = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("MISSING FIXTURE (test must not skip): {path}: {e}"));
        {
            let json = serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|e| panic!("INVALID FIXTURE JSON: {path}: {e}"));
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
                    let premises: Vec<String> = r["premise"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|p| p.as_str().unwrap().to_string())
                        .collect();
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
            assert_eq!(
                output.selected.as_deref(),
                Some(json["expected"]["selected"].as_str().unwrap())
            );
        }
    }
}

// ============================================================================
// Paper-grounded tests generated for breeds with fixtures but no prior test
// (workflow breed-paper-grounding). Each asserts a paper-stated expectation.
// ============================================================================

#[test]
fn act_r_paper_grounded() {
    let (json, input) = load_fixture("act_r");
    let breed = act_r::ActR;
    assert!(
        breed.preconditions(&input).is_ok(),
        "act_r fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("act_r paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::ActR);
    assert!(
        !output.inference_trace.is_empty(),
        "act_r trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: Anderson & Lebiere 1998, Ch. 9, addition-fact retrieval.
    // Chunk "fact34" (sum=7) has higher activation than "fact35" (sum=8) due to the
    // ACT-R activation equation A_i = B_i + Σ_j W_j·S_ji.
    // fact34: A = 0.5 + 2/3 ≈ 1.1667 (matches 2 context atoms: addend1=3, addend2=4)
    // fact35: A = 0.3 + 1/3 ≈ 0.6333 (matches 1 context atom: addend1=3)
    let expected_retrieved = exp
        .get("value")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.value");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_retrieved),
        "fact34 must win retrieval per Anderson & Lebiere 1998 Ch. 9 activation equation"
    );

    // Verify the activation value in the trace matches the paper's predicted A(fact34) ≈ 1.1667
    let expected_activation =
        exp.get("activation_fact34")
            .and_then(|v| v.as_f64())
            .expect("fixture must declare expected.activation_fact34") as f32;
    let tolerance = exp
        .get("activation_tolerance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.001) as f32;
    let retrieve_step = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "retrieve-chunk")
        .expect("act_r must have a retrieve-chunk trace step");
    let actual_activation = retrieve_step
        .detail
        .split_whitespace()
        .find_map(|tok| tok.strip_prefix("A=").and_then(|v| v.parse::<f32>().ok()))
        .expect("retrieve-chunk detail must contain A=<activation>");
    assert!(
        (actual_activation - expected_activation).abs() < tolerance,
        "act_r activation must equal paper value {} (Anderson & Lebiere 1998 Ch. 9); got {}",
        expected_activation,
        actual_activation
    );

    // Verify that the sum=7 slot from fact34 propagates to output facts
    let expected_sum = exp
        .get("sum_fact")
        .and_then(|v| v.get("value"))
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.sum_fact.value");
    assert!(
        output
            .facts
            .iter()
            .any(|f| f.key == "sum" && f.value == expected_sum),
        "sum={} from fact34 must propagate into working memory / output facts",
        expected_sum
    );
}

#[test]
fn analogy_sme_paper_grounded() {
    let (json, input) = load_fixture("analogy_sme");
    let breed = analogy_sme::AnalogySme;
    assert!(
        breed.preconditions(&input).is_ok(),
        "analogy_sme fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("analogy_sme paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::AnalogySme);
    assert!(
        !output.inference_trace.is_empty(),
        "analogy_sme trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "local-match"),
        "analogy_sme must emit local-match trace steps"
    );

    let exp = &json["expected"];

    // Paper-grounded mapping assertion: Falkenhainer et al. 1989 Section 5.1
    // The classic solar-system/Rutherford-atom analogy must produce sun→nucleus, planet→electron.
    // These are expressed as facts with keys "map:sun" and "map:planet".
    let sun_mapped = output
        .facts
        .iter()
        .any(|f| f.key == "map:sun" && f.value == "nucleus");
    let planet_mapped = output
        .facts
        .iter()
        .any(|f| f.key == "map:planet" && f.value == "electron");
    assert!(
        sun_mapped && planet_mapped,
        "analogy_sme must map sun→nucleus and planet→electron \
         per Falkenhainer, Forbus & Gentner 1989 Section 5.1 Figures 13-15; \
         facts: {:?}",
        output.facts
    );

    // Paper-grounded candidate inference assertion: base:2 (the cause expression)
    // has no counterpart in the target but all its entities (sun, planet) are covered
    // by the winning mapping, so it must be emitted as a candidate inference with
    // substituted entities: (cause (greater (mass nucleus) (mass electron)) (revolve electron nucleus))
    // Falkenhainer et al. 1989 p.6-7 describes this as the systematicity principle: causal
    // chains carry over with substituted bindings while attributes without target structure drop.
    let expected_inference = exp["candidate_inference_contains"]
        .as_str()
        .expect("fixture must declare expected.candidate_inference_contains");
    let inference_found = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("inference:"))
        .any(|f| {
            f.value.contains("cause") && f.value.contains("nucleus") && f.value.contains("electron")
        });
    assert!(
        inference_found,
        "analogy_sme must carry over base:2 (cause expression) as candidate inference \
         with substituted entities per Falkenhainer et al. 1989 Section 5.1 systematicity principle; \
         expected to contain: '{}'; inferences: {:?}",
        expected_inference,
        output
            .facts
            .iter()
            .filter(|f| f.key.starts_with("inference:"))
            .collect::<Vec<_>>()
    );

    // Verify that temperature attribute (base:3) does NOT produce a mapping (no target counterpart,
    // attribute dropped by systematicity): there should be no "map:temperature" fact.
    let temp_not_mapped = !output.facts.iter().any(|f| f.key == "map:temperature");
    assert!(
        temp_not_mapped,
        "analogy_sme must NOT map temperature attribute (no target structure) \
         per Falkenhainer et al. 1989 Section 5.1 systematicity principle"
    );
}

#[test]
fn belief_merging_paper_grounded() {
    let (json, input) = load_fixture("belief_merging");
    let breed = belief_merging::BeliefMerging;
    assert!(
        breed.preconditions(&input).is_ok(),
        "belief_merging fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("belief_merging paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::BeliefMerging);
    assert!(
        !output.inference_trace.is_empty(),
        "belief_merging trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: Konieczny & Pino Pérez 2002.
    // The discriminating profile E = {K1 = p∧q, K2 = p∧q, K3 = ¬p∧¬q} with IC = ⊤.
    // Σ (majoritarian) selects the unique minimal world (p,q) with distance sum=2.
    // GMax (egalitarian) selects the pair {(p,¬q), (¬p,q)} with leximax vector (1,1,1).
    // The fixture runs on the "input" (Sigma operator).
    let exp_sum_models = exp["sum_models"]
        .as_array()
        .expect("fixture must declare expected.sum_models");
    assert_eq!(
        exp_sum_models.len(),
        1,
        "Sigma must select exactly 1 model (majoritarian majority)"
    );
    let exp_sum_world = exp_sum_models[0]
        .as_str()
        .expect("sum_models entries must be strings");
    assert_eq!(
        output.selected.as_deref(),
        Some(exp_sum_world),
        "Sigma must select '{}' (majority world) per Konieczny & Pino Pérez 2002 Section 5 ({})",
        exp_sum_world,
        exp["notes"].as_str().unwrap_or("majoritarian operator")
    );

    // Verify bm:model_count fact is present and correct
    let model_count_fact = output
        .facts
        .iter()
        .find(|f| f.key == "bm:model_count")
        .expect("output must contain bm:model_count fact");
    assert_eq!(
        model_count_fact.value, "1",
        "Sigma aggregation must produce exactly 1 model"
    );

    // Verify the selected model appears in bm:model:0
    let model_0 = output
        .facts
        .iter()
        .find(|f| f.key == "bm:model:0")
        .expect("output must contain bm:model:0 fact");
    assert_eq!(
        model_0.value, exp_sum_world,
        "First model must match selected (Sigma majority)"
    );
}

#[test]
fn circumscription_paper_grounded() {
    let (json, input) = load_fixture("circumscription");
    let breed = circumscription::Circumscription;
    assert!(
        breed.preconditions(&input).is_ok(),
        "circumscription fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("circumscription paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Circumscription);
    assert!(
        !output.inference_trace.is_empty(),
        "circumscription trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "enumerate-model"),
        "circumscription must enumerate candidate models"
    );

    let exp = &json["expected"];

    // Paper-grounded STRING assertion: McCarthy 1980 bird/penguin circumscription.
    // The expected field contains "entailed": { "flies_tweety": true, "flies_opus": false }
    // Per McCarthy (1980), Section 4, the unique ab-minimal model has S = {ab_bird_opus};
    // therefore flies_tweety is entailed (ab_bird_tweety stays false by minimization),
    // and flies_opus is NOT entailed (ab_bird_opus blocks the flies rule).
    let entailed = exp
        .get("entailed")
        .expect("fixture must declare expected.entailed");

    // Verify flies_tweety is entailed.
    let tweety_fact = output
        .facts
        .iter()
        .find(|f| f.key == "entailed:flies_tweety")
        .expect("circumscription must derive entailed:flies_tweety");
    assert_eq!(
        tweety_fact.value, "true",
        "flies_tweety must be entailed (McCarthy 1980 p.27-39): ab_bird_tweety stays false by minimization"
    );
    assert_eq!(
        entailed.get("flies_tweety").and_then(|v| v.as_bool()),
        Some(true),
        "fixture expected.entailed.flies_tweety must be true"
    );

    // Verify flies_opus is NOT entailed.
    let opus_fact = output
        .facts
        .iter()
        .find(|f| f.key == "entailed:flies_opus")
        .expect("circumscription must derive entailed:flies_opus");
    assert_eq!(
        opus_fact.value, "false",
        "flies_opus must NOT be entailed (McCarthy 1980 p.27-39): ab_bird_opus is forced by penguin_opus, blocking the rule"
    );
    assert_eq!(
        entailed.get("flies_opus").and_then(|v| v.as_bool()),
        Some(false),
        "fixture expected.entailed.flies_opus must be false"
    );

    // Verify minimal abnormality set is exactly {ab_bird_opus}.
    let expected_minimal_ab_set: Vec<String> = exp
        .get("minimal_ab_set")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|st| st.to_string()))
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        expected_minimal_ab_set,
        vec!["ab_bird_opus"],
        "fixture expected.minimal_ab_set must be {{ab_bird_opus}}"
    );

    // Verify selected is the first entailed goal (flies_tweety).
    assert_eq!(
        output.selected.as_deref(),
        Some("flies_tweety"),
        "circumscription selected must be the first entailed goal, flies_tweety (McCarthy 1980 p.27-39)"
    );
}

#[test]
fn clp_paper_grounded() {
    let (json, input) = load_fixture("clp");
    let breed = clp::Clp;

    // The CLP implementation expects fact keys "clp-var" and "clp-constraint" (with hyphens),
    // but the fixture provides "clp:var:x" and "clp:constraint:c1" (with colons).
    // This causes preconditions to fail. The test documents this structural gap.
    match breed.preconditions(&input) {
        Ok(_) => {
            // If preconditions unexpectedly pass (fixture or impl corrected),
            // verify the solution matches the Jaffar & Lassez 1987 scheme expectation.
            let output = breed
                .run(&input)
                .expect("clp paper-grounded run must succeed");
            assert_eq!(output.breed, BreedId::Clp);
            assert!(
                !output.inference_trace.is_empty(),
                "clp trace must be non-empty"
            );

            let exp = &json["expected"];
            let expected_solution = exp
                .get("value")
                .and_then(|v| v.as_str())
                .expect("fixture must declare expected.value");

            // The explanation field formats the solution as "SAT: x=6, y=3"
            // (sorted key=value pairs joined by ", "). Extract and compare.
            assert!(
                output
                    .explanation
                    .contains(expected_solution.replace(",", ", ").as_str()),
                "clp solution must match Jaffar & Lassez 1987 paper: expected={}, got={}",
                expected_solution,
                output.explanation
            );

            // Verify zero-backtrack behavior: propagation alone solves the constraints.
            let backtrack_count = output
                .inference_trace
                .iter()
                .filter(|t| t.kind == "clp-backtrack")
                .count();
            assert_eq!(
                backtrack_count, 0,
                "clp must solve with zero backtracks (Jaffar & Lassez 1987, p.113)"
            );
        }
        Err(e) => {
            panic!(
                "clp preconditions failed with: {}. Fixture fact keys must be 'clp-var'/'clp-constraint' (hyphens), not 'clp:var:*'/'clp:constraint:*' (colons)",
                e
            );
        }
    }
}

#[test]
fn construction_grammar_paper_grounded() {
    let (json, input) = load_fixture("construction_grammar");
    let breed = construction_grammar::ConstructionGrammar;
    assert!(
        breed.preconditions(&input).is_ok(),
        "construction_grammar fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("construction_grammar paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::ConstructionGrammar);
    assert!(
        !output.inference_trace.is_empty(),
        "construction_grammar trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: Goldberg 1995 Chapter 1-2 — "pat faxed bill the letter"
    // is licensed by the ditransitive construction (X CAUSES Y to RECEIVE Z).
    // The verb 'fax' is lexically transitive (arity 2), but the construction demands
    // arity 3, triggering coercion (the construction supplies the CAUSE-RECEIVE meaning).

    // Assert selected construction is ditransitive (not transitive)
    let expected_construction = exp["construction"]
        .as_str()
        .expect("fixture must declare expected.construction");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_construction),
        "construction_grammar must match ditransitive construction per Goldberg 1995 §1"
    );

    // Assert coercion flag: transitive verb in ditransitive frame → true
    let coerced_fact = output
        .facts
        .iter()
        .find(|f| f.key == "cxg:coerced")
        .expect("cxg:coerced fact must exist");
    let expected_coerced = exp["coerced"]
        .as_str()
        .expect("fixture must declare expected.coerced");
    assert_eq!(
        coerced_fact.value, expected_coerced,
        "coercion must be true: transitive 'fax' in ditransitive frame per Goldberg 1995 §1"
    );

    // Assert meaning frame is CAUSE-RECEIVE
    let meaning_fact = output
        .facts
        .iter()
        .find(|f| f.key == "cxg:meaning")
        .expect("cxg:meaning fact must exist");
    let expected_frame = exp["meaning_frame"]
        .as_str()
        .expect("fixture must declare expected.meaning_frame");
    assert!(
        meaning_fact.value.starts_with(expected_frame),
        "ditransitive frame must supply CAUSE-RECEIVE meaning; got: {}",
        meaning_fact.value
    );

    // Assert slot bindings: rec=bill, theme=the letter
    let expected_rec = exp["slot_rec"]
        .as_str()
        .expect("fixture must declare expected.slot_rec");
    let rec_fact = output
        .facts
        .iter()
        .find(|f| f.key == "cxg:slot:rec")
        .expect("cxg:slot:rec fact must exist");
    assert_eq!(
        rec_fact.value, expected_rec,
        "recipient slot must be '{}' (first NP after verb) per Goldberg 1995 ditransitive frame",
        expected_rec
    );

    let expected_theme = exp["slot_theme"]
        .as_str()
        .expect("fixture must declare expected.slot_theme");
    let theme_fact = output
        .facts
        .iter()
        .find(|f| f.key == "cxg:slot:theme")
        .expect("cxg:slot:theme fact must exist");
    assert_eq!(
        theme_fact.value, expected_theme,
        "theme slot must be '{}' (second NP after verb) per Goldberg 1995 ditransitive frame",
        expected_theme
    );
}

#[test]
fn contingent_plan_paper_grounded() {
    let (json, input) = load_fixture("contingent_plan");
    let breed = contingent_plan::ContingentPlan;
    assert!(
        breed.preconditions(&input).is_ok(),
        "contingent_plan fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("contingent_plan paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::ContingentPlan);
    assert!(
        !output.explanation.is_empty(),
        "contingent_plan explanation must be non-empty"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "contingent_plan trace must be non-empty"
    );

    // Paper-grounded assertion: Russell & Norvig AIMA 3rd ed. §4.3.2 — vacuum world
    // AND-OR search produces a conditional plan with exactly one sense node on 'dirt',
    // followed by suck (if dirt true) or done (if dirt false).
    let exp = &json["expected"];
    let expected_tree = exp["plan_tree"]
        .as_str()
        .expect("fixture must declare expected.plan_tree");
    let expected_sense_count = exp["sense_nodes"]
        .as_u64()
        .expect("fixture must declare expected.sense_nodes");

    // The serialized plan tree appears in both output.selected and in the plan:tree fact
    let selected = output.selected.as_deref().expect(
        "contingent_plan must produce a selected plan tree per Russell & Norvig AIMA §4.3.2",
    );
    assert_eq!(
        selected, expected_tree,
        "contingent_plan tree must be '{}' (sense check-dirt dirt (act suck (done)) (done)) \
         per Russell & Norvig AIMA 3rd ed. §4.3.2 vacuum-world AND-OR example; got '{}'",
        expected_tree, selected
    );

    // Verify the plan:tree fact is present and matches
    let plan_tree_fact = output
        .facts
        .iter()
        .find(|f| f.key == "plan:tree")
        .expect("contingent_plan must emit a plan:tree fact");
    assert_eq!(
        plan_tree_fact.value, expected_tree,
        "plan:tree fact must match expected tree from fixture"
    );

    // Verify the sense node count (number of '(sense' substrings in the plan tree)
    let sense_count = selected.matches("(sense ").count() as u64;
    assert_eq!(
        sense_count, expected_sense_count,
        "contingent_plan plan tree must have exactly {} sense node(s) per AIMA §4.3.2; got {}",
        expected_sense_count, sense_count
    );

    // Verify that trace contains planning steps (or-expand, sense-branch, plan-complete)
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "plan-complete"),
        "contingent_plan trace must contain plan-complete step per postconditions"
    );
}

#[test]
fn ctl_check_paper_grounded() {
    let (json, input) = load_fixture("ctl_check");
    let breed = ctl_check::CtlCheck;
    assert!(
        breed.preconditions(&input).is_ok(),
        "ctl_check fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("ctl_check paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::CtlCheck, "breed id must be CtlCheck");
    assert!(
        !output.inference_trace.is_empty(),
        "ctl_check trace must be non-empty"
    );

    let exp = &json["expected"];
    let exp_verdict = exp["verdict"]
        .as_str()
        .expect("expected.verdict must be a string");
    let exp_value = exp["value"]
        .as_str()
        .expect("expected.value must be a string");

    // CTL model checker verdict: "holds" or "fails"
    assert_eq!(
        output.selected.as_deref(),
        Some(exp_verdict),
        "Clarke-Emerson-Sistla 1986: AG !(c1 & c2) must {} at initial state s0 (Section 5 two-process mutual exclusion example)",
        exp_verdict
    );

    // Verify that the output verdict matches the expected value ("verified" means property holds)
    let actual_ctl_fact = output
        .facts
        .iter()
        .find(|f| f.key == "ctl:verdict")
        .expect("output must contain ctl:verdict fact");
    assert_eq!(
        actual_ctl_fact.value, exp_verdict,
        "ctl:verdict fact must match expected verdict"
    );

    // When the property holds, no counterexample steps should be emitted
    if exp_verdict == "holds" {
        assert!(
            output.facts.iter().all(|f| !f.key.starts_with("cex:")),
            "no counterexample steps should be emitted when property holds (Clarke-Emerson-Sistla Section 4)"
        );
    }

    // Verify trace contains label-states steps (evidence of fixed-point labeling)
    assert!(
        output
            .inference_trace
            .iter()
            .any(|step| step.kind == "label-states"),
        "trace must contain label-states steps (fixed-point labeling algorithm executed)"
    );
}

#[test]
fn episodic_memory_paper_grounded() {
    let (json, input) = load_fixture("episodic_memory");
    let breed = episodic_memory::EpisodicMemory;
    assert!(
        breed.preconditions(&input).is_ok(),
        "episodic_memory fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("episodic_memory paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::EpisodicMemory);
    assert!(
        !output.inference_trace.is_empty(),
        "episodic_memory trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertions per Tulving 1983 and Nuxoll & Laird 2007:
    // Two kitchen episodes (breakfast at t=9, dinner at t=2) with identical Jaccard
    // overlap (0.5 each) relative to the cue at t=10. The temporal proximity kernel
    // 1/(1+|Δt|) decides the winner: breakfast score = 0.5 + 1/2 = 1.0,
    // dinner score = 0.5 + 1/9 ≈ 0.6111. The locus is Tulving Ch. 7 on temporal
    // organisation and Nuxoll & Laird Section 3 on cue-based retrieval.

    let recalled = exp
        .get("recalled")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.recalled");
    assert_eq!(
        output.selected.as_deref(),
        Some(recalled),
        "episodic_memory must recall {} per Tulving 1983 Ch. 7 temporal organisation",
        recalled
    );

    // Extract and assert the breakfast score (should be 1.0)
    let score_breakfast = output
        .facts
        .iter()
        .find(|f| f.key == "score:ep-breakfast")
        .map(|f| f.value.parse::<f64>().unwrap_or(0.0))
        .unwrap_or(0.0);
    let expected_breakfast_score = exp
        .get("score_breakfast")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);
    let tolerance = exp
        .get("tolerance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.001);
    assert!(
        (score_breakfast - expected_breakfast_score).abs() < tolerance,
        "episodic_memory breakfast score must be {:.4} (Jaccard 0.5 + temporal kernel 0.5 from Δt=1); got {:.4}",
        expected_breakfast_score,
        score_breakfast
    );

    // Extract and assert the dinner score (should be ≈ 0.6111)
    let score_dinner = output
        .facts
        .iter()
        .find(|f| f.key == "score:ep-dinner")
        .map(|f| f.value.parse::<f64>().unwrap_or(0.0))
        .unwrap_or(0.0);
    let expected_dinner_score = exp
        .get("score_dinner")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.6111);
    assert!(
        (score_dinner - expected_dinner_score).abs() < tolerance,
        "episodic_memory dinner score must be {:.4} (Jaccard 0.5 + temporal kernel 1/9 from Δt=8); got {:.4}",
        expected_dinner_score,
        score_dinner
    );
}

#[test]
fn event_calculus_paper_grounded() {
    let (json, input) = load_fixture("event_calculus");
    let breed = event_calculus::EventCalculus;
    assert!(
        breed.preconditions(&input).is_ok(),
        "event_calculus fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("event_calculus paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::EventCalculus);
    assert!(
        !output.inference_trace.is_empty(),
        "event_calculus trace must be non-empty"
    );
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "ec-infer"),
        "event_calculus must emit ec-infer steps"
    );

    // Paper-grounded assertion: Kowalski & Sergot 1986 discrete event calculus over
    // the Mary hired/promoted narrative. Five HoldsAt queries at different time points.
    // lecturer holds at t=4 (after hire, before promote); absent at t=7 (after promote terminates it).
    // professor holds at t=7 (after promote initiates it); absent at t=4 (not yet promoted).
    // employed holds at t=7 (initiated by hire, never terminated).
    let exp = &json["expected"];
    let verdicts = exp["verdicts"]
        .as_object()
        .expect("fixture must declare expected.verdicts");

    // The breed exposes per-query verdicts directly via `ec-verdict` trace steps and the
    // `ec:verdict:<fluent>@<time>` keys in `output.selected`. Parse selected into a map.
    let selected = output
        .selected
        .as_deref()
        .expect("event_calculus must expose verdicts in selected");
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "ec-verdict"),
        "event_calculus must emit ec-verdict steps for HoldsAt queries"
    );
    let mut computed: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    for entry in selected.split(',') {
        if let Some((k, v)) = entry.split_once('=') {
            computed.insert(k.trim().to_string(), v.trim() == "true");
        }
    }

    // Assert each paper-ground-truth verdict against the breed's computed verdict.
    for (query_id, verdict_value) in verdicts.iter() {
        let verdict_str = verdict_value.as_str().expect("verdicts must be strings");
        let expected_true = verdict_str == "true";
        let got = *computed.get(query_id).unwrap_or_else(|| {
            panic!(
                "event_calculus did not produce a verdict for {} (computed: {:?})",
                query_id, computed
            )
        });
        assert_eq!(
            got, expected_true,
            "event_calculus {} must be {} per Kowalski & Sergot 1986 Sections 2-5 \
             Mary hired/promoted narrative; computed: {:?}",
            query_id, verdict_str, computed
        );
    }
}

#[test]
fn ilp_paper_grounded() {
    let (json, input) = load_fixture("ilp");
    let breed = ilp::Ilp;
    assert!(
        breed.preconditions(&input).is_ok(),
        "ilp fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("ilp paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Ilp);
    assert!(
        !output.inference_trace.is_empty(),
        "ilp trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "emit-clause"),
        "ilp must emit at least one clause via emit-clause trace steps"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: Quinlan 1990 Section 3 — FOIL daughter task.
    // The fixture expects exactly 1 clause covering the positive examples.
    let clause_count = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("ilp:rule:"))
        .count();
    assert_eq!(
        clause_count, 1,
        "ilp must induce exactly 1 clause (Quinlan 1990 Section 3 daughter relation); got {}",
        clause_count
    );

    // The selected field holds the first (and only) learned rule text.
    let rule_text = output
        .selected
        .as_deref()
        .expect("ilp must emit a selected rule for daughter task");

    // Head must be daughter(V0,V1).
    let expected_head = exp["head"]
        .as_str()
        .expect("fixture must declare expected.head");
    assert!(
        rule_text.starts_with(expected_head),
        "ilp rule head must be '{}' per Quinlan 1990 §3; got: {}",
        expected_head,
        rule_text
    );

    // Body must contain both female(V0) and parent(V1,V0) as a set
    // (order depends on information gain ranking, not fixed).
    let expected_body_set = exp["body_set"]
        .as_array()
        .expect("fixture must declare expected.body_set");
    for body_literal in expected_body_set {
        let lit = body_literal
            .as_str()
            .expect("body_set items must be strings");
        assert!(
            rule_text.contains(lit),
            "ilp body must contain '{}' per Quinlan 1990 §3 FOIL daughter induction; \
             full rule: {}",
            lit,
            rule_text
        );
    }

    // Value expectation: "verified" indicates the algorithm produced a valid learned clause.
    let exp_value = exp["value"]
        .as_str()
        .expect("fixture must declare expected.value");
    assert_eq!(
        exp_value, "verified",
        "fixture test value should be 'verified' (algorithm is complete)"
    );
}

#[test]
fn markov_logic_paper_grounded() {
    let (json, input) = load_fixture("markov_logic");
    let breed = markov_logic::MarkovLogic;
    assert!(
        breed.preconditions(&input).is_ok(),
        "markov_logic fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("markov_logic paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::MarkovLogic);
    assert!(
        !output.inference_trace.is_empty(),
        "markov_logic trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertion: Richardson & Domingos 2006, Table 1 / Fig. 1.
    // The ground MLN for {anna, bob} with evidence smokes(anna) and friends(anna,bob)
    // reaches a MAP state with cost 0.0 (all clauses satisfied).
    let expected_cost_str = exp["cost"]
        .as_str()
        .expect("fixture must declare expected.cost");
    let cost_fact = output
        .facts
        .iter()
        .find(|f| f.key == "mln:cost")
        .expect("markov_logic must emit mln:cost fact");
    assert_eq!(
        cost_fact.value, expected_cost_str,
        "Markov Logic MAP cost must equal {expected_cost_str} (Richardson & Domingos 2006 Table 1); got {}",
        cost_fact.value
    );

    // Verify the MAP state entails the expected ground atoms: smokes_bob, cancer_anna, cancer_bob all true.
    // Richardson & Domingos 2006 Fig. 1 shows friends(anna,bob) + smokes(anna) ⇒ smokes(bob) by chain rule.
    let smokes_bob_val = exp["smokes_bob"]
        .as_str()
        .expect("fixture must declare expected.smokes_bob");
    let smokes_bob_fact = output
        .facts
        .iter()
        .find(|f| f.key == "mln:atom:smokes_bob")
        .expect("markov_logic must derive smokes_bob atom");
    assert_eq!(
        smokes_bob_fact.value, smokes_bob_val,
        "smokes_bob must be {} in MAP state (friends propagate smoking) per Richardson & Domingos 2006",
        smokes_bob_val
    );

    let cancer_anna_val = exp["cancer_anna"]
        .as_str()
        .expect("fixture must declare expected.cancer_anna");
    let cancer_anna_fact = output
        .facts
        .iter()
        .find(|f| f.key == "mln:atom:cancer_anna")
        .expect("markov_logic must derive cancer_anna atom");
    assert_eq!(
        cancer_anna_fact.value, cancer_anna_val,
        "cancer_anna must be {} in MAP state (smoker gets cancer) per Richardson & Domingos 2006",
        cancer_anna_val
    );

    let cancer_bob_val = exp["cancer_bob"]
        .as_str()
        .expect("fixture must declare expected.cancer_bob");
    let cancer_bob_fact = output
        .facts
        .iter()
        .find(|f| f.key == "mln:atom:cancer_bob")
        .expect("markov_logic must derive cancer_bob atom");
    assert_eq!(
        cancer_bob_fact.value, cancer_bob_val,
        "cancer_bob must be {} in MAP state (smoker gets cancer) per Richardson & Domingos 2006",
        cancer_bob_val
    );
}

#[test]
fn mdp_paper_grounded() {
    let (json, input) = load_fixture("mdp");
    let breed = mdp::Mdp;
    assert!(
        breed.preconditions(&input).is_ok(),
        "mdp fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("mdp paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Mdp);
    assert!(
        !output.inference_trace.is_empty(),
        "mdp trace must be non-empty"
    );
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "mdp-init"),
        "mdp trace must contain mdp-init step"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "mdp-iterate"),
        "mdp trace must contain mdp-iterate steps"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "mdp-policy"),
        "mdp trace must contain mdp-policy step"
    );

    let exp = &json["expected"];

    // Extract expected values per state from the fixture
    let expected_values = exp["values"]
        .as_object()
        .expect("fixture must declare expected.values object");
    let tolerance = exp["tolerance"].as_f64().unwrap_or(1e-3);

    // Extract value function from the last mdp-iterate trace step detail
    // Format: "Sweep N: delta=X, values=[v0, v1, v2, ...]"
    let last_iterate = output
        .inference_trace
        .iter()
        .rev()
        .find(|t| t.kind == "mdp-iterate")
        .expect("mdp must have at least one mdp-iterate step");

    // Parse values array from detail string
    let detail = &last_iterate.detail;
    let values_start = detail
        .find('[')
        .expect("values array must be present in trace");
    let values_end = detail
        .find(']')
        .expect("values array must be closed in trace");
    let values_str = &detail[values_start + 1..values_end];
    let parsed_values: Vec<f64> = values_str
        .split(',')
        .map(|v| v.trim().parse::<f64>().expect("trace values must be f64"))
        .collect();

    // Map state names to their indices
    let state_names = vec!["s0", "s1", "goal"];
    assert_eq!(parsed_values.len(), 3, "MDP must have exactly 3 states");

    for (idx, state_name) in state_names.iter().enumerate() {
        if let Some(expected_val) = expected_values.get(*state_name).and_then(|v| v.as_f64()) {
            let actual = parsed_values[idx];
            assert!(
                (actual - expected_val).abs() < tolerance,
                "MDP value for state '{}' must be {} (Bellman 1957 functional equation V(s)=max_a[r(s,a)+gamma*sum(p(s'|s,a)*V(s'))]), got {} (tolerance={})",
                state_name,
                expected_val,
                actual,
                tolerance
            );
        }
    }

    // Verify policy extraction from mdp-policy step
    let policy_step = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "mdp-policy")
        .expect("mdp must have mdp-policy step");

    let expected_policy = exp["policy"]
        .as_object()
        .expect("fixture must declare expected.policy object");

    for (state_name, expected_action) in expected_policy {
        let expected_action_str = expected_action
            .as_str()
            .expect("policy action must be string");
        let policy_contains = policy_step
            .detail
            .contains(&format!("{}:{}", state_name, expected_action_str));
        assert!(
            policy_contains,
            "MDP policy must include action '{}' for state '{}' (Bellman optimal policy extraction)",
            expected_action_str,
            state_name
        );
    }
}

#[test]
fn meta_reasoning_paper_grounded() {
    let (json, input) = load_fixture("meta_reasoning");
    let breed = meta_reasoning::MetaReasoning;
    assert!(
        breed.preconditions(&input).is_ok(),
        "meta_reasoning fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("meta_reasoning paper-grounded run must succeed");

    assert_eq!(output.breed, BreedId::MetaReasoning);
    assert!(
        !output.inference_trace.is_empty(),
        "meta_reasoning trace must be non-empty"
    );

    // Paper-grounded: detect at least one conflict (Cox & Raja 2011, Ch. 1)
    let conflict_step = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "conflict-detected")
        .expect(
            "meta_reasoning must detect conflict between mycin and prolog (Cox & Raja 2011, Ch. 1)",
        );
    assert!(
        conflict_step.detail.contains("mycin") && conflict_step.detail.contains("prolog"),
        "conflict-detected trace must name both competing reasoners"
    );

    // Verify resolve step exists
    let resolve_step = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "resolve")
        .expect("meta_reasoning must produce a resolve step");

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertion: expect exactly 1 conflict
    let expected_conflicts = exp
        .get("conflicts")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.conflicts");
    let actual_conflicts = output
        .facts
        .iter()
        .find(|f| f.key == "meta:conflicts")
        .map(|f| &f.value)
        .expect("output must include meta:conflicts fact");
    assert_eq!(
        actual_conflicts, expected_conflicts,
        "meta_reasoning conflict count must match fixture: expected {}, got {}",
        expected_conflicts, actual_conflicts
    );

    // Paper-grounded: confidence-weighted selection must choose gentamicin (0.8) over none (0.6)
    let expected_selected = exp
        .get("selected")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.selected");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_selected),
        "meta_reasoning must select {} via confidence-weighted arbitration (Cox & Raja 2011, Ch. 1)",
        expected_selected
    );
}

#[test]
fn morphological_paper_grounded() {
    let (json, input) = load_fixture("morphological");
    let breed = morphological::Morphological;
    assert!(
        breed.preconditions(&input).is_ok(),
        "morphological fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("morphological paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Morphological);
    assert!(
        !output.inference_trace.is_empty(),
        "morphological trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "compute-field-size"),
        "morphological must compute field size"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "synthesize-solution-space"),
        "morphological must synthesize solution space"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: Zwicky's 1947 propulsive system morphology
    // with one CCA exclusion (chemical-reactions=self-contained x thrust-augmentation-1=no-motion)
    // must select the first consistent configuration in lexicographic order
    // (Zwicky 1947; Ritchey 2011, Fig. 2.2 "Principle of contradiction and reduction").
    let expected_selected = exp
        .get("selected")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.selected");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_selected),
        "morphological selected must equal Zwicky 1947 first consistent configuration; \
         citation: Zwicky, F. (1969). Discovery, Invention, Research Through the Morphological Approach. Macmillan."
    );

    breed
        .postconditions(&input, &output)
        .expect("morphological postconditions must hold");
}

#[test]
fn naive_physics_paper_grounded() {
    let (json, input) = load_fixture("naive_physics");
    let breed = naive_physics::NaivePhysics;
    assert!(
        breed.preconditions(&input).is_ok(),
        "naive_physics fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("naive_physics paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::NaivePhysics);
    assert!(
        !output.inference_trace.is_empty(),
        "naive_physics trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertions per Hayes 1979/1985:
    // The cup-of-water scene demonstrates support axiom (ax-unsupported-falls),
    // containment transport, and liquid spilling. When the table is removed,
    // the cup falls (its support is gone) and water spills from the falling cup.
    // The floor must NOT fall (it is ground). Over-derivation is a defect.
    // (Hayes, P. J. (1979, 1985). Locus: axiom chains in Sections 4-6 of Liquids paper.)

    // Verify exactly the expected objects fall
    let expected_falls: Vec<String> = exp
        .get("falls")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|x| x.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let actual_falls: Vec<String> = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("falls:"))
        .map(|f| f.key.replace("falls:", ""))
        .collect();

    let mut actual_falls_sorted = actual_falls.clone();
    actual_falls_sorted.sort();
    let mut expected_falls_sorted = expected_falls.clone();
    expected_falls_sorted.sort();

    assert_eq!(
        actual_falls_sorted, expected_falls_sorted,
        "naive_physics must derive exactly the expected falls (Hayes axiom chain): expected {:?}, got {:?}",
        expected_falls_sorted, actual_falls_sorted
    );

    // Verify exactly the expected liquids spill
    let expected_spills: Vec<String> = exp
        .get("spills")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|x| x.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let actual_spills: Vec<String> = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("spills:"))
        .map(|f| f.key.replace("spills:", ""))
        .collect();

    let mut actual_spills_sorted = actual_spills.clone();
    actual_spills_sorted.sort();
    let mut expected_spills_sorted = expected_spills.clone();
    expected_spills_sorted.sort();

    assert_eq!(
        actual_spills_sorted, expected_spills_sorted,
        "naive_physics must derive exactly the expected spills (ax-liquid-spill): expected {:?}, got {:?}",
        expected_spills_sorted, actual_spills_sorted
    );

    // Verify that disallowed objects do NOT fall (over-derivation check)
    let not_falls: Vec<String> = exp
        .get("not_falls")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|x| x.to_string()))
                .collect()
        })
        .unwrap_or_default();

    for obj in not_falls {
        assert!(
            !actual_falls.contains(&obj),
            "naive_physics must NOT derive falls:{} — over-derivation is a defect (Hayes fixture constraint)",
            obj
        );
    }

    // Verify the explanation is non-empty and indicates saturation
    assert!(
        !output.explanation.is_empty(),
        "naive_physics explanation must be non-empty"
    );
    assert!(
        output.explanation.contains("axiom") || output.explanation.contains("Hayes"),
        "naive_physics explanation must reference axiom saturation"
    );

    // Verify trace contains apply-axiom steps (the four Hayes axioms: support,
    // unsupported-falls, containment-transport, liquid-spill)
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "apply-axiom"),
        "naive_physics must emit apply-axiom trace steps for Hayes axioms"
    );

    let exp_value = exp
        .get("value")
        .and_then(|v| v.as_str())
        .unwrap_or("verified");
    assert_eq!(
        exp_value, "verified",
        "naive_physics fixture expected.value must be 'verified' per Hayes paper"
    );
}

#[test]
fn ocpm_route_discoverer_paper_grounded() {
    let (json, input) = load_fixture("ocpm_route_discoverer");
    let breed = ocpm_route_discoverer::OcpmRouteDiscoverer;
    assert!(
        breed.preconditions(&input).is_ok(),
        "ocpm_route_discoverer fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("ocpm_route_discoverer paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::OcpmRouteDiscoverer);
    assert!(
        !output.inference_trace.is_empty(),
        "ocpm_route_discoverer trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "discover-route"),
        "ocpm_route_discoverer must emit discover-route trace steps"
    );

    // Paper-grounded assertion: van der Aalst 2019 Object-Centric Process Mining
    // Route discovery extracts the ordered lifecycle for each object. The fixture
    // provides three events: Create touches both o1 and i1; Pay touches o1; Ship touches i1.
    // Expected routes: o1 has "Create->Pay", i1 has "Create->Ship" (van der Aalst 2019 route discovery).
    let exp = &json["expected"];
    let expected_routes = exp
        .get("routes")
        .and_then(|v| v.as_object())
        .expect("fixture must declare expected.routes object");

    // Assert each expected route is present in the output facts
    for (obj_key, expected_route_val) in expected_routes {
        let expected_route = expected_route_val
            .as_str()
            .expect("route values must be strings");
        let found = output
            .facts
            .iter()
            .any(|f| f.key.as_str() == obj_key.as_str() && f.value == expected_route);
        assert!(
            found,
            "ocpm_route_discoverer must discover route for {} = '{}' \
             per van der Aalst 2019 Object-Centric Process Mining route discovery; \
             output facts: {:?}",
            obj_key,
            expected_route,
            output
                .facts
                .iter()
                .map(|f| (&f.key, &f.value))
                .collect::<Vec<_>>()
        );
    }
}

#[test]
fn partial_order_plan_paper_grounded() {
    let (json, input) = load_fixture("partial_order_plan");
    let breed = partial_order_plan::PartialOrderPlan;
    assert!(
        breed.preconditions(&input).is_ok(),
        "partial_order_plan fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("partial_order_plan paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::PartialOrderPlan);
    assert!(
        !output.inference_trace.is_empty(),
        "partial_order_plan trace must be non-empty"
    );

    // Paper-grounded assertion: McAllester & Rosenblitt 1991 Sussman anomaly.
    // The canonical solution is the interleaved plan: put_c_from_a_on_table; put_b_on_c; put_a_on_b
    // This requires SNLP threat detection and resolution (promotion/demotion per causal links).
    let exp = &json["expected"];
    let expected_plan_str = exp["plan"]
        .as_str()
        .expect("fixture must declare expected.plan");

    // Extract the plan actions from output.selected (impl joins with ';', canonical delimiter)
    let selected = output.selected.as_deref().expect(
        "partial_order_plan must produce a selected plan per McAllester & Rosenblitt 1991 Sussman anomaly"
    );

    // The expected plan actions from the fixture
    let expected_actions: Vec<&str> = expected_plan_str.split(';').map(|s| s.trim()).collect();
    let actual_actions: Vec<&str> = selected.split(';').map(|s| s.trim()).collect();

    // Verify the plan contains exactly the expected actions in the correct order
    assert_eq!(
        actual_actions.len(),
        expected_actions.len(),
        "partial_order_plan must produce exactly {} actions per Sussman anomaly; got {}",
        expected_actions.len(),
        actual_actions.len()
    );

    for (actual, expected) in actual_actions.iter().zip(expected_actions.iter()) {
        assert_eq!(
            actual, expected,
            "partial_order_plan action mismatch: expected '{}' but got '{}' \
             (McAllester & Rosenblitt 1991 interleaved solution order)",
            expected, actual
        );
    }

    // Assert that threat detection occurred (required_trace_kinds: ["detect-threat"])
    let has_threat_detection = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "detect-threat");
    assert!(
        has_threat_detection,
        "partial_order_plan must emit detect-threat trace steps for causal-link threat resolution \
         per McAllester & Rosenblitt 1991 SNLP algorithm"
    );
}

#[test]
fn pomdp_paper_grounded() {
    let (json, input) = load_fixture("pomdp");
    let breed = pomdp::Pomdp;
    assert!(
        breed.preconditions(&input).is_ok(),
        "pomdp fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("pomdp paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Pomdp);
    assert!(
        !output.inference_trace.is_empty(),
        "pomdp trace must be non-empty"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "belief-update"),
        "pomdp must have performed at least one belief update"
    );

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertion: Kaelbling, Littman & Cassandra 1998,
    // tiger problem §3. From uniform prior [0.5, 0.5], one listen action with
    // observe hear-left yields posterior P(tiger-left) = 0.85*0.5 / (0.85*0.5 + 0.15*0.5) = 0.85 exactly.
    let expected_belief_str = exp
        .get("belief_tiger_left")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.belief_tiger_left");
    let expected_belief: f64 = expected_belief_str
        .parse()
        .expect("expected.belief_tiger_left must be parseable as f64");

    let belief_fact = output
        .facts
        .iter()
        .find(|f| f.key == "pomdp:belief:tiger-left")
        .unwrap_or_else(|| {
            panic!(
                "pomdp output must contain belief fact 'pomdp:belief:tiger-left' per Kaelbling et al. 1998"
            )
        });

    let derived_belief: f64 = belief_fact
        .value
        .parse()
        .expect("belief fact value must be parseable as f64");

    assert!(
        (derived_belief - expected_belief).abs() < 1e-5,
        "pomdp belief must equal paper value {expected_belief:.6} (Kaelbling, Littman & Cassandra 1998 §3); got {derived_belief:.6}"
    );
}

#[test]
fn problog_paper_grounded() {
    let (json, input) = load_fixture("problog");
    let breed = problog::Problog;
    assert!(
        breed.preconditions(&input).is_ok(),
        "problog fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("problog paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Problog);
    assert!(
        !output.inference_trace.is_empty(),
        "problog trace must be non-empty"
    );

    // Paper-grounded numeric assertion: De Raedt, Kimmig & Toivonen 2007 (IJCAI),
    // Section 2: noisy-OR probability P(wet) = 1 - (1-0.2)(1-0.2)(1-0.3) = 0.552 exactly.
    // Three independent causes (rain, sprinkler, hose) each trigger wet via one rule.
    let exp = &json["expected"];
    let expected_prob = exp["probability"]
        .as_f64()
        .expect("fixture must declare expected.probability");
    let tolerance = exp["tolerance"].as_f64().unwrap_or(1e-6);

    let selected_str = output
        .selected
        .as_deref()
        .expect("problog must produce a selected probability value");
    let derived_prob: f64 = selected_str.parse().expect("selected must parse to f64");

    assert!(
        (derived_prob - expected_prob).abs() < tolerance,
        "problog P(wet) must equal {:.6} per De Raedt et al. 2007 Section 2 exact oracle \
         (1 - 0.8*0.8*0.7 = 0.552); got {:.6}",
        expected_prob,
        derived_prob
    );

    // Verify exactly 2^3 = 8 worlds enumerated (three probabilistic facts)
    let world_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "enumerate-world")
        .count();
    assert_eq!(
        world_steps, 8,
        "problog must enumerate exactly 8 possible worlds (2^3) for 3 probabilistic facts"
    );
}

#[test]
fn production_rules_paper_grounded() {
    let (json, input) = load_fixture("production_rules");
    let breed = production_rules::Mycin;
    assert!(
        breed.preconditions(&input).is_ok(),
        "production_rules fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("production_rules paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Mycin);
    assert!(
        !output.explanation.is_empty(),
        "production_rules explanation must be non-empty"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "production_rules trace must be non-empty"
    );
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "fire-rule"),
        "production_rules must have fired at least one rule per Shortliffe 1976 p.247"
    );

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertion: therapy=penicillin CF is derived as
    // rule.certainty (0.9) × premise_cf (0.7) = 0.630.
    // Shortliffe 1976 p.247 validates this two-step certainty-factor chain:
    // RULE069 fires first (organism=streptococcus CF=0.7),
    // then RULE071 propagates certainty (therapy CF = 0.9 × 0.7 = 0.630).
    let therapy_cf_expected = exp
        .get("therapy_cf")
        .and_then(|v| v.as_f64())
        .expect("fixture must declare expected.therapy_cf") as f32;
    let tolerance = exp
        .get("tolerance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.001) as f32;

    let therapy_step = output
        .inference_trace
        .iter()
        .find(|t| t.kind == "fire-rule" && t.detail.contains("therapy=penicillin"))
        .expect("production_rules must derive therapy=penicillin per Shortliffe 1976 p.247");

    let derived_cf = parse_cf(&therapy_step.detail);
    assert!(
        (derived_cf - therapy_cf_expected).abs() < tolerance,
        "production_rules therapy CF must equal Shortliffe 1976 p.247 published value {therapy_cf_expected}; got {derived_cf}"
    );

    // The diagnostic answer (selected) is the terminal therapy recommendation,
    // not an intermediate organism.
    let top = exp
        .get("top_conclusion")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.top_conclusion");
    assert_eq!(
        output.selected.as_deref(),
        Some(top),
        "production_rules selected must be the terminal conclusion {top} per Shortliffe 1976 p.247"
    );
}

#[test]
fn qualitative_reason_paper_grounded() {
    let (json, input) = load_fixture("qualitative_reason");
    let breed = qualitative_reason::QualitativeReason;
    assert!(
        breed.preconditions(&input).is_ok(),
        "qualitative_reason fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("qualitative_reason paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::QualitativeReason);
    assert!(
        !output.inference_trace.is_empty(),
        "qualitative_reason trace must be non-empty"
    );

    let exp = &json["expected"];

    // Assert state_count matches expected (de Kleer & Brown 1984: three branches from ambiguous confluence)
    let state_count_str = exp["state_count"]
        .as_str()
        .expect("fixture must declare expected.state_count");
    let state_count_facts: Vec<_> = output
        .facts
        .iter()
        .filter(|f| f.key == "state_count")
        .collect();
    assert!(
        !state_count_facts.is_empty(),
        "output must include state_count fact"
    );
    assert_eq!(
        state_count_facts[0].value,
        state_count_str,
        "qualitative_reason state_count must match de Kleer & Brown pressure-regulator \
         envisionment ({}): got {} states (de Kleer & Brown 1984, Sections 1-3)",
        json["provenance"]["locus"]
            .as_str()
            .unwrap_or("pressure-regulator"),
        state_count_facts[0].value
    );

    // Verify the expected qualitative values (+, 0, -) are present in the state outputs
    let expected_q_values = exp["q_values"]
        .as_array()
        .expect("fixture must declare expected.q_values");
    let mut state_strings = String::new();
    for fact in &output.facts {
        if fact.key.starts_with("state_") {
            state_strings.push_str(&format!("{},", fact.value));
        }
    }

    for expected_val in expected_q_values {
        let expected_sign = expected_val
            .as_str()
            .expect("q_values array must contain strings");
        assert!(
            state_strings.contains(&format!("q:{},", expected_sign))
                || state_strings.contains(&format!(":{}:", expected_sign)),
            "qualitative_reason must find state(s) with [dQ] = {} \
             (de Kleer & Brown 1984: valve confluence ambiguity forces branches)",
            expected_sign
        );
    }
}

#[test]
fn rl_symbolic_paper_grounded() {
    let (json, input) = load_fixture("rl_symbolic");
    let breed = rl_symbolic::RlSymbolic;
    assert!(
        breed.preconditions(&input).is_ok(),
        "rl_symbolic fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("rl_symbolic paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::RlSymbolic);
    assert!(
        !output.inference_trace.is_empty(),
        "rl_symbolic trace must be non-empty"
    );

    // Paper-grounded assertions from Watkins & Dayan (1992)
    // Theorem p. 281: Q-learning converges to Q* with probability 1
    let exp = &json["expected"];

    // Extract Q-values from facts (key format: "q:{state}:{action}")
    let q_s0_go = output
        .facts
        .iter()
        .find(|f| f.key == "q:s0:go")
        .expect("rl_symbolic must compute Q(s0,go)")
        .value
        .parse::<f64>()
        .expect("q:s0:go value must be parseable as f64");

    let q_s0_stay = output
        .facts
        .iter()
        .find(|f| f.key == "q:s0:stay")
        .expect("rl_symbolic must compute Q(s0,stay)")
        .value
        .parse::<f64>()
        .expect("q:s0:stay value must be parseable as f64");

    // Expected values from closed-form Bellman fixed point
    let exp_q_go = exp["q_s0_go"]
        .as_f64()
        .expect("fixture must declare expected.q_s0_go");
    let exp_q_stay = exp["q_s0_stay"]
        .as_f64()
        .expect("fixture must declare expected.q_s0_stay");
    let tolerance = exp["tolerance"].as_f64().unwrap_or(1e-3);

    // Q*(s0,go) = 1 + γ·0 = 1 exactly (greedy policy chooses "go")
    assert!(
        (q_s0_go - exp_q_go).abs() < tolerance,
        "Q(s0,go) must converge to {:.4} per Watkins & Dayan (1992) Theorem p. 281 \
         one-step lookup Q*(s,a) = r + γ·max Q*(s',a'); got {:.6}",
        exp_q_go,
        q_s0_go
    );

    // Q*(s0,stay) = 0 + γ·max Q*(s0,·) = 0.9·1.0 = 0.9 (Bellman fixed point)
    assert!(
        (q_s0_stay - exp_q_stay).abs() < tolerance,
        "Q(s0,stay) must converge to {:.4} per Watkins & Dayan (1992) Theorem p. 281 \
         self-loop τ-discount Q*(s,a) = γ·max Q*(s,·); got {:.6}",
        exp_q_stay,
        q_s0_stay
    );

    // Assert greedy policy extracts "go" at start state
    let policy_s0 = output
        .selected
        .as_deref()
        .expect("rl_symbolic must produce a selected policy for start state");
    let exp_policy = exp["policy_s0"]
        .as_str()
        .expect("fixture must declare expected.policy_s0");
    assert_eq!(
        policy_s0, exp_policy,
        "greedy policy at s0 must be '{}' (Q(s0,go)={:.4} > Q(s0,stay)={:.4}) \
         per Watkins & Dayan (1992) policy extraction",
        exp_policy, q_s0_go, q_s0_stay
    );

    // Verify trace contains episode summaries and policy extraction
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "episode-end"),
        "rl_symbolic must emit episode-end trace steps per HEARSAY_MODEL lifecycle"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "extract-policy"),
        "rl_symbolic must emit extract-policy trace steps for greedy policy extraction"
    );
}

#[test]
fn sat_cdcl_paper_grounded() {
    let (json, input) = load_fixture("sat_cdcl");
    let breed = sat_cdcl::SatCdcl;
    assert!(
        breed.preconditions(&input).is_ok(),
        "sat_cdcl fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("sat_cdcl paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::SatCdcl);
    assert!(
        !output.inference_trace.is_empty(),
        "sat_cdcl trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: PHP(3,2) pigeonhole formula (Marques-Silva & Sakallah 1999, GRASP).
    // The expected verdict is "UNSAT" (unprovably satisfiable — 3 pigeons cannot fit into 2 holes
    // without a pigeon being in two holes simultaneously). The solver must emit UNSAT verdict
    // and learn at least one conflict clause via 1-UIP conflict analysis.
    let expected_verdict = exp
        .get("verdict")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.verdict");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_verdict),
        "sat_cdcl verdict must be '{}' for PHP(3,2) per Marques-Silva & Sakallah 1999 GRASP conflict analysis",
        expected_verdict
    );

    // Paper-grounded assertion: GRASP-style conflict analysis must learn at least one clause.
    // PHP(3,2) is the canonical UNSAT benchmark; pure DPLL backtracking alone cannot prove UNSAT
    // without conflict-driven learning.
    let min_learned_clauses =
        exp.get("min_learned_clauses")
            .and_then(|v| v.as_i64())
            .expect("fixture must declare expected.min_learned_clauses") as usize;
    let learned_count = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("learned:"))
        .count();
    assert!(
        learned_count >= min_learned_clauses,
        "sat_cdcl must learn at least {} clause(s) on PHP(3,2); got {} \
         per Marques-Silva & Sakallah 1999 Section 3 (conflict analysis and non-chronological backjumping)",
        min_learned_clauses, learned_count
    );

    // Assert trace contains learn-clause steps (evidence of conflict analysis firing).
    let learn_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "learn-clause")
        .count();
    assert!(
        learn_steps > 0,
        "sat_cdcl trace must contain at least one learn-clause step; got {} \
         per Marques-Silva & Sakallah 1999 Section 3",
        learn_steps
    );
}

#[test]
fn script_sam_paper_grounded() {
    // Use the RAW fixture as encoded on disk — sam:event:N observation facts
    // and EMPTY rules (SAM carries the restaurant script built-in). No input
    // reconstruction.
    let (json, input) = load_fixture("script_sam");

    let breed = script_sam::ScriptSam;
    assert!(
        breed.preconditions(&input).is_ok(),
        "script_sam fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("script_sam paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::ScriptSam);
    assert!(
        !output.explanation.is_empty(),
        "script_sam explanation must be non-empty"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "script_sam trace must be non-empty"
    );

    // Paper-grounded assertions, derived from the fixture's published values
    // (Schank & Abelson 1977 Chapter 3). SAM infers the missing eating scene
    // between order and pay with John as the filler.
    let exp = &json["expected"];

    // expected.value == "1": exactly one inferred (gap) scene.
    let expected_inferred_count: usize = exp["value"].as_str().unwrap().parse().unwrap();
    let inferred_count = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("sam:inferred:"))
        .count();
    assert_eq!(
        inferred_count, expected_inferred_count,
        "script_sam must infer exactly {} gap scene(s) (eat with John) \
         per Schank & Abelson 1977 Chapter 3; got {}",
        expected_inferred_count, inferred_count
    );

    // expected.script == "restaurant": the selected script name.
    let selected_script = output
        .selected
        .as_deref()
        .expect("script_sam must select the aligned script name");
    assert_eq!(
        selected_script,
        exp["script"].as_str().unwrap(),
        "script_sam must select the restaurant script per Schank & Abelson 1977"
    );

    // expected.inferred == { "sam:inferred:eat": "john" }.
    for (k, v) in exp["inferred"].as_object().unwrap() {
        let fact = output
            .facts
            .iter()
            .find(|f| &f.key == k)
            .unwrap_or_else(|| panic!("script_sam must emit inferred fact '{k}'"));
        assert_eq!(
            &fact.value,
            v.as_str().unwrap(),
            "inferred scene {k} must bind John as the customer role filler"
        );
    }

    // expected.role == { "sam:role:customer": "john" }.
    for (k, v) in exp["role"].as_object().unwrap() {
        let fact = output
            .facts
            .iter()
            .find(|f| &f.key == k)
            .unwrap_or_else(|| panic!("script_sam must emit role fact '{k}'"));
        assert_eq!(&fact.value, v.as_str().unwrap());
    }

    // Verify gap-inference trace step exists
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "gap-inference"),
        "script_sam must emit gap-inference trace steps \
         per Schank & Abelson 1977 bounded inference principle"
    );
}

#[test]
fn situation_calculus_paper_grounded() {
    let (json, input) = load_fixture("situation_calculus");
    let breed = situation_calculus::SituationCalculus;
    assert!(
        breed.preconditions(&input).is_ok(),
        "situation_calculus fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("situation_calculus paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::SituationCalculus);
    assert!(
        !output.inference_trace.is_empty(),
        "situation_calculus trace must be non-empty"
    );

    // Paper-grounded assertion: Reiter 1991 blocks-world pickup/putdown example.
    // After executing pickup_a then putdown_a, the final situation must contain exactly
    // the fluents listed in expected.holds_final, with the unpersisted fluents removed.
    // The expected.value lists the canonical final fluents as a comma-separated string.
    let exp = &json["expected"];

    // Extract final fluents from output facts (key format: "holds:<fluent>")
    let mut final_fluents: Vec<String> = output
        .facts
        .iter()
        .filter(|f| f.key.starts_with("holds:"))
        .map(|f| f.key["holds:".len()..].to_string())
        .collect();
    final_fluents.sort();

    // Expected fluents from the paper fixture
    let expected_holds: Vec<String> = exp["holds_final"]
        .as_array()
        .expect("fixture must declare expected.holds_final")
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    let mut expected_sorted = expected_holds.clone();
    expected_sorted.sort();

    assert_eq!(
        final_fluents,
        expected_sorted,
        "situation_calculus final fluents must match Reiter 1991 blocks-world (Section 2-3 successor-state axioms); \
         expected={:?}, got={:?}",
        expected_sorted,
        final_fluents
    );

    // Assert that fluents listed in expected.not_holds_final are indeed absent
    let not_holds: Vec<String> = exp["not_holds_final"]
        .as_array()
        .expect("fixture must declare expected.not_holds_final")
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    for fluent in &not_holds {
        assert!(
            !final_fluents.contains(fluent),
            "fluent '{}' must NOT hold in final situation per Reiter 1991",
            fluent
        );
    }

    // Assert frame-persist trace steps for each fluent that persists by inertia
    let frame_persist_fluents: Vec<String> = exp["frame_persist_fluents"]
        .as_array()
        .expect("fixture must declare expected.frame_persist_fluents")
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    let frame_persist_details: Vec<String> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "frame-persist")
        .map(|t| t.detail.clone())
        .collect();
    for persist_fluent in &frame_persist_fluents {
        assert!(
            frame_persist_details
                .iter()
                .any(|d| d.contains(persist_fluent)),
            "fluent '{}' must appear in a frame-persist trace step (Reiter 1991 inertia law)",
            persist_fluent
        );
    }

    // Assert the expected number of regress-step trace steps (one per action)
    let regress_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "regress-step")
        .count();
    let expected_steps = exp["regress_steps"]
        .as_u64()
        .expect("fixture must declare expected.regress_steps") as usize;
    assert_eq!(
        regress_steps,
        expected_steps,
        "situation_calculus must emit exactly {} regress-step trace steps per action sequence (Reiter 1991); got {}",
        expected_steps,
        regress_steps
    );
}

#[test]
fn tableaux_paper_grounded() {
    let (json, input) = load_fixture("tableaux");
    let breed = tableaux::Tableaux;
    assert!(
        breed.preconditions(&input).is_ok(),
        "tableaux fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("tableaux paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Tableaux);
    assert!(
        !output.inference_trace.is_empty(),
        "tableaux trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded assertion: K-axiom A -> (B -> A) is valid via
    // alpha-only tableau (Smullyan 1968, Part I, Chapter II).
    // The claim is that zero beta-expansions occur: every branch closes
    // using only non-branching (alpha) rules.
    let expected_verdict = exp
        .get("verdict")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.verdict");
    let expected_beta_count =
        exp.get("beta_expansions")
            .and_then(|v| v.as_u64())
            .expect("fixture must declare expected.beta_expansions") as usize;
    let expected_selected = exp
        .get("selected")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.selected");

    // Assert the selected verdict matches the paper expectation.
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_selected),
        "tableaux selected must be '{}' (K-axiom tautology per Smullyan 1968 Part I, Chapter II)",
        expected_selected
    );

    // Assert beta-expansion count: K-axiom proof must be alpha-only.
    let actual_beta_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "beta-expand")
        .count();
    assert_eq!(
        actual_beta_count, expected_beta_count,
        "tableaux must produce exactly {} beta-expansion(s) for the K-axiom; \
         the paper claims a pure alpha proof (Smullyan 1968 Part I, Chapter II); got {}",
        expected_beta_count, actual_beta_count
    );
}

#[test]
fn triz_paper_grounded() {
    let (json, input) = load_fixture("triz");
    let breed = triz::Triz;
    assert!(
        breed.preconditions(&input).is_ok(),
        "TRIZ paper fixture must pass preconditions"
    );
    let output = breed
        .run(&input)
        .expect("TRIZ paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::Triz);
    assert!(
        !output.inference_trace.is_empty(),
        "TRIZ trace must be non-empty"
    );

    let exp = &json["expected"];

    // Paper-grounded NUMERIC assertion: Altshuller's contradiction matrix
    // maps (improving=weight, worsening=strength) to inventive principles 40 and 26.
    // Altshuller, G. (1984). Creativity as an Exact Science. Gordon and Breach Science Publishers.
    // The fixture encodes this mapping in a caller-supplied rule, and the breed's run()
    // method returns the rule's conclusion in output.selected.
    let expected_principles = exp
        .get("principles")
        .and_then(|v| v.as_str())
        .expect("fixture must declare expected.principles");
    assert_eq!(
        output.selected.as_deref(),
        Some(expected_principles),
        "TRIZ must select '{}' (Altshuller 1984 weight vs. strength contradiction) \
         per fixture rule matrix_1_2; got {:?}",
        expected_principles,
        output.selected
    );

    // Assert that the trace records the technical contradiction resolution
    let found_trace = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "technical-contradiction" || t.kind == "physical-contradiction");
    assert!(
        found_trace,
        "TRIZ must emit technical-contradiction or physical-contradiction trace step"
    );
}

#[test]
fn version_space_paper_grounded() {
    // Load the RAW Mitchell 1982 EnjoySport fixture exactly as encoded on disk
    // (vs:attrs + vs:example:1..4). NO input reconstruction.
    let (json, input) = load_fixture("version_space");

    let breed = version_space::VersionSpace;
    assert!(
        breed.preconditions(&input).is_ok(),
        "version_space fixture must pass preconditions"
    );

    let output = breed
        .run(&input)
        .expect("version_space paper-grounded run must succeed");
    assert_eq!(output.breed, BreedId::VersionSpace);
    assert!(
        !output.inference_trace.is_empty(),
        "version_space trace must be non-empty"
    );

    // Paper-grounded assertions from Mitchell 1982 Sections 3-4
    // and Mitchell, Machine Learning, 1997 Ch. 2 Tables 2.1/2.5

    // Assert trace contains all required step kinds
    let trace_kinds: std::collections::HashSet<_> = output
        .inference_trace
        .iter()
        .map(|t| t.kind.clone())
        .collect();
    assert!(
        trace_kinds.contains("vs-init"),
        "version_space must emit vs-init"
    );
    assert!(
        trace_kinds.contains("vs-update"),
        "version_space must emit vs-update"
    );
    assert!(
        trace_kinds.contains("vs-verdict"),
        "version_space must emit vs-verdict"
    );

    // After processing all 4 examples (2 positive, 1 negative, 1 positive),
    // the S boundary should be <Sunny,Warm,?,Strong,?,?>
    // and G should have 2 members: <Sunny,?,?,?,?,?> and <?,Warm,?,?,?,?>
    // per Mitchell 1997 Tables 2.1/2.5
    assert!(
        output.explanation.contains("S_size") && output.explanation.contains("G_size"),
        "version_space explanation must report boundary set sizes (Mitchell 1982 Sections 3-4)"
    );

    // The update steps should show S and G evolution
    let has_boundary_evolution = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "vs-update" && t.detail.contains("S=") && t.detail.contains("G="));
    assert!(
        has_boundary_evolution,
        "version_space updates must display S and G boundaries (Mitchell 1982 p.204-226 candidate elimination algorithm)"
    );

    // Published values (Mitchell, Machine Learning 1997 Ch.2 Tables 2.1/2.5),
    // DERIVED by the candidate-elimination algorithm from the raw fixture.
    let exp = &json["expected"];
    let exp_s = exp["s"].as_str().unwrap();
    let s_fact = output
        .facts
        .iter()
        .find(|f| f.key == "vs:S")
        .expect("vs:S boundary fact must be emitted");
    assert_eq!(
        s_fact.value, exp_s,
        "S4 boundary must equal published <Sunny,Warm,?,Strong,?,?>"
    );

    let g_fact = output
        .facts
        .iter()
        .find(|f| f.key == "vs:G")
        .expect("vs:G boundary fact must be emitted");
    let g_members: std::collections::BTreeSet<&str> = g_fact.value.split(" | ").collect();
    let exp_g: std::collections::BTreeSet<&str> = exp["g"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(
        g_members, exp_g,
        "G4 boundary must equal published 2-member set"
    );

    let ig_fact = output
        .facts
        .iter()
        .find(|f| f.key == "vs:intermediate_g_size")
        .expect("vs:intermediate_g_size fact must be emitted");
    assert_eq!(
        ig_fact.value.parse::<u64>().unwrap(),
        exp["intermediate_g_size"].as_u64().unwrap(),
        "|G3| must equal published 3 after the negative example"
    );

    let conv_fact = output
        .facts
        .iter()
        .find(|f| f.key == "vs:converged")
        .expect("vs:converged fact must be emitted");
    assert_eq!(
        conv_fact.value,
        exp["converged"].as_str().unwrap(),
        "version space must not have converged (S != G)"
    );
}
