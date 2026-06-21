//! AutoinstinctNeurosis breed — Artificial Neurosis / Ideology Machine (Colby/Abelson lineage).
//!
//! Algorithm:
//! 1. Parse `input.facts` as belief seeds ("belief:CONCEPT:STRENGTH" or plain "CONCEPT=VALUE").
//! 2. Pre-load a `NeuroticState` with parsed beliefs.
//! 3. Collect stimuli from `input.candidates` (using their `id` field); fall back to
//!    `"default_stimulus"` if the candidate list is empty.
//! 4. For each stimulus, call `state.process_input(stimulus, strength)` where `strength`
//!    is parsed from the candidate score, defaulting to 0.5.
//! 5. Record one `TraceStep` per `process_input` call (kind = response label).
//! 6. Emit a `BreedOutput` whose `selected` field is a JSON description of the final
//!    affect state and whose `candidates` carry per-stimulus affect deltas.

use crate::autoinstinct::neurosis::NeuroticState;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, Fact, TraceStep,
};
use tracing;

/// AutoinstinctNeurosis breed: simulates paranoid / affect-driven belief processing
/// in the tradition of Colby's PARRY and Abelson's ideology machines.
pub struct AutoinstinctNeurosis;

/// Parse `input.facts` into (concept, strength) pairs for belief seeding.
///
/// Accepted formats (in priority order):
/// - `"belief:CONCEPT:STRENGTH"` — explicit strength as f64 string
/// - `"key=value"` — treated as concept="key=value", strength=0.5
fn parse_beliefs(facts: &[Fact]) -> Vec<(String, f64)> {
    facts
        .iter()
        .map(|f| {
            // Try "belief:CONCEPT:STRENGTH"
            if f.key == "belief" {
                let strength: f64 = f.value.parse().unwrap_or(0.5);
                (f.key.clone(), strength.clamp(0.0, 1.0))
            } else if f.key.starts_with("belief:") {
                // key = "belief:CONCEPT", value = strength string
                let concept = f.key.trim_start_matches("belief:").to_string();
                let strength: f64 = f.value.parse().unwrap_or(0.5);
                (concept, strength.clamp(0.0, 1.0))
            } else {
                // Plain fact: concept = "key=value", neutral strength
                let concept = format!("{}={}", f.key, f.value);
                (concept, 0.5)
            }
        })
        .collect()
}

