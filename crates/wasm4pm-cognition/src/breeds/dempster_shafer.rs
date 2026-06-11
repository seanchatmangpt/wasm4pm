//! Dempster–Shafer theory of evidence — Shafer 1976.
//!
//! Frame of discernment ≤8 hypotheses encoded as u8 subset bitmasks. Sources
//! are groups of rules sharing a rule id; each rule's conclusion is a
//! comma-separated hypothesis subset, its certainty is the basic probability
//! mass. Unassigned mass per source goes to the full frame (ignorance).
//! Sources are folded pairwise with Dempster's rule (K-normalization;
//! K=1 total conflict is a run error). The goal's query subset gets
//! Bel (sum of masses of subsets contained in it) and Pl (sum of masses of
//! subsets intersecting it).
//!
//! Determinism: BTreeMap/BTreeSet working sets only.
//!
//! Trace kinds: `ds-load-bpa`(1,1) → `ds-combine`(0,*) → `ds-belief`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Dempster–Shafer evidence-combination breed.
pub struct DempsterShafer;

type Subset = u8;
type Bpa = BTreeMap<Subset, f64>;

fn parse_subset(s: &str, mapping: &BTreeMap<String, u8>) -> Subset {
    let mut mask = 0;
    for part in s.split(',') {
        if let Some(&bit) = mapping.get(part.trim()) {
            mask |= 1 << bit;
        }
    }
    mask
}

fn subset_to_string(subset: Subset, inverse_mapping: &BTreeMap<u8, String>) -> String {
    if subset == 0 {
        return "(empty)".to_string();
    }
    let mut parts = Vec::new();
    for i in 0..8 {
        if (subset & (1 << i)) != 0 {
            if let Some(name) = inverse_mapping.get(&i) {
                parts.push(name.clone());
            }
        }
    }
    parts.join(",")
}

/// Dempster's rule of combination with K-normalization.
fn combine_bpas(bpa1: &Bpa, bpa2: &Bpa) -> Result<(Bpa, f64), String> {
    let mut combined: Bpa = BTreeMap::new();
    let mut k_conflict = 0.0;
    for (&a, &m1) in bpa1 {
        for (&b, &m2) in bpa2 {
            let intersection = a & b;
            let mass = m1 * m2;
            if intersection == 0 {
                k_conflict += mass;
            } else {
                *combined.entry(intersection).or_insert(0.0) += mass;
            }
        }
    }
    if k_conflict >= 1.0 - 1e-9 {
        return Err("Dempster combination failed: K=1 complete conflict".to_string());
    }
    for mass in combined.values_mut() {
        *mass /= 1.0 - k_conflict;
    }
    Ok((combined, k_conflict))
}

fn query_of(input: &BreedInput) -> Option<String> {
    input
        .goals
        .iter()
        .find(|g| g.predicate == "query" || g.id == "query")
        .map(|g| g.value.clone())
        .or_else(|| input.goals.first().map(|g| g.value.clone()))
}

