//! Mamdani fuzzy inference — Mamdani & Assilian 1975 (Zadeh 1965 sets).
//!
//! Pipeline: fuzzify crisp inputs through triangular/trapezoidal membership
//! functions, fire rules with the min t-norm, aggregate consequents with max,
//! defuzzify by 101-point discrete centroid.
//!
//! Input contract (facts):
//! - `fuzzy:<var>:<term>` = `tri:a,b,c` or `trap:a,b,c,d` (membership fn),
//! - `fuzzy:input:<var>`  = crisp value.
//! Rules: premise = list of `fuzzy:<var>:<term>` keys (min t-norm over their
//! memberships), conclusion = an output `fuzzy:<var>:<term>` key.
//!
//! Determinism: all working sets are BTreeMap (P1 mandate); membership values
//! are rounded to 1e-5 to keep BLAKE3 receipts bit-stable.
//!
//! Trace kinds: `fuzzy-fuzzify`(1,*) → `fuzzy-fire`(1,*) →
//! `fuzzy-aggregate`(1,*) → `fuzzy-defuzz`(1,1).

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;

/// Mamdani fuzzy logic breed.
pub struct FuzzyLogic;

/// A membership function (triangular or trapezoidal).
#[derive(Debug, Clone)]
pub enum Mf {
    /// Triangle with feet a and c and peak b.
    Tri(f32, f32, f32),
    /// Trapezoid with feet a and d and plateau [b, c].
    Trap(f32, f32, f32, f32),
}

impl Mf {
    /// Parse `tri:a,b,c` / `trap:a,b,c,d`.
    pub fn parse(s: &str) -> Option<Self> {
        let (kind, nums_str) = s.split_once(':')?;
        let nums: Vec<f32> = nums_str
            .split(',')
            .map(|x| x.trim().parse::<f32>())
            .collect::<Result<_, _>>()
            .ok()?;
        match kind {
            "tri" if nums.len() == 3 => Some(Mf::Tri(nums[0], nums[1], nums[2])),
            "trap" if nums.len() == 4 => Some(Mf::Trap(nums[0], nums[1], nums[2], nums[3])),
            _ => None,
        }
    }

    /// Membership degree at x (rounded to 1e-5 for receipt stability).
    pub fn eval(&self, x: f32) -> f32 {
        let mu = match *self {
            Mf::Tri(a, b, c) => {
                if x == b {
                    1.0
                } else if x <= a || x >= c {
                    0.0
                } else if x < b {
                    (x - a) / (b - a)
                } else {
                    (c - x) / (c - b)
                }
            }
            Mf::Trap(a, b, c, d) => {
                if x >= b && x <= c {
                    1.0
                } else if x <= a || x >= d {
                    0.0
                } else if x < b {
                    (x - a) / (b - a)
                } else {
                    (d - x) / (d - c)
                }
            }
        };
        (mu * 1e5).round() / 1e5
    }

    fn min_x(&self) -> f32 {
        match *self {
            Mf::Tri(a, _, _) => a,
            Mf::Trap(a, _, _, _) => a,
        }
    }

    fn max_x(&self) -> f32 {
        match *self {
            Mf::Tri(_, _, c) => c,
            Mf::Trap(_, _, _, d) => d,
        }
    }
}