impl CognitionBreed for AutoinstinctNeurosis {
    fn id(&self) -> BreedId {
        BreedId::AutoinstinctNeurosis
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "affect_simulation".to_string(),
            "belief_network".to_string(),
            "neurotic_state_tracking".to_string(),
            "paranoia_modeling".to_string(),
            "ideology_machine".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err(
                "AutoinstinctNeurosis requires at least one fact to seed the belief network"
                    .to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut state = NeuroticState::new();
        let mut trace: Vec<TraceStep> = Vec::new();
        let mut output_candidates: Vec<Candidate> = Vec::new();

        // Step 1: seed beliefs from facts.
        let beliefs = parse_beliefs(&input.facts);
        for (concept, strength) in &beliefs {
            state.beliefs.insert(concept.clone(), *strength);
            tracing::debug!(
                breed.step = "belief_evaluated",
                breed = "autoinstinct_neurosis",
                "L1 inference step"
            );
        }
        trace.push(TraceStep {
            step: trace.len(),
            kind: "seed-beliefs".to_string(),
            detail: format!("seeded {} beliefs from facts", beliefs.len()),
            depth: 0,
            objects: vec![],
        });

        // Step 2: collect stimuli — use candidate ids, or fall back to "default_stimulus".
        let stimuli: Vec<(String, f64)> = if input.candidates.is_empty() {
            vec![("default_stimulus".to_string(), 0.5)]
        } else {
            input
                .candidates
                .iter()
                .map(|c| (c.id.clone(), c.score as f64))
                .collect()
        };

        // Step 3: process each stimulus through the neurotic state.
        for (stimulus, strength) in &stimuli {
            let snap_fear = state.fear;
            let snap_anger = state.anger;
            let snap_mistrust = state.mistrust;

            let response = state.process_input(stimulus, *strength);
            tracing::debug!(
                breed.step = "conflict_detected",
                breed = "autoinstinct_neurosis",
                "L1 inference step"
            );

            let delta_fear = state.fear - snap_fear;
            let delta_anger = state.anger - snap_anger;
            let delta_mistrust = state.mistrust - snap_mistrust;
            tracing::debug!(
                breed.step = "anxiety_computed",
                breed = "autoinstinct_neurosis",
                "L1 inference step"
            );

            trace.push(TraceStep {
                step: trace.len(),
                kind: response.to_string(),
                detail: format!(
                    "stimulus=\"{}\" strength={:.3} Δfear={:+.3} Δanger={:+.3} Δmistrust={:+.3}",
                    stimulus, strength, delta_fear, delta_anger, delta_mistrust
                ),
                depth: 0,
                objects: vec![],
            });

            tracing::debug!(
                breed.step = "resolution_proposed",
                breed = "autoinstinct_neurosis",
                "L1 inference step"
            );
            // Emit a candidate describing the affect change for this stimulus.
            output_candidates.push(Candidate {
                id: stimulus.clone(),
                score: (1.0 - state.fear as f32).clamp(0.0, 1.0),
                eliminated: response == "defensive",
                elimination_reason: if response == "defensive" {
                    Some(format!(
                        "defensive response: fear={:.3} anger={:.3}",
                        state.fear, state.anger
                    ))
                } else {
                    None
                },
            });
        }

        // Step 4: record final affect snapshot.
        trace.push(TraceStep {
            step: trace.len(),
            kind: "affect-snapshot".to_string(),
            detail: format!(
                "fear={:.3} anger={:.3} mistrust={:.3} beliefs={}",
                state.fear,
                state.anger,
                state.mistrust,
                state.beliefs.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // Step 5: serialize selected as affect summary.
        let selected = Some(format!(
            r#"{{"fear":{:.3},"anger":{:.3},"mistrust":{:.3},"belief_count":{}}}"#,
            state.fear,
            state.anger,
            state.mistrust,
            state.beliefs.len()
        ));

        let dominant_affect = if state.anger >= state.fear && state.anger >= state.mistrust {
            "anger"
        } else if state.fear >= state.mistrust {
            "fear"
        } else {
            "mistrust"
        };

        let explanation = format!(
            "AutoinstinctNeurosis: processed {} stimuli over {} beliefs; dominant affect={}; fear={:.3} anger={:.3} mistrust={:.3}",
            stimuli.len(),
            beliefs.len(),
            dominant_affect,
            state.fear,
            state.anger,
            state.mistrust
        );

        Ok(BreedOutput {
            breed: BreedId::AutoinstinctNeurosis,
            candidates: output_candidates,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn make_input(facts: Vec<Fact>, candidates: Vec<Candidate>) -> BreedInput {
        BreedInput {
            intent: "neurosis test".into(),
            candidates,
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn precondition_rejects_empty_facts() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(vec![], vec![]);
        let result = breed.preconditions(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least one fact"));
    }

    #[test]
    fn precondition_accepts_non_empty_facts() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(
            vec![Fact {
                key: "authority".into(),
                value: "0.9".into(),
            }],
            vec![],
        );
        assert!(breed.preconditions(&input).is_ok());
    }

    #[test]
    fn run_produces_non_empty_trace() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(
            vec![Fact {
                key: "belief:authority".into(),
                value: "0.9".into(),
            }],
            vec![],
        );
        let output = breed.run(&input).expect("run should succeed");
        assert!(
            !output.inference_trace.is_empty(),
            "trace must be non-empty"
        );
    }

    #[test]
    fn run_with_default_stimulus_when_no_candidates() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(
            vec![Fact {
                key: "belief:authority".into(),
                value: "0.9".into(),
            }],
            vec![],
        );
        let output = breed.run(&input).expect("run ok");
        // Should have one candidate: "default_stimulus"
        assert_eq!(output.candidates.len(), 1);
        assert_eq!(output.candidates[0].id, "default_stimulus");
    }

    #[test]
    fn run_emits_selected_as_json_affect_state() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(
            vec![Fact {
                key: "belief:authority".into(),
                value: "0.9".into(),
            }],
            vec![],
        );
        let output = breed.run(&input).expect("run ok");
        let selected = output.selected.expect("selected should be Some");
        assert!(selected.contains("fear"), "selected must contain 'fear'");
        assert!(selected.contains("anger"), "selected must contain 'anger'");
        assert!(
            selected.contains("mistrust"),
            "selected must contain 'mistrust'"
        );
    }

    #[test]
    fn run_defensive_response_marks_candidate_eliminated() {
        let breed = AutoinstinctNeurosis;
        // Seed high conviction in "authority" (1.0), then present conflicting stimulus
        // with low strength (0.0) — triggers defensive response.
        let input = make_input(
            vec![Fact {
                key: "belief:authority".into(),
                value: "1.0".into(),
            }],
            vec![Candidate {
                id: "authority".into(),
                score: 0.0, // strength=0.0, conflicts with belief=1.0
                eliminated: false,
                elimination_reason: None,
            }],
        );
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.candidates.len(), 1);
        // High conflict (1.0 vs 0.0 → conflict 1.0 > 0.5) → defensive → eliminated
        assert!(
            output.candidates[0].eliminated,
            "defensive response should mark candidate eliminated"
        );
    }

    #[test]
    fn run_accepting_response_does_not_eliminate_candidate() {
        let breed = AutoinstinctNeurosis;
        // Seed belief at 0.7, present stimulus at 0.75 — conflict < 0.5 → accepting.
        let input = make_input(
            vec![Fact {
                key: "belief:policy".into(),
                value: "0.7".into(),
            }],
            vec![Candidate {
                id: "policy".into(),
                score: 0.75,
                eliminated: false,
                elimination_reason: None,
            }],
        );
        let output = breed.run(&input).expect("run ok");
        assert_eq!(output.candidates.len(), 1);
        assert!(
            !output.candidates[0].eliminated,
            "accepting response should NOT eliminate candidate"
        );
    }

    #[test]
    fn postcondition_fails_on_empty_trace() {
        let breed = AutoinstinctNeurosis;
        let output = BreedOutput {
            breed: BreedId::AutoinstinctNeurosis,
            candidates: vec![],
            facts: vec![],
            selected: None,
            explanation: "empty".into(),
            inference_trace: vec![],
            ocel_log: None,
            retained_cases: vec![],
        };
        assert!(breed
            .postconditions(&make_input(vec![], vec![]), &output)
            .is_err());
    }

    #[test]
    fn run_multiple_stimuli_produce_one_trace_step_each() {
        let breed = AutoinstinctNeurosis;
        let input = make_input(
            vec![Fact {
                key: "belief:topic".into(),
                value: "0.5".into(),
            }],
            vec![
                Candidate {
                    id: "s1".into(),
                    score: 0.4,
                    eliminated: false,
                    elimination_reason: None,
                },
                Candidate {
                    id: "s2".into(),
                    score: 0.6,
                    eliminated: false,
                    elimination_reason: None,
                },
                Candidate {
                    id: "s3".into(),
                    score: 0.9,
                    eliminated: false,
                    elimination_reason: None,
                },
            ],
        );
        let output = breed.run(&input).expect("run ok");
        // seed-beliefs + 3 stimulus steps + affect-snapshot = 5 steps
        assert_eq!(output.candidates.len(), 3);
        let stimulus_steps: Vec<_> = output
            .inference_trace
            .iter()
            .filter(|t| t.kind != "seed-beliefs" && t.kind != "affect-snapshot")
            .collect();
        assert_eq!(stimulus_steps.len(), 3, "one trace step per stimulus");
    }
}
