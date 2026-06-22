use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep, Candidate
};
use std::collections::{HashSet, HashMap};

/// Abduction by Inference to the Best Explanation (IBE) breed using Thagard's ECHO model.
pub struct AbductiveIbe;

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
            return Err("AbductiveIbe requires facts to define evidence/hypotheses".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;

        // 1. Extract evidence, hypotheses, explanations, and contradictions
        let mut evidence = HashSet::new();
        let mut hypotheses = HashSet::new();
        let mut explains = HashSet::new(); // (hypothesis, explained_node)
        let mut contradicts = HashSet::new(); // (node1, node2)

        for f in &input.facts {
            if f.key == "evidence" {
                evidence.insert(f.value.clone());
            } else if f.key == "hypothesis" {
                hypotheses.insert(f.value.clone());
            } else if f.key == "contradicts" || f.key == "competes" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() == 2 {
                    let h1 = parts[0].trim().to_string();
                    let h2 = parts[1].trim().to_string();
                    contradicts.insert((h1.clone(), h2.clone()));
                    contradicts.insert((h2, h1));
                }
            }
        }

        // Candidates automatically act as hypotheses if not explicitly listed
        for c in &input.candidates {
            hypotheses.insert(c.id.clone());
        }

        // Explanations from rules: if premise derives conclusion, premise explains conclusion
        for r in &input.rules {
            if r.conclusion == "false" {
                // Rules with conclusion "false" and 2 premises are treated as contradictions
                if r.premise.len() == 2 {
                    let h1 = r.premise[0].clone();
                    let h2 = r.premise[1].clone();
                    contradicts.insert((h1.clone(), h2.clone()));
                    contradicts.insert((h2, h1));
                }
            } else {
                for p in &r.premise {
                    explains.insert((p.clone(), r.conclusion.clone()));
                }
            }
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "ibe-load".to_string(),
            detail: format!(
                "Loaded {} evidence, {} hypotheses, {} explains, {} contradicts",
                evidence.len(),
                hypotheses.len(),
                explains.len(),
                contradicts.len() / 2
            ),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        // 2. Initialize ECHO network
        let all_nodes: HashSet<String> = evidence.union(&hypotheses).cloned().collect();
        let nodes_list: Vec<String> = {
            let mut list: Vec<String> = all_nodes.into_iter().collect();
            list.sort();
            list
        };

        let mut activations: HashMap<String, f32> = HashMap::new();
        for node in &nodes_list {
            activations.insert(node.clone(), if evidence.contains(node) { 1.0 } else { 0.01 });
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "ibe-explain".to_string(),
            detail: format!("Running ECHO network over {} nodes", nodes_list.len()),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        // ECHO Connectionist Update Parameters
        let decay = 0.05;
        let max_act = 1.0;
        let min_act = -1.0;
        let weight_coherence = 0.05;
        let weight_incoherence = -0.2;
        let weight_evidence_link = 0.1;

        // Run activation updates for 100 iterations (converges deterministically)
        for _iter in 0..100 {
            let current = activations.clone();
            for node in &nodes_list {
                let mut net = 0.0;

                // Coherence weights (explains)
                for (h, e) in &explains {
                    if h == node {
                        net += weight_coherence * current.get(e).unwrap_or(&0.0);
                    } else if e == node {
                        net += weight_coherence * current.get(h).unwrap_or(&0.0);
                    }
                }

                // Incoherence weights (contradicts)
                for (n1, n2) in &contradicts {
                    if n1 == node {
                        net += weight_incoherence * current.get(n2).unwrap_or(&0.0);
                    }
                }

                // Evidence external link
                if evidence.contains(node) {
                    net += weight_evidence_link * 1.0;
                }

                let act = *current.get(node).unwrap_or(&0.0);
                let new_act = if net > 0.0 {
                    act * (1.0 - decay) + net * (max_act - act)
                } else {
                    act * (1.0 - decay) + net * (act - min_act)
                };

                // Clamp new activation
                let clamped = new_act.max(min_act).min(max_act);
                activations.insert(node.clone(), clamped);
            }
        }

        // Trace the resulting activations
        let mut sorted_activations: Vec<(String, f32)> = activations.iter().map(|(k, v)| (k.clone(), *v)).collect();
        sorted_activations.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));

        let mut out_facts = Vec::new();
        for (node, act) in &sorted_activations {
            out_facts.push(Fact {
                key: format!("activation:{}", node),
                value: format!("{:.4}", act),
            });
        }

        // Select the hypothesis with the highest activation
        let mut selected = None;
        let mut best_act = -1.0;
        for (node, act) in &sorted_activations {
            if hypotheses.contains(node) && *act > best_act {
                best_act = *act;
                selected = Some(node.clone());
            }
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "ibe-select".to_string(),
            detail: format!("Selected best explanation: {:?} with activation {:.4}", selected, best_act),
            depth: 0,
            objects: vec![],
        });
        step_count += 1;

        // Score candidates based on their activation mapped to [0.0, 1.0]
        let mut candidates = input.candidates.clone();
        for cand in &mut candidates {
            if let Some(act) = activations.get(&cand.id) {
                // Map [-1.0, 1.0] to [0.0, 1.0]
                cand.score = (act + 1.0) / 2.0;
                if Some(&cand.id) == selected.as_ref() && *act <= 0.0 {
                    cand.eliminated = true;
                    cand.elimination_reason = Some("Hypothesis rejected by explanatory coherence".to_string());
                }
            }
        }

        let explanation = format!(
            "IBE: Explanatory coherence (ECHO) finalized. Best hypothesis: {:?} (activation: {:.4})",
            selected,
            best_act
        );

        Ok(BreedOutput {
            breed: BreedId::AbductiveIbe,
            candidates,
            facts: out_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("AbductiveIbe must emit at least one trace step".to_string());
        }
        let has_select = output.inference_trace.iter().any(|t| t.kind == "ibe-select");
        if !has_select {
            return Err("AbductiveIbe trace must contain an ibe-select step".to_string());
        }
        Ok(())
    }
}
