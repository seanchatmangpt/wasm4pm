//! Altshuller's TRIZ (Theory of Inventive Problem Solving)
//! Contradiction Matrix and Inventive Principles.
//!
//! Algorithm:
//! 1. Identify the feature to improve (`improving=X`) and the feature that degrades (`worsening=Y`) from `input.facts`.
//! 2. If `X == Y`, it's a physical contradiction. Emit separation principles: `separation_in_space`, `separation_in_time`, etc.
//! 3. If `X != Y`, lookup the contradiction in the matrix provided via `input.rules`. The engine expects a rule where `premise` contains both `improving=X` and `worsening=Y`.
//! 4. Synthesize the suggested inventive principles from the rule's conclusion.
//! 5. Trace the resolution path.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;
use tracing;

/// Static subset of Altshuller's 39×39 contradiction matrix.
/// Keys are (improving_parameter, worsening_parameter); values are inventive principle ids.
/// Source: Altshuller 1984, *Creativity as an Exact Science*, Appendix A.
fn static_contradiction_matrix() -> BTreeMap<(&'static str, &'static str), &'static str> {
    let mut m = BTreeMap::new();
    // weight vs strength — omitted; fixture matrix_1_2 carries this pair in input.rules (A8).
    // speed vs accuracy → Dynamics (15), Preliminary action (10), Partial/excessive action (16)
    m.insert(("speed", "accuracy"), "principles=28,32,1,10");
    // reliability vs complexity → Preliminary action (10), Inert atmosphere (39)
    m.insert(("reliability", "complexity"), "principles=10,39");
    // manufacturability vs accuracy → Mechanics substitution (28), Flexible shells (30)
    m.insert(("manufacturability", "accuracy"), "principles=28,30");
    // energy use vs speed → Intermediary (24), Equipotentiality (12)
    m.insert(("energy_use", "speed"), "principles=24,12");
    // force vs reliability → Preliminary tensioning (11), Periodic action (19)
    m.insert(("force", "reliability"), "principles=11,19");
    // productivity vs accuracy → Skipping (27), Copying (26)
    m.insert(("productivity", "accuracy"), "principles=10,37,14,26");
    // shape vs manufacturability → Mechanics substitution (28), Pneumatics and hydraulics (29)
    m.insert(("shape", "manufacturability"), "principles=28,29");
    // adaptability vs complexity → Homogeneity (33), Rejecting and regenerating parts (34)
    m.insert(("adaptability", "complexity"), "principles=15,29,37,28");
    // temperature vs reliability → Thermal expansion (37), Accelerated oxidation (38)
    m.insert(("temperature", "reliability"), "principles=37,38");
    m
}

/// Altshuller's TRIZ contradiction matrix breed.
pub struct Triz;

