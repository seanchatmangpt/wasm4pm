//! Meta-reasoning: cross-breed conflict detection and confidence-weighted
//! resolution (Cox & Raja 2011, "Metareasoning: Thinking about Thinking",
//! MIT Press — the meta-level monitors object-level reasoners and arbitrates).
//!
//! The HOST fans prior breed outputs into facts — there are NO Rust-side
//! cross-breed calls:
//! - `breed:<id>:conclusion` = `<key>=<value>` (or a bare value)
//! - `breed:<id>:confidence` = float in [0,1]
//!
//! Pipeline: ingest-report+ → conflict-detected* → vote+ → resolve.
//!
//! Conflict criteria (pairwise, lexicographic pair order):
//! 1. same decision key, differing values;
//! 2. explicit negation (`x` vs `not_x` values on the same key);
//! 3. identical conclusion but confidence divergence > 0.5.
//!
//! Resolution: per decision key, confidence-weighted vote over values; the
//! winner is the value with the greatest summed confidence (lexicographic
//! least value on ties). All confidences are rendered with fixed precision
//! (`{:.6}`) for bit-stable receipts.

use crate::breeds::support::breed_class::VerifierBreed;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

/// Cross-breed conflict detector + confidence-weighted voter.
pub struct MetaReasoning;

const MAX_REPORTS: usize = 64;
const CONF_DIVERGENCE: f64 = 0.5;

/// Parsed object-level report.
#[derive(Debug, Clone)]
struct Report {
    breed: String,
    key: String,
    value: String,
    confidence: f64,
}

fn parse_reports(input: &BreedInput) -> Result<Vec<Report>, String> {
    let mut conclusions: BTreeMap<String, String> = BTreeMap::new();
    let mut confidences: BTreeMap<String, f64> = BTreeMap::new();
    for f in &input.facts {
        if let Some(rest) = f.key.strip_prefix("breed:") {
            if let Some(id) = rest.strip_suffix(":conclusion") {
                conclusions.insert(id.to_string(), f.value.clone());
            } else if let Some(id) = rest.strip_suffix(":confidence") {
                let c: f64 = f
                    .value
                    .parse()
                    .map_err(|_| format!("confidence for '{}' is not a number: '{}'", id, f.value))?;
                if !(0.0..=1.0).contains(&c) {
                    return Err(format!("confidence for '{}' out of [0,1]: {}", id, c));
                }
                confidences.insert(id.to_string(), c);
            }
        }
    }
    let mut reports = Vec::new();
    for (id, conclusion) in &conclusions {
        let confidence = *confidences
            .get(id)
            .ok_or_else(|| format!("breed '{}' has a conclusion but no confidence", id))?;
        let (key, value) = match conclusion.split_once('=') {
            Some((k, v)) => (k.to_string(), v.to_string()),
            None => ("decision".to_string(), conclusion.clone()),
        };
        reports.push(Report {
            breed: id.clone(),
            key,
            value,
            confidence,
        });
    }
    if reports.len() < 2 {
        return Err("meta_reasoning requires at least two breed reports".to_string());
    }
    if reports.len() > MAX_REPORTS {
        return Err(format!("more than {} reports — refused", MAX_REPORTS));
    }
    Ok(reports)
}

fn negation_pair(a: &str, b: &str) -> bool {
    a.strip_prefix("not_") == Some(b) || b.strip_prefix("not_") == Some(a)
}

