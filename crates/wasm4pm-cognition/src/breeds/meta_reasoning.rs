//! Meta-Reasoning conflict resolver (Cox & Raja 2011).
//!
//! Consumes facts from prior breeds (`breed:<id>:conclusion/confidence`).
//! Performs pairwise conflict detection:
//! - differing values for the same decision key
//! - explicit negation (P vs not_P)
//! - confidence divergence > 0.5 for the same conclusion
//!
//! Votes by confidence-weight, resolves conflicts via lex tiebreak.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// The Meta-Reasoning breed (Cox & Raja 2011) that resolves conflicts.
pub struct MetaReasoning;

#[derive(Debug, Clone)]
struct Report {
    breed_id: String,
    conclusion: String,
    confidence: f32,
    key: String,
    base_val: String,
    negated: bool,
}

impl Report {
    fn parse(breed_id: String, conclusion: String, confidence: f32) -> Self {
        let (key, val) = if let Some((k, v)) = conclusion.split_once('=') {
            (k.to_string(), v.to_string())
        } else {
            ("".to_string(), conclusion.clone())
        };

        let (base_val, negated) = if let Some(stripped) = val.strip_prefix("not_") {
            (stripped.to_string(), true)
        } else {
            (val, false)
        };

        Self {
            breed_id,
            conclusion,
            confidence,
            key,
            base_val,
            negated,
        }
    }
}

impl CognitionBreed for MetaReasoning {
    fn id(&self) -> BreedId {
        BreedId::MetaReasoning
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "conflict_detection".to_string(),
            "confidence_voting".to_string(),
        ]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // 1. Ingest reports
        // Facts expected: "breed:<id>:conclusion" = "...", "breed:<id>:confidence" = "0.9"
        let mut concs = BTreeMap::new();
        let mut confs = BTreeMap::new();

        for f in &input.facts {
            if let Some(rest) = f.key.strip_prefix("breed:") {
                if let Some((breed_id, suffix)) = rest.split_once(':') {
                    if suffix == "conclusion" {
                        concs.insert(breed_id.to_string(), f.value.clone());
                    } else if suffix == "confidence" {
                        if let Ok(cf) = f.value.parse::<f32>() {
                            confs.insert(breed_id.to_string(), cf);
                        }
                    }
                }
            }
        }

        let mut reports = Vec::new();
        for (b, c) in concs {
            let cf = confs.get(&b).copied().unwrap_or(1.0);
            reports.push(Report::parse(b, c, cf));
        }

        // Sort reports for deterministic trace
        reports.sort_by(|a, b| a.breed_id.cmp(&b.breed_id));

        for r in &reports {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ingest-report".to_string(),
                detail: format!("{}: {} (cf={:.3})", r.breed_id, r.conclusion, r.confidence),
                depth: 0,
                objects: vec![],
            });
        }

        // 2. Conflict detection (pairwise, i < j)
        for i in 0..reports.len() {
            for j in (i + 1)..reports.len() {
                let r1 = &reports[i];
                let r2 = &reports[j];

                if r1.key == r2.key {
                    let mut conflict_reason = None;

                    if r1.base_val != r2.base_val {
                        conflict_reason = Some("differing values".to_string());
                    } else if r1.negated != r2.negated {
                        conflict_reason = Some("explicit negation".to_string());
                    } else if (r1.confidence - r2.confidence).abs() > 0.5 {
                        conflict_reason = Some("confidence divergence > 0.5".to_string());
                    }

                    if let Some(reason) = conflict_reason {
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "conflict-detected".to_string(),
                            detail: format!("{} vs {}: {}", r1.breed_id, r2.breed_id, reason),
                            depth: 0,
                            objects: vec![],
                        });
                    }
                }
            }
        }

        // 3. Vote per decision key
        // Map: key -> conclusion -> sum(confidence)
        let mut votes: BTreeMap<String, BTreeMap<String, f32>> = BTreeMap::new();
        for r in &reports {
            *votes
                .entry(r.key.clone())
                .or_default()
                .entry(r.conclusion.clone())
                .or_default() += r.confidence;
        }

        let mut final_selected = None;
        let mut winners = BTreeSet::new();

        for (k, options) in &votes {
            // Sort options by score descending, then by conclusion string lex
            let mut opts_sorted: Vec<(String, f32)> = options.clone().into_iter().collect();
            opts_sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then_with(|| a.0.cmp(&b.0)));

            let vote_details = opts_sorted
                .iter()
                .map(|(c, s)| format!("{}={:.3}", c, s))
                .collect::<Vec<_>>()
                .join(", ");

            trace.push(TraceStep {
                step: trace.len(),
                kind: "vote".to_string(),
                detail: format!("key '{}': {}", k, vote_details),
                depth: 0,
                objects: vec![],
            });

            if let Some((win_c, _)) = opts_sorted.first() {
                winners.insert(win_c.clone());
            }
        }

        let mut winners_sorted: Vec<String> = winners.into_iter().collect();
        winners_sorted.sort();

        if let Some(first) = winners_sorted.first() {
            final_selected = Some(first.clone());
            trace.push(TraceStep {
                step: trace.len(),
                kind: "resolve".to_string(),
                detail: format!("winning conclusion: {}", first),
                depth: 0,
                objects: vec![],
            });
        }

        let explanation = format!(
            "Meta-reasoning complete. Processed {} reports, selected {:?}",
            reports.len(),
            final_selected
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: Vec::new(),
            selected: final_selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Empty trace: meta_reasoning must emit steps if reports exist".to_string());
        }
        Ok(())
    }
}
