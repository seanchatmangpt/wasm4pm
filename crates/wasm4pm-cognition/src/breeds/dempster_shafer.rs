//! Dempster-Shafer theory of evidence (Shafer 1976).
//!
//! Frame ≤8 hypotheses as u8 subset bitmasks. Dempster pairwise fold with K-normalization.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Dempster-Shafer breed
pub struct DempsterShafer;

type Subset = u8;
type Bpa = BTreeMap<Subset, f64>;

fn parse_subset(s: &str, mapping: &HashMap<String, u8>) -> Subset {
    let mut mask = 0;
    for part in s.split(',') {
        let p = part.trim();
        if let Some(&bit) = mapping.get(p) {
            mask |= 1 << bit;
        }
    }
    mask
}

fn subset_to_string(subset: Subset, inverse_mapping: &HashMap<u8, String>) -> String {
    if subset == 0 {
        return "∅".to_string();
    }
    let mut parts = Vec::new();
    for i in 0..8 {
        if (subset & (1 << i)) != 0 {
            if let Some(name) = inverse_mapping.get(&i) {
                parts.push(name.clone());
            }
        }
    }
    parts.sort();
    parts.join(",")
}

fn combine_bpas(bpa1: &Bpa, bpa2: &Bpa, inverse_mapping: &HashMap<u8, String>) -> Result<(Bpa, f64), String> {
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

impl CognitionBreed for DempsterShafer {
    fn id(&self) -> BreedId {
        BreedId::DempsterShafer
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["dempster_shafer".to_string(), "belief_combination".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("DempsterShafer requires basic probability assignments in rules".to_string());
        }
        let query_var = input
            .goals
            .iter()
            .find(|g| g.predicate == "query" || g.id == "query")
            .map(|g| g.value.clone())
            .unwrap_or_else(|| {
                input
                    .goals
                    .first()
                    .map(|g| g.value.clone())
                    .unwrap_or_default()
            });
        if query_var.trim().is_empty() {
            return Err("DempsterShafer requires a query subset in goals".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let query_str = input
            .goals
            .iter()
            .find(|g| g.predicate == "query" || g.id == "query")
            .map(|g| g.value.clone())
            .unwrap_or_else(|| {
                input
                    .goals
                    .first()
                    .map(|g| g.value.clone())
                    .unwrap_or_default()
            });

        let mut hypotheses = BTreeSet::new();
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
            return Err(BreedError {
                breed: BreedId::DempsterShafer,
                message: format!("Frame of discernment exceeds 8 hypotheses: {}", hypotheses.len()),
            });
        }

        let mut mapping = HashMap::new();
        let mut inverse_mapping = HashMap::new();
        for (i, h) in hypotheses.into_iter().enumerate() {
            mapping.insert(h.clone(), i as u8);
            inverse_mapping.insert(i as u8, h);
        }

        let frame_mask = (1 << mapping.len()) - 1;

        // Group rules by source (rule.id)
        let mut sources: BTreeMap<String, Bpa> = BTreeMap::new();
        for rule in &input.rules {
            let source_id = rule.id.clone();
            let subset = parse_subset(&rule.conclusion, &mapping);
            let mass = rule.certainty.to_string().parse::<f64>().unwrap_or(0.0);
            let bpa = sources.entry(source_id).or_insert_with(BTreeMap::new);
            *bpa.entry(subset).or_insert(0.0) += mass;
        }

        // Add implicit ignorance mass to frame
        for bpa in sources.values_mut() {
            let sum: f64 = bpa.values().sum();
            if sum < 1.0 - 1e-9 {
                *bpa.entry(frame_mask).or_insert(0.0) += 1.0 - sum;
            }
        }

        let mut trace = Vec::new();

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ds-load-bpa".to_string(),
            detail: format!("Loaded {} sources over frame of size {}", sources.len(), mapping.len()),
            depth: 0,
            objects: vec![],
        });

        if sources.is_empty() {
            return Err(BreedError {
                breed: BreedId::DempsterShafer,
                message: "No sources found".to_string(),
            });
        }

        let mut sources_iter = sources.into_iter();
        let (mut current_name, mut current_bpa) = sources_iter.next().unwrap();

        for (next_name, next_bpa) in sources_iter {
            match combine_bpas(&current_bpa, &next_bpa, &inverse_mapping) {
                Ok((combined, k_conflict)) => {
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "ds-combine".to_string(),
                        detail: format!("Combined {} with {}, K={}", current_name, next_name, k_conflict),
                        depth: 0,
                        objects: vec![],
                    });
                    current_bpa = combined;
                    current_name = format!("({},{})", current_name, next_name);
                }
                Err(e) => {
                    return Err(BreedError {
                        breed: BreedId::DempsterShafer,
                        message: e,
                    });
                }
            }
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
            detail: format!("Query {} => Bel={}, Pl={}", query_str, bel, pl),
            depth: 0,
            objects: vec![],
        });

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: format!("belief:{}", query_str),
            value: bel.to_string(),
        });
        out_facts.push(Fact {
            key: format!("plausibility:{}", query_str),
            value: pl.to_string(),
        });

        let explanation = format!(
            "Dempster-Shafer query '{}' Bel={}, Pl={} across frame {}",
            query_str, bel, pl, subset_to_string(frame_mask, &inverse_mapping)
        );

        Ok(BreedOutput {
            breed: BreedId::DempsterShafer,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(format!("Bel={}, Pl={}", bel, pl)),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("DempsterShafer must log belief steps".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Candidate, Goal, Rule, Fact};



}