impl CognitionBreed for FuzzyLogic {
    fn id(&self) -> BreedId {
        BreedId::FuzzyLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "mamdani_inference".to_string(),
            "min_t_norm".to_string(),
            "max_aggregation".to_string(),
            "centroid_defuzzification".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_input = input
            .facts
            .iter()
            .any(|f| f.key.starts_with("fuzzy:input:"));
        if !has_input {
            return Err("fuzzy_logic requires at least one fuzzy:input:<var> fact".to_string());
        }
        if input.rules.is_empty() {
            return Err("fuzzy_logic requires at least one rule".to_string());
        }
        let has_term = input.facts.iter().any(|f| {
            f.key.starts_with("fuzzy:")
                && !f.key.starts_with("fuzzy:input:")
                && !f.key.starts_with("fuzzy:output:")
        });
        if !has_term {
            return Err("fuzzy_logic requires fuzzy:<var>:<term> membership facts".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut add_trace = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        // BTreeMap working sets: deterministic iteration everywhere.
        let mut terms: BTreeMap<String, Mf> = BTreeMap::new();
        for fact in &input.facts {
            if fact.key.starts_with("fuzzy:")
                && !fact.key.starts_with("fuzzy:input:")
                && !fact.key.starts_with("fuzzy:output:")
            {
                match Mf::parse(&fact.value) {
                    Some(mf) => {
                        terms.insert(fact.key.clone(), mf);
                    }
                    None => {
                        return Err(BreedError {
                            breed: BreedId::FuzzyLogic,
                            message: format!(
                                "malformed membership function '{}'='{}'",
                                fact.key, fact.value
                            ),
                        })
                    }
                }
            }
        }

        let mut inputs: BTreeMap<String, f32> = BTreeMap::new();
        for fact in &input.facts {
            if let Some(var) = fact.key.strip_prefix("fuzzy:input:") {
                let val = fact.value.parse::<f32>().map_err(|_| BreedError {
                    breed: BreedId::FuzzyLogic,
                    message: format!("non-numeric fuzzy input '{}'", fact.value),
                })?;
                inputs.insert(var.to_string(), val);
            }
        }

        // Fuzzification (BTreeMap order => deterministic trace).
        let mut fuzzified: BTreeMap<String, f32> = BTreeMap::new();
        let mut out_vars: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for (term_key, mf) in &terms {
            let parts: Vec<&str> = term_key.split(':').collect();
            if parts.len() == 3 {
                let var = parts[1];
                if let Some(&val) = inputs.get(var) {
                    let mu = mf.eval(val);
                    fuzzified.insert(term_key.clone(), mu);
                    add_trace(
                        &mut trace,
                        "fuzzy-fuzzify",
                        format!("{} = {}", term_key, mu),
                    );
                } else {
                    out_vars
                        .entry(var.to_string())
                        .or_default()
                        .push(term_key.clone());
                }
            }
        }

        // Rule firing: min t-norm over premises, max aggregation per consequent.
        let mut aggregated: BTreeMap<String, f32> = BTreeMap::new();
        for rule in &input.rules {
            let mut fire_strength = 1.0_f32;
            let mut can_fire = true;
            for premise in &rule.premise {
                if let Some(&mu) = fuzzified.get(premise) {
                    fire_strength = fire_strength.min(mu);
                } else {
                    can_fire = false;
                    break;
                }
            }
            if can_fire {
                add_trace(
                    &mut trace,
                    "fuzzy-fire",
                    format!("rule {} fired with strength {}", rule.id, fire_strength),
                );
                let current = aggregated.get(&rule.conclusion).copied().unwrap_or(0.0);
                if fire_strength > current {
                    aggregated.insert(rule.conclusion.clone(), fire_strength);
                }
            }
        }
        if aggregated.is_empty() {
            return Err(BreedError {
                breed: BreedId::FuzzyLogic,
                message: "no rule fired: premises reference unfuzzified terms".to_string(),
            });
        }
        for (out_term, &strength) in &aggregated {
            add_trace(
                &mut trace,
                "fuzzy-aggregate",
                format!("{} max strength = {}", out_term, strength),
            );
        }

        // 101-point centroid defuzzification per output variable.
        let mut out_facts = Vec::new();
        for (out_var, term_keys) in &out_vars {
            let mut min_val = f32::MAX;
            let mut max_val = f32::MIN;
            for tk in term_keys {
                if let Some(mf) = terms.get(tk) {
                    min_val = min_val.min(mf.min_x());
                    max_val = max_val.max(mf.max_x());
                }
            }
            if min_val >= max_val {
                continue;
            }
            let num_points = 101;
            let step = (max_val - min_val) / (num_points - 1) as f32;
            let mut sum_x_mu = 0.0_f32;
            let mut sum_mu = 0.0_f32;
            for i in 0..num_points {
                let x = min_val + i as f32 * step;
                let mut max_mu = 0.0_f32;
                for tk in term_keys {
                    if let (Some(strength), Some(mf)) = (aggregated.get(tk), terms.get(tk)) {
                        max_mu = max_mu.max(mf.eval(x).min(*strength));
                    }
                }
                sum_x_mu += x * max_mu;
                sum_mu += max_mu;
            }
            if sum_mu > 0.0 {
                let centroid = ((sum_x_mu / sum_mu) * 1e5).round() / 1e5;
                add_trace(
                    &mut trace,
                    "fuzzy-defuzz",
                    format!("{} = {}", out_var, centroid),
                );
                out_facts.push(Fact {
                    key: format!("fuzzy:output:{}", out_var),
                    value: centroid.to_string(),
                });
            }
        }
        if out_facts.is_empty() {
            return Err(BreedError {
                breed: BreedId::FuzzyLogic,
                message: "no output variable defuzzified (no fired consequent had support)"
                    .to_string(),
            });
        }

        Ok(BreedOutput {
            breed: BreedId::FuzzyLogic,
            candidates: input.candidates.clone(),
            facts: {
                let mut f = input.facts.clone();
                f.extend(out_facts);
                f
            },
            selected: None,
            explanation:
                "Mamdani fuzzy inference: min t-norm firing, max aggregation, 101-point centroid"
                    .to_string(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty_with_kinds(&[
            "fuzzy-fuzzify",
            "fuzzy-fire",
            "fuzzy-aggregate",
            "fuzzy-defuzz",
        ])?;
        if !output
            .facts
            .iter()
            .any(|f| f.key.starts_with("fuzzy:output:"))
        {
            return Err("missing fuzzy:output: fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, CognitionBreed, Fact, Rule};

    #[test]
    fn refuses_no_rules() {
        let breed = FuzzyLogic;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "fuzzy:input:x".to_string(),
                    value: "10".to_string(),
                },
                Fact {
                    key: "fuzzy:x:a".to_string(),
                    value: "tri:0,10,20".to_string(),
                },
            ],
            rules: vec![],
            ..Default::default()
        };
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_centroid_exactness() {
        let breed = FuzzyLogic;
        let input = BreedInput {
            facts: vec![
                Fact {
                    key: "fuzzy:temp:hot".to_string(),
                    value: "tri:0,50,100".to_string(),
                },
                Fact {
                    key: "fuzzy:fan:fast".to_string(),
                    value: "trap:10,20,30,40".to_string(),
                },
                Fact {
                    key: "fuzzy:input:temp".to_string(),
                    value: "25".to_string(),
                },
            ],
            rules: vec![Rule {
                id: "r1".to_string(),
                premise: vec!["fuzzy:temp:hot".to_string()],
                conclusion: "fuzzy:fan:fast".to_string(),
                certainty: 1.0,
            }],
            ..Default::default()
        };
        let out = breed.run(&input).unwrap();
        let fan_out = out
            .facts
            .iter()
            .find(|f| f.key == "fuzzy:output:fan")
            .unwrap();
        assert_eq!(fan_out.value, "25");
    }

    #[test]
    fn invariant_shift_identity() {
        let breed = FuzzyLogic;
        let eval = |shift: f32| -> f32 {
            let input = BreedInput {
                facts: vec![
                    Fact {
                        key: "fuzzy:x:t1".to_string(),
                        value: format!("tri:{},{},{}", 0.0 + shift, 50.0 + shift, 100.0 + shift),
                    },
                    Fact {
                        key: "fuzzy:y:t2".to_string(),
                        value: format!("tri:{},{},{}", 0.0 + shift, 50.0 + shift, 100.0 + shift),
                    },
                    Fact {
                        key: "fuzzy:input:x".to_string(),
                        value: (25.0 + shift).to_string(),
                    },
                ],
                rules: vec![Rule {
                    id: "r1".to_string(),
                    premise: vec!["fuzzy:x:t1".to_string()],
                    conclusion: "fuzzy:y:t2".to_string(),
                    certainty: 1.0,
                }],
                ..Default::default()
            };
            let out = breed.run(&input).unwrap();
            out.facts
                .iter()
                .find(|f| f.key == "fuzzy:output:y")
                .unwrap()
                .value
                .parse()
                .unwrap()
        };
        let base = eval(0.0);
        let shifted = eval(10.0);
        assert!((shifted - (base + 10.0)).abs() < 1e-4);
    }
}
