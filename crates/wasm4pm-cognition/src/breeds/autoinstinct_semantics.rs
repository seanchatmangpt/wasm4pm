//! AutoInstinct Semantics breed — NLU via Schank Conceptual Dependency primitives.
//!
//! Algorithm:
//! 1. Validate `input.intent` is non-empty (precondition).
//! 2. Create a `SemanticParser` with the built-in English verb lexicon.
//! 3. Call `parser.parse(&input.intent)` to extract a `SemanticFrame`.
//! 4. Build an inference trace: one step per parse outcome.
//! 5. Encode the extracted frame as the selected output.
//! 6. Return `BreedOutput` with candidates listing each extracted act.

use crate::autoinstinct::semantics::{PrimitiveAct, SemanticParser};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, Rule, TraceStep,
};
use tracing;

/// AutoInstinct Semantics breed: NLU, semantic frame extraction, Schank CD primitives.
pub struct AutoinstinctSemantics;

impl CognitionBreed for AutoinstinctSemantics {
    fn id(&self) -> BreedId {
        BreedId::AutoinstinctSemantics
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "natural_language_understanding".to_string(),
            "semantic_frame_extraction".to_string(),
            "schank_cd_primitives".to_string(),
            "eliza_shrdlu_pattern_matching".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.intent.trim().is_empty() {
            return Err(
                "AutoinstinctSemantics requires a non-empty intent sentence to parse".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let parser = SemanticParser::new();
        let mut trace: Vec<TraceStep> = Vec::new();

        trace.push(TraceStep {
            step: 0,
            kind: "init-parser".to_string(),
            detail: format!("SemanticParser created; parsing intent: {:?}", input.intent),
            depth: 0,
            objects: vec![],
        });

        let frame_opt = parser.parse(&input.intent);
        tracing::debug!(
            breed.step = "token_parsed",
            breed = "autoinstinct_semantics",
            "L1 inference step"
        );

        let (selected, candidates, explanation, facts) = match &frame_opt {
            None => {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "no-act-found".to_string(),
                    detail: format!("no CD primitive matched for intent: {:?}", input.intent),
                    depth: 0,
                    objects: vec![],
                });
                (
                    None,
                    vec![],
                    format!(
                        "AutoinstinctSemantics could not parse a semantic frame from: {:?}",
                        input.intent
                    ),
                    vec![],
                )
            }
            Some(frame) => {
                let act_name = format!("{:?}", frame.act);
                tracing::debug!(
                    breed.step = "cd_primitive_identified",
                    breed = "autoinstinct_semantics",
                    "L1 inference step"
                );
                let act_description = match &frame.act {
                    PrimitiveAct::Atrans => "transfer of abstract relationship (e.g. give)",
                    PrimitiveAct::Ptrans => "transfer of physical location (e.g. go)",
                    PrimitiveAct::Propel => "application of physical force (e.g. push)",
                    PrimitiveAct::Mtrans => "transfer of mental information (e.g. tell)",
                    PrimitiveAct::Mbuild => "construction of new information (e.g. think)",
                    PrimitiveAct::Speak => "production of sound (e.g. say)",
                    PrimitiveAct::Attend => "focusing a sense organ (e.g. listen)",
                };

                let rule_id = format!("sem-{}", act_name.to_uppercase());

                tracing::debug!(
                    breed.step = "actor_bound",
                    breed = "autoinstinct_semantics",
                    "L1 inference step"
                );
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "extract-act".to_string(),
                    detail: format!(
                        "rule={} act={} actor={} object={}",
                        rule_id, act_name, frame.actor, frame.object
                    ),
                    depth: 0,
                    objects: vec![],
                });

                if let Some(ref to) = frame.to {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "extract-recipient".to_string(),
                        detail: format!("to={}", to),
                        depth: 0,
                        objects: vec![],
                    });
                }
                if let Some(ref from) = frame.from {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "extract-source".to_string(),
                        detail: format!("from={}", from),
                        depth: 0,
                        objects: vec![],
                    });
                }

                tracing::debug!(
                    breed.step = "relation_extracted",
                    breed = "autoinstinct_semantics",
                    "L1 inference step"
                );
                let selected_json = serde_json::json!({
                    "act": act_name,
                    "actor": frame.actor,
                    "object": frame.object,
                    "to": frame.to,
                    "from": frame.from,
                });

                let mut new_facts: Vec<Fact> = vec![
                    Fact {
                        key: "act".to_string(),
                        value: act_name.clone(),
                    },
                    Fact {
                        key: "actor".to_string(),
                        value: frame.actor.clone(),
                    },
                    Fact {
                        key: "object".to_string(),
                        value: frame.object.clone(),
                    },
                ];
                if let Some(ref to) = frame.to {
                    new_facts.push(Fact {
                        key: "to".to_string(),
                        value: to.clone(),
                    });
                }
                if let Some(ref from) = frame.from {
                    new_facts.push(Fact {
                        key: "from".to_string(),
                        value: from.clone(),
                    });
                }

                let explanation = format!(
                    "AutoinstinctSemantics extracted CD primitive {} ({}) from actor={} object={}",
                    act_name, act_description, frame.actor, frame.object
                );

                (
                    Some(selected_json.to_string()),
                    vec![act_name],
                    explanation,
                    new_facts,
                )
            }
        };

        // Map candidates (act name strings) into Candidate structs.
        let candidate_structs: Vec<crate::breeds::Candidate> = candidates
            .iter()
            .map(|act| crate::breeds::Candidate {
                id: act.clone(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            })
            .collect();

        Ok(BreedOutput {
            breed: BreedId::AutoinstinctSemantics,
            candidates: candidate_structs,
            facts,
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

    fn base_input(intent: &str) -> BreedInput {
        BreedInput {
            intent: intent.to_string(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn precondition_rejects_empty_intent() {
        let breed = AutoinstinctSemantics;
        let result = breed.preconditions(&base_input(""));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("non-empty intent"));
    }

    #[test]
    fn precondition_rejects_whitespace_intent() {
        let breed = AutoinstinctSemantics;
        let result = breed.preconditions(&base_input("   "));
        assert!(result.is_err());
    }

    #[test]
    fn precondition_accepts_non_empty_intent() {
        let breed = AutoinstinctSemantics;
        let result = breed.preconditions(&base_input("John give book"));
        assert!(result.is_ok());
    }

    #[test]
    fn run_extracts_atrans_from_give() {
        let breed = AutoinstinctSemantics;
        let output = breed.run(&base_input("John give book")).expect("run ok");
        assert!(
            !output.inference_trace.is_empty(),
            "trace must be non-empty"
        );
        assert!(
            output.selected.is_some(),
            "should select a semantic frame JSON"
        );
        let sel = output.selected.unwrap();
        assert!(sel.contains("Atrans"), "act should be Atrans, got: {}", sel);
        assert!(sel.contains("John"), "actor should be John");
        assert!(sel.contains("book"), "object should be book");
    }

    #[test]
    fn run_extracts_recipient_field() {
        let breed = AutoinstinctSemantics;
        let output = breed
            .run(&base_input("John give book to Mary"))
            .expect("run ok");
        let sel = output.selected.unwrap();
        assert!(sel.contains("Mary"), "to field should contain Mary");
        let has_recipient_step = output
            .inference_trace
            .iter()
            .any(|t| t.kind == "extract-recipient" && t.detail.contains("Mary"));
        assert!(
            has_recipient_step,
            "trace should record extract-recipient step"
        );
    }

    #[test]
    fn run_extracts_source_field() {
        let breed = AutoinstinctSemantics;
        let output = breed
            .run(&base_input("John go store from home"))
            .expect("run ok");
        let sel = output.selected.unwrap();
        assert!(sel.contains("home"), "from field should contain home");
        let has_source_step = output
            .inference_trace
            .iter()
            .any(|t| t.kind == "extract-source" && t.detail.contains("home"));
        assert!(has_source_step, "trace should record extract-source step");
    }

    #[test]
    fn run_no_act_found_still_has_trace() {
        let breed = AutoinstinctSemantics;
        let output = breed
            .run(&base_input("some unknown sentence here"))
            .expect("run ok");
        assert!(
            !output.inference_trace.is_empty(),
            "trace must be non-empty even when no act found"
        );
        let has_no_act = output
            .inference_trace
            .iter()
            .any(|t| t.kind == "no-act-found");
        assert!(has_no_act, "should have no-act-found step");
        assert!(
            output.selected.is_none(),
            "selected should be None when no act found"
        );
    }

    #[test]
    fn postcondition_rejects_empty_trace() {
        let breed = AutoinstinctSemantics;
        let output = BreedOutput {
            breed: BreedId::AutoinstinctSemantics,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: "test".to_string(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        };
        let result = breed.postconditions(&base_input(""), &output);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty inference trace"));
    }

    #[test]
    fn capabilities_include_schank_cd_primitives() {
        let breed = AutoinstinctSemantics;
        let caps = breed.capabilities();
        assert!(caps.iter().any(|c| c.contains("schank_cd_primitives")));
    }
}