impl VerifierBreed for MetaReasoning {
    /// Meta-reasoning verdicts are open-vocabulary decision keys (e.g.
    /// `therapy=gentamicin`); only require that a decision was selected.
    fn assert_verdict_valid(&self, output: &BreedOutput) -> Result<(), String> {
        if output.selected.is_some() {
            Ok(())
        } else {
            Err(format!("{}: requires a selected decision", self.id()))
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
            "confidence_weighted_vote".to_string(),
            "ensemble_arbitration".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_reports(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::MetaReasoning,
            message: m,
        };
        let reports = parse_reports(input).map_err(err)?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        for r in &reports {
            push(
                "ingest-report",
                format!("{}: {}={} (confidence {:.6})", r.breed, r.key, r.value, r.confidence),
                &mut trace,
            );
        }

        // Pairwise conflict detection (reports already in breed-id order).
        let mut conflicts = 0usize;
        for i in 0..reports.len() {
            for j in (i + 1)..reports.len() {
                let (a, b) = (&reports[i], &reports[j]);
                if a.key != b.key {
                    continue;
                }
                let reason = if a.value != b.value {
                    if negation_pair(&a.value, &b.value) {
                        Some("explicit negation".to_string())
                    } else {
                        Some("differing values".to_string())
                    }
                } else if (a.confidence - b.confidence).abs() > CONF_DIVERGENCE {
                    Some(format!(
                        "confidence divergence {:.6} > {:.1}",
                        (a.confidence - b.confidence).abs(),
                        CONF_DIVERGENCE
                    ))
                } else {
                    None
                };
                if let Some(reason) = reason {
                    conflicts += 1;
                    push(
                        "conflict-detected",
                        format!(
                            "{} vs {} on '{}': {}={} / {}={} ({})",
                            a.breed, b.breed, a.key, a.breed, a.value, b.breed, b.value, reason
                        ),
                        &mut trace,
                    );
                }
            }
        }

        // Confidence-weighted vote per decision key.
        let mut tally: BTreeMap<String, BTreeMap<String, f64>> = BTreeMap::new();
        for r in &reports {
            *tally
                .entry(r.key.clone())
                .or_default()
                .entry(r.value.clone())
                .or_insert(0.0) += r.confidence;
        }
        let mut decisions: Vec<(String, String, f64)> = Vec::new();
        for (key, values) in &tally {
            // Winner: max summed confidence; lexicographic least value on ties.
            let mut winner: Option<(&String, f64)> = None;
            for (value, w) in values {
                let better = match winner {
                    None => true,
                    Some((_, bw)) => *w > bw + 1e-12,
                };
                if better {
                    winner = Some((value, *w));
                }
            }
            let (value, weight) = winner.expect("non-empty tally");
            push(
                "vote",
                format!(
                    "key '{}': {} -> winner {}={:.6}",
                    key,
                    values
                        .iter()
                        .map(|(v, w)| format!("{}={:.6}", v, w))
                        .collect::<Vec<_>>()
                        .join(", "),
                    value,
                    weight
                ),
                &mut trace,
            );
            decisions.push((key.clone(), value.clone(), weight));
        }

        // Overall selection: decision with the greatest winning weight
        // (lexicographic least "key=value" on ties).
        let mut overall: Option<(String, f64)> = None;
        for (k, v, w) in &decisions {
            let label = format!("{}={}", k, v);
            let better = match &overall {
                None => true,
                Some((ol, ow)) => *w > ow + 1e-12 || ((*w - ow).abs() <= 1e-12 && label < *ol),
            };
            if better {
                overall = Some((label, *w));
            }
        }
        let (selected, sel_weight) = overall.expect(">=2 reports guarantee a decision");

        push(
            "resolve",
            format!(
                "{} conflict(s); {} decision key(s); selected {} (weight {:.6})",
                conflicts,
                decisions.len(),
                selected,
                sel_weight
            ),
            &mut trace,
        );

        let mut facts = vec![Fact {
            key: "meta:conflicts".to_string(),
            value: conflicts.to_string(),
        }];
        for (k, v, w) in &decisions {
            facts.push(Fact {
                key: format!("meta:decision:{}", k),
                value: v.clone(),
            });
            facts.push(Fact {
                key: format!("meta:weight:{}", k),
                value: format!("{:.6}", w),
            });
        }

        Ok(BreedOutput {
            breed: BreedId::MetaReasoning,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(selected.clone()),
            explanation: format!(
                "Meta-reasoning over {} reports: {} conflict(s) detected; resolved to {}",
                reports.len(),
                conflicts,
                selected
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_verdict_valid(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["resolve"])?;
        if !output.facts.iter().any(|f| f.key == "meta:conflicts") {
            return Err("missing meta:conflicts fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(k: &str, v: &str) -> Fact {
        Fact {
            key: k.into(),
            value: v.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "arbitrate".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn mycin_vs_prolog_contradiction_detected() {
        let out = MetaReasoning
            .run(&input(vec![
                fact("breed:mycin:conclusion", "therapy=gentamicin"),
                fact("breed:mycin:confidence", "0.8"),
                fact("breed:prolog:conclusion", "therapy=none"),
                fact("breed:prolog:confidence", "0.6"),
            ]))
            .expect("run ok");
        let conflict = out
            .inference_trace
            .iter()
            .find(|t| t.kind == "conflict-detected")
            .expect("conflict step required");
        assert!(conflict.detail.contains("mycin") && conflict.detail.contains("prolog"));
        assert_eq!(out.selected.as_deref(), Some("therapy=gentamicin"));
    }

    #[test]
    fn identical_conclusions_zero_conflicts() {
        let out = MetaReasoning
            .run(&input(vec![
                fact("breed:mycin:conclusion", "therapy=gentamicin"),
                fact("breed:mycin:confidence", "0.8"),
                fact("breed:prolog:conclusion", "therapy=gentamicin"),
                fact("breed:prolog:confidence", "0.7"),
            ]))
            .expect("run ok");
        assert_eq!(
            out.inference_trace
                .iter()
                .filter(|t| t.kind == "conflict-detected")
                .count(),
            0
        );
        let c = out.facts.iter().find(|f| f.key == "meta:conflicts").unwrap();
        assert_eq!(c.value, "0");
    }

    #[test]
    fn confidence_divergence_is_a_conflict() {
        let out = MetaReasoning
            .run(&input(vec![
                fact("breed:a:conclusion", "x=1"),
                fact("breed:a:confidence", "0.95"),
                fact("breed:b:conclusion", "x=1"),
                fact("breed:b:confidence", "0.1"),
            ]))
            .expect("run ok");
        assert_eq!(
            out.inference_trace
                .iter()
                .filter(|t| t.kind == "conflict-detected")
                .count(),
            1
        );
    }

    #[test]
    fn negation_pair_detected() {
        let out = MetaReasoning
            .run(&input(vec![
                fact("breed:a:conclusion", "flies=glows"),
                fact("breed:a:confidence", "0.5"),
                fact("breed:b:conclusion", "flies=not_glows"),
                fact("breed:b:confidence", "0.5"),
            ]))
            .expect("run ok");
        let c = out
            .inference_trace
            .iter()
            .find(|t| t.kind == "conflict-detected")
            .unwrap();
        assert!(c.detail.contains("explicit negation"));
    }

    #[test]
    fn refuses_single_report() {
        assert!(MetaReasoning
            .preconditions(&input(vec![
                fact("breed:a:conclusion", "x=1"),
                fact("breed:a:confidence", "0.9"),
            ]))
            .is_err());
    }
}
