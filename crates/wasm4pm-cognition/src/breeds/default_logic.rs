use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::HashSet;

/// DefaultLogic breed: Reiter normal defaults with specificity fixpoint.
pub struct DefaultLogic;

impl CognitionBreed for DefaultLogic {
    fn id(&self) -> BreedId {
        BreedId::DefaultLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "reiter_normal_defaults".to_string(),
            "nonmonotonic_reasoning".to_string(),
            "specificity_fixpoint".to_string(),
            "justification_blocking".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("DefaultLogic requires at least one rule".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        trace.push(TraceStep {
            step: 0,
            kind: "default-load".to_string(),
            detail: format!("Loaded {} rules", input.rules.len()),
            depth: 0,
            objects: vec![],
        });

        let mut extension: HashSet<String> = input
            .facts
            .iter()
            .map(|f| f.value.clone())
            .collect();

        let mut step_idx = 1;
        let mut rules = input.rules.clone();

        // Sort rules by specificity order: premise count (descending), certainty (descending), lex id (descending)
        rules.sort_by(|a, b| {
            b.premise.len().cmp(&a.premise.len())
                .then_with(|| b.certainty.partial_cmp(&a.certainty).unwrap_or(std::cmp::Ordering::Equal))
                .then_with(|| b.id.cmp(&a.id))
        });

        let mut fired_rules = HashSet::new();
        let mut blocked_rules = HashSet::new();

        loop {
            let mut changed = false;

            for rule in &rules {
                if fired_rules.contains(&rule.id) || blocked_rules.contains(&rule.id) {
                    continue;
                }

                let mut prereqs_met = true;
                let mut justification_violator = None;

                for p in &rule.premise {
                    if p.starts_with("unless:") {
                        let violator = p.trim_start_matches("unless:");
                        if extension.contains(violator) {
                            justification_violator = Some(violator.to_string());
                        }
                    } else {
                        if !extension.contains(p) {
                            prereqs_met = false;
                            break;
                        }
                    }
                }

                if prereqs_met {
                    if let Some(violator) = justification_violator {
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "default-block".to_string(),
                            detail: format!("Rule {} blocked by violator {}", rule.id, violator),
                            depth: 0,
                            objects: vec![],
                        });
                        step_idx += 1;
                        blocked_rules.insert(rule.id.clone());
                    } else {
                        trace.push(TraceStep {
                            step: step_idx,
                            kind: "default-fire".to_string(),
                            detail: format!("Fired rule {} inferring {}", rule.id, rule.conclusion),
                            depth: 0,
                            objects: vec![],
                        });
                        step_idx += 1;
                        extension.insert(rule.conclusion.clone());
                        fired_rules.insert(rule.id.clone());
                        changed = true;
                    }
                }
            }

            if !changed {
                break;
            }
        }

        let mut sorted_extension: Vec<String> = extension.into_iter().collect();
        sorted_extension.sort();
        let ext_str = sorted_extension.join(", ");

        trace.push(TraceStep {
            step: step_idx,
            kind: "default-extension".to_string(),
            detail: format!("Extension: {}", ext_str),
            depth: 0,
            objects: vec![],
        });

        let facts = sorted_extension.into_iter().enumerate().map(|(i, v)| Fact {
            key: format!("ext_{}", i),
            value: v,
        }).collect();

        Ok(BreedOutput {
            breed: BreedId::DefaultLogic,
            candidates: vec![],
            facts,
            selected: Some(ext_str.clone()),
            explanation: format!("DefaultLogic: extension finalized with {} facts", ext_str.split(", ").count()),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DefaultLogic must emit at least one trace step".to_string());
        }
        let has_extension = output.inference_trace.iter().any(|t| t.kind == "default-extension");
        if !has_extension {
            return Err("DefaultLogic trace must contain a default-extension step".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Rule;

    fn make_input(facts: Vec<&str>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".to_string(),
            candidates: vec![],
            facts: facts.into_iter().map(|f| Fact { key: f.to_string(), value: f.to_string() }).collect(),
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_preconditions() {
        let breed = DefaultLogic;
        let input = make_input(vec![], vec![]);
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn test_hidden_oracle_glows() {
        let breed = DefaultLogic;
        let rules = vec![
            Rule {
                id: "r1".to_string(),
                premise: vec!["wibble".to_string(), "unless:dark_wibble".to_string()],
                conclusion: "glows".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["dark_wibble".to_string()],
                conclusion: "not_glows".to_string(),
                certainty: 1.0,
            },
        ];
        let input = make_input(vec!["wibble"], rules);
        let output = breed.run(&input).unwrap();
        assert!(output.selected.as_ref().unwrap().contains("glows"));
        assert!(!output.selected.as_ref().unwrap().contains("not_glows"));
        let trace_kinds: Vec<_> = output.inference_trace.iter().map(|t| t.kind.clone()).collect();
        assert!(trace_kinds.contains(&"default-fire".to_string()));
    }

    #[test]
    fn test_hidden_oracle_dark_wibble_blocks() {
        let breed = DefaultLogic;
        let rules = vec![
            Rule {
                id: "r1".to_string(),
                premise: vec!["wibble".to_string(), "unless:dark_wibble".to_string()],
                conclusion: "glows".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["dark_wibble".to_string()],
                conclusion: "not_glows".to_string(),
                certainty: 1.0,
            },
        ];
        let input = make_input(vec!["wibble", "dark_wibble"], rules);
        let output = breed.run(&input).unwrap();
        assert!(output.selected.as_ref().unwrap().contains("not_glows"));
        assert!(!output.selected.as_ref().unwrap().contains(" glows"));
        
        let trace_kinds: Vec<_> = output.inference_trace.iter().map(|t| t.kind.clone()).collect();
        assert!(trace_kinds.contains(&"default-block".to_string()));
        let block_step = output.inference_trace.iter().find(|t| t.kind == "default-block").unwrap();
        assert!(block_step.detail.contains("dark_wibble"));
    }

    #[test]
    fn test_determinism() {
        let breed = DefaultLogic;
        let rules = vec![
            Rule {
                id: "r1".to_string(),
                premise: vec!["a".to_string()],
                conclusion: "b".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["a".to_string()],
                conclusion: "c".to_string(),
                certainty: 1.0,
            },
        ];
        let input = make_input(vec!["a"], rules);
        let out1 = breed.run(&input).unwrap();
        let out2 = breed.run(&input).unwrap();
        assert_eq!(out1.selected, out2.selected);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