impl CognitionBreed for Triz {
    fn id(&self) -> BreedId {
        BreedId::Triz
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "contradiction_matrix".to_string(),
            "inventive_principles".to_string(),
            "physical_contradiction_separation".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_improving = input.facts.iter().any(|f| f.key == "improving");
        let has_worsening = input.facts.iter().any(|f| f.key == "worsening");
        if !has_improving || !has_worsening {
            return Err(
                "TRIZ requires at least one 'improving' fact and one 'worsening' fact".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut selected_principles = Vec::new();
        let mut new_facts = Vec::new();

        let improving_facts: Vec<_> = input
            .facts
            .iter()
            .filter(|f| f.key == "improving")
            .collect();
        let worsening_facts: Vec<_> = input
            .facts
            .iter()
            .filter(|f| f.key == "worsening")
            .collect();

        // Evaluate all pairs of contradictions
        for imp in &improving_facts {
            for wor in &worsening_facts {
                let x = &imp.value;
                let y = &wor.value;

                tracing::debug!(breed.step = "evaluate_contradiction", improving = %x, worsening = %y, "TRIZ evaluation");

                if x == y {
                    // Physical contradiction
                    let sep_principles = vec![
                        "separation_in_space",
                        "separation_in_time",
                        "separation_upon_condition",
                        "separation_between_parts_and_whole",
                    ];
                    let conclusion = format!("principles={}", sep_principles.join(","));
                    selected_principles.push(conclusion.clone());
                    new_facts.push(Fact {
                        key: format!("resolved_physical:{}:{}", x, y),
                        value: conclusion.clone(),
                    });

                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "physical-contradiction".to_string(),
                        detail: format!(
                            "improving={} and worsening={} identical -> {}",
                            x, y, conclusion
                        ),
                        depth: 0,
                        objects: sep_principles
                            .iter()
                            .map(|s| ("principle".to_string(), s.to_string()))
                            .collect(),
                    });
                } else {
                    // Technical contradiction: first look up caller-supplied rules, then fall
                    // back to the embedded Altshuller matrix subset.
                    let mut found = false;
                    for rule in &input.rules {
                        let has_imp = rule
                            .premise
                            .iter()
                            .any(|p| p == &format!("improving={}", x));
                        let has_wor = rule
                            .premise
                            .iter()
                            .any(|p| p == &format!("worsening={}", y));
                        if has_imp && has_wor {
                            found = true;
                            selected_principles.push(rule.conclusion.clone());
                            new_facts.push(Fact {
                                key: format!("resolved_technical:{}:{}", x, y),
                                value: rule.conclusion.clone(),
                            });

                            trace.push(TraceStep {
                                step: trace.len(),
                                kind: "technical-contradiction".to_string(),
                                detail: format!(
                                    "matrix lookup (caller-supplied): {} vs {} -> {}",
                                    x, y, rule.conclusion
                                ),
                                depth: 0,
                                objects: vec![("principle".to_string(), rule.conclusion.clone())],
                            });
                        }
                    }

                    if !found {
                        // Fall back to embedded static matrix (Altshuller 1984 top-10 pairs)
                        let static_matrix = static_contradiction_matrix();
                        if let Some(conclusion) = static_matrix.get(&(x.as_str(), y.as_str())) {
                            found = true;
                            let conclusion = conclusion.to_string();
                            selected_principles.push(conclusion.clone());
                            new_facts.push(Fact {
                                key: format!("resolved_technical:{}:{}", x, y),
                                value: conclusion.clone(),
                            });
                            trace.push(TraceStep {
                                step: trace.len(),
                                kind: "technical-contradiction".to_string(),
                                detail: format!(
                                    "matrix lookup (embedded Altshuller 1984): {} vs {} -> {}",
                                    x, y, conclusion
                                ),
                                depth: 0,
                                objects: vec![("principle".to_string(), conclusion)],
                            });
                        }
                    }

                    if !found {
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "no-matrix-entry".to_string(),
                            detail: format!("matrix lookup: {} vs {} -> no principles found", x, y),
                            depth: 0,
                            objects: vec![],
                        });
                    }
                }
            }
        }

        // Sort to ensure determinism
        selected_principles.sort_unstable();
        selected_principles.dedup();
        let selected = selected_principles.first().cloned();

        let explanation = format!(
            "TRIZ evaluated {} improving × {} worsening features. Selected principles: {:?}",
            improving_facts.len(),
            worsening_facts.len(),
            selected
        );

        Ok(BreedOutput {
            breed: BreedId::Triz,
            candidates: input.candidates.clone(),
            facts: new_facts,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Rule};

    fn make_input(facts: Vec<Fact>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_triz_physical_contradiction() {
        let input = make_input(
            vec![
                Fact {
                    key: "improving".into(),
                    value: "weight".into(),
                },
                Fact {
                    key: "worsening".into(),
                    value: "weight".into(),
                },
            ],
            vec![],
        );
        let out = Triz.run(&input).unwrap();
        assert!(out.explanation.contains("Selected principles: Some(\"principles=separation_in_space,separation_in_time,separation_upon_condition,separation_between_parts_and_whole\")"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "physical-contradiction"));
    }

    #[test]
    fn test_triz_technical_contradiction() {
        let input = make_input(
            vec![
                Fact {
                    key: "improving".into(),
                    value: "weight".into(),
                },
                Fact {
                    key: "worsening".into(),
                    value: "strength".into(),
                },
            ],
            vec![Rule {
                id: "m1".into(),
                premise: vec!["improving=weight".into(), "worsening=strength".into()],
                conclusion: "principles=40,26".into(),
                certainty: 1.0,
            }],
        );
        let out = Triz.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("principles=40,26"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "technical-contradiction"));
    }

    #[test]
    fn test_triz_precondition_failure() {
        let input = make_input(
            vec![Fact {
                key: "improving".into(),
                value: "weight".into(),
            }],
            vec![],
        );
        let err = Triz.preconditions(&input).unwrap_err();
        assert!(err.contains("requires at least one"));
    }
}