impl CognitionBreed for DempsterShafer {
    fn id(&self) -> BreedId {
        BreedId::DempsterShafer
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "dempster_combination".to_string(),
            "belief_plausibility".to_string(),
            "k_conflict_normalization".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err(
                "dempster_shafer requires basic probability assignments in rules".to_string(),
            );
        }
        for r in &input.rules {
            if !(0.0..=1.0).contains(&r.certainty) {
                return Err(format!("bpa mass out of [0,1] in rule {}", r.id));
            }
        }
        match query_of(input) {
            Some(q) if !q.trim().is_empty() => Ok(()),
            _ => Err("dempster_shafer requires a query subset in goals".to_string()),
        }
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::DempsterShafer,
            message,
        };
        let query_str = query_of(input).ok_or_else(|| err("missing query goal".to_string()))?;

        let mut hypotheses: BTreeSet<String> = BTreeSet::new();
        for rule in &input.rules {
            for part in rule.conclusion.split(',') {
                let p = part.trim();
                if !p.is_empty() {
                    hypotheses.insert(p.to_string());
                }
            }
        }
        for part in query_str.split(',') {
            let p = part.trim();
            if !p.is_empty() {
                hypotheses.insert(p.to_string());
            }
        }
        if hypotheses.len() > 8 {
            return Err(err(format!(
                "frame of discernment exceeds 8 hypotheses: {}",
                hypotheses.len()
            )));
        }

        let mut mapping: BTreeMap<String, u8> = BTreeMap::new();
        let mut inverse_mapping: BTreeMap<u8, String> = BTreeMap::new();
        for (i, h) in hypotheses.into_iter().enumerate() {
            mapping.insert(h.clone(), i as u8);
            inverse_mapping.insert(i as u8, h);
        }
        let frame_mask: Subset = ((1u16 << mapping.len()) - 1) as u8;

        // Group rules into sources by rule id.
        let mut sources: BTreeMap<String, Bpa> = BTreeMap::new();
        for rule in &input.rules {
            let subset = parse_subset(&rule.conclusion, &mapping);
            if subset == 0 {
                return Err(err(format!("rule {} assigns mass to the empty set", rule.id)));
            }
            let bpa = sources.entry(rule.id.clone()).or_default();
            *bpa.entry(subset).or_insert(0.0) += rule.certainty as f64;
        }
        // Per-source mass must not exceed 1; remainder is ignorance on the frame.
        for (name, bpa) in sources.iter_mut() {
            let sum: f64 = bpa.values().sum();
            if sum > 1.0 + 1e-9 {
                return Err(err(format!("source {} masses sum to {} > 1", name, sum)));
            }
            if sum < 1.0 - 1e-9 {
                *bpa.entry(frame_mask).or_insert(0.0) += 1.0 - sum;
            }
        }

        let mut trace = Vec::new();
        trace.push(TraceStep {
            step: 0,
            kind: "ds-load-bpa".to_string(),
            detail: format!(
                "loaded {} sources over frame of size {}",
                sources.len(),
                mapping.len()
            ),
            depth: 0,
            objects: vec![],
        });

        let mut sources_iter = sources.into_iter();
        let (mut current_name, mut current_bpa) = sources_iter
            .next()
            .ok_or_else(|| err("no sources found".to_string()))?;
        for (next_name, next_bpa) in sources_iter {
            let (combined, k_conflict) = combine_bpas(&current_bpa, &next_bpa).map_err(&err)?;
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ds-combine".to_string(),
                detail: format!(
                    "combined {} with {}, K={:.9}",
                    current_name, next_name, k_conflict
                ),
                depth: 0,
                objects: vec![("source".to_string(), next_name.clone())],
            });
            current_bpa = combined;
            current_name = format!("({},{})", current_name, next_name);
        }

        let query_subset = parse_subset(&query_str, &mapping);
        let mut bel = 0.0;
        let mut pl = 0.0;
        for (&subset, &mass) in &current_bpa {
            if subset != 0 && (subset & query_subset) == subset {
                bel += mass;
            }
            if (subset & query_subset) != 0 {
                pl += mass;
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ds-belief".to_string(),
            detail: format!("query {} => Bel={:.9}, Pl={:.9}", query_str, bel, pl),
            depth: 0,
            objects: vec![("decision".to_string(), "belief".to_string())],
        });

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: format!("belief:{}", query_str),
            value: format!("{:.9}", bel),
        });
        out_facts.push(Fact {
            key: format!("plausibility:{}", query_str),
            value: format!("{:.9}", pl),
        });

        Ok(BreedOutput {
            breed: BreedId::DempsterShafer,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(format!("Bel={:.9}, Pl={:.9}", bel, pl)),
            explanation: format!(
                "Dempster-Shafer query '{}' Bel={:.9}, Pl={:.9} over frame {{{}}}",
                query_str,
                bel,
                pl,
                subset_to_string(frame_mask, &inverse_mapping)
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (fraud signal)".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "ds-load-bpa") {
            return Err("trace must contain ds-load-bpa".to_string());
        }
        if output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "ds-belief")
            .count()
            != 1
        {
            return Err("trace must contain exactly one ds-belief step".to_string());
        }
        if !output.facts.iter().any(|f| f.key.starts_with("belief:")) {
            return Err("missing belief: output fact".to_string());
        }
        Ok(())
    }
}
