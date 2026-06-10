//! Mamdani Fuzzy Logic Inference (Zadeh 1965).
//!
//! Algorithm core: Mamdani: tri/trap membership fns, min t-norm firing, max aggregation, 101-point centroid defuzzification.
//! Facts: `fuzzy:var:term`, `fuzzy:input:var`.
//! Trace kinds: `fuzzy-fuzzify` -> `fuzzy-fire` -> `fuzzy-aggregate` -> `fuzzy-defuzz`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::HashMap;

pub struct FuzzyLogic;

#[derive(Debug, Clone)]
pub enum Mf {
    Tri(f32, f32, f32),
    Trap(f32, f32, f32, f32),
}

impl Mf {
    pub fn parse(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() != 2 { return None; }
        let type_str = parts[0];
        let nums_str: Vec<&str> = parts[1].split(',').collect();
        let nums: Vec<f32> = nums_str.iter().filter_map(|x| x.parse().ok()).collect();
        match type_str {
            "tri" if nums.len() == 3 => Some(Mf::Tri(nums[0], nums[1], nums[2])),
            "trap" if nums.len() == 4 => Some(Mf::Trap(nums[0], nums[1], nums[2], nums[3])),
            _ => None,
        }
    }

    pub fn eval(&self, x: f32) -> f32 {
        let mu = match *self {
            Mf::Tri(a, b, c) => {
                if x <= a || x >= c {
                    0.0
                } else if x == b {
                    1.0
                } else if x < b {
                    (x - a) / (b - a)
                } else {
                    (c - x) / (c - b)
                }
            }
            Mf::Trap(a, b, c, d) => {
                if x <= a || x >= d {
                    0.0
                } else if x >= b && x <= c {
                    1.0
                } else if x < b {
                    (x - a) / (b - a)
                } else {
                    (d - x) / (d - c)
                }
            }
        };
        (mu * 1e5).round() / 1e5
    }
    
    pub fn min_x(&self) -> f32 {
        match *self {
            Mf::Tri(a, _, _) => a,
            Mf::Trap(a, _, _, _) => a,
        }
    }
    pub fn max_x(&self) -> f32 {
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
        vec!["Mamdani Inference".to_string(), "Fuzzy Logic".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_input = input.facts.iter().any(|f| f.key.starts_with("fuzzy:input:"));
        let has_rules = !input.rules.is_empty();
        if !has_input || !has_rules {
            return Err("Fuzzy logic requires fuzzy:input facts and rules".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;
        let mut add_trace = |kind: &str, detail: String| {
            trace.push(TraceStep {
                step: step_count,
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
            step_count += 1;
        };

        let mut terms: HashMap<String, Mf> = HashMap::new();
        for fact in &input.facts {
            if fact.key.starts_with("fuzzy:") && !fact.key.starts_with("fuzzy:input:") && !fact.key.starts_with("fuzzy:output:") {
                if let Some(mf) = Mf::parse(&fact.value) {
                    terms.insert(fact.key.clone(), mf);
                }
            }
        }

        let mut inputs: HashMap<String, f32> = HashMap::new();
        for fact in &input.facts {
            if let Some(var) = fact.key.strip_prefix("fuzzy:input:") {
                if let Ok(val) = fact.value.parse::<f32>() {
                    inputs.insert(var.to_string(), val);
                }
            }
        }

        let mut fuzzified: HashMap<String, f32> = HashMap::new();
        let mut out_vars: HashMap<String, Vec<String>> = HashMap::new();

        for (term_key, mf) in &terms {
            let parts: Vec<&str> = term_key.split(':').collect();
            if parts.len() == 3 {
                let var = parts[1];
                if let Some(&val) = inputs.get(var) {
                    let mu = mf.eval(val);
                    fuzzified.insert(term_key.clone(), mu);
                    add_trace("fuzzy-fuzzify", format!("{} = {}", term_key, mu));
                }
            }
        }

        for (term_key, _) in &terms {
            let parts: Vec<&str> = term_key.split(':').collect();
            if parts.len() == 3 {
                let var = parts[1];
                if !inputs.contains_key(var) {
                    out_vars.entry(var.to_string()).or_default().push(term_key.clone());
                }
            }
        }

        let mut aggregated: HashMap<String, f32> = HashMap::new();
        for rule in &input.rules {
            let mut fire_strength = 1.0_f32;
            let mut can_fire = true;
            for premise in &rule.premise {
                if let Some(&mu) = fuzzified.get(premise) {
                    if mu < fire_strength {
                        fire_strength = mu;
                    }
                } else {
                    can_fire = false;
                    break;
                }
            }
            if can_fire {
                add_trace("fuzzy-fire", format!("rule {} fired with strength {}", rule.id, fire_strength));
                let out_term = &rule.conclusion;
                let current = aggregated.get(out_term).copied().unwrap_or(0.0);
                if fire_strength > current {
                    aggregated.insert(out_term.clone(), fire_strength);
                }
            }
        }

        for (out_term, &strength) in &aggregated {
            add_trace("fuzzy-aggregate", format!("{} max strength = {}", out_term, strength));
        }

        let mut out_facts = Vec::new();
        for (out_var, term_keys) in &out_vars {
            let mut min_val = f32::MAX;
            let mut max_val = f32::MIN;
            for tk in term_keys {
                if let Some(mf) = terms.get(tk) {
                    if mf.min_x() < min_val { min_val = mf.min_x(); }
                    if mf.max_x() > max_val { max_val = mf.max_x(); }
                }
            }
            if min_val >= max_val {
                continue;
            }

            let num_points = 101;
            let step = (max_val - min_val) / (num_points - 1) as f32;
            let mut sum_x_mu = 0.0;
            let mut sum_mu = 0.0;

            for i in 0..num_points {
                let x = min_val + i as f32 * step;
                let mut max_mu = 0.0_f32;
                for tk in term_keys {
                    if let Some(strength) = aggregated.get(tk) {
                        if let Some(mf) = terms.get(tk) {
                            let mu = mf.eval(x).min(*strength);
                            if mu > max_mu {
                                max_mu = mu;
                            }
                        }
                    }
                }
                sum_x_mu += x * max_mu;
                sum_mu += max_mu;
            }

            if sum_mu > 0.0 {
                let centroid = sum_x_mu / sum_mu;
                let centroid = (centroid * 1e5).round() / 1e5;
                add_trace("fuzzy-defuzz", format!("{} = {}", out_var, centroid));
                out_facts.push(Fact {
                    key: format!("fuzzy:output:{}", out_var),
                    value: centroid.to_string(),
                });
            }
        }

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: {
                let mut f = input.facts.clone();
                f.extend(out_facts);
                f
            },
            selected: None,
            explanation: "Evaluated Mamdani fuzzy inference.".to_string(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Empty inference trace: no rules fired or defuzzified".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Rule, Candidate, Goal, Fact};

    fn make_input() -> BreedInput {
        BreedInput {
            intent: "Fuzzy Logic inference".to_string(),
            candidates: vec![],
            facts: vec![
                Fact { key: "fuzzy:temperature:cold".to_string(), value: "tri:0,0,20".to_string() },
                Fact { key: "fuzzy:temperature:hot".to_string(), value: "tri:10,30,30".to_string() },
                Fact { key: "fuzzy:fan:slow".to_string(), value: "tri:0,0,50".to_string() },
                Fact { key: "fuzzy:fan:fast".to_string(), value: "tri:10,100,100".to_string() },
                Fact { key: "fuzzy:input:temperature".to_string(), value: "15.0".to_string() },
            ],
            cases: vec![],
            rules: vec![
                Rule {
                    id: "r1".to_string(),
                    premise: vec!["fuzzy:temperature:cold".to_string()],
                    conclusion: "fuzzy:fan:slow".to_string(),
                    certainty: 1.0,
                },
                Rule {
                    id: "r2".to_string(),
                    premise: vec!["fuzzy:temperature:hot".to_string()],
                    conclusion: "fuzzy:fan:fast".to_string(),
                    certainty: 1.0,
                },
            ],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_fuzzy_refusal() {
        let breed = FuzzyLogic;
        let mut input = make_input();
        input.facts.retain(|f| !f.key.starts_with("fuzzy:input:"));
        assert!(breed.preconditions(&input).is_err());
    }

    #[test]
    fn test_fuzzy_hidden_oracle() {
        let breed = FuzzyLogic;
        let mut input = make_input();
        // Hidden oracle: Fresh interpolation point μ to 1e-5 (Tri(2,5,8) at 3.7 -> 0.56667)
        input.facts.push(Fact { key: "fuzzy:x:mid".to_string(), value: "tri:2,5,8".to_string() });
        input.facts.push(Fact { key: "fuzzy:y:mid".to_string(), value: "tri:0,50,100".to_string() });
        input.facts.push(Fact { key: "fuzzy:input:x".to_string(), value: "3.7".to_string() });
        input.rules.push(Rule {
            id: "r3".to_string(),
            premise: vec!["fuzzy:x:mid".to_string()],
            conclusion: "fuzzy:y:mid".to_string(),
            certainty: 1.0,
        });
        
        let output = breed.run(&input).unwrap();
        // Fire should have strength 0.56667
        let fire_trace = output.inference_trace.iter().find(|t| t.kind == "fuzzy-fire" && t.detail.starts_with("rule r3")).unwrap();
        assert!(fire_trace.detail.contains("0.56667"));
    }

    #[test]
    fn test_fuzzy_paper_grounded() {
        let breed = FuzzyLogic;
        let input = make_input();
        let output = breed.run(&input).unwrap();
        assert!(output.inference_trace.len() > 0);
        let out_fact = output.facts.iter().find(|f| f.key == "fuzzy:output:fan").unwrap();
        assert!(out_fact.value.parse::<f32>().is_ok());
    }

    #[test]
    fn test_fuzzy_determinism() {
        let breed = FuzzyLogic;
        let input = make_input();
        let out1 = breed.run(&input).unwrap();
        let out2 = breed.run(&input).unwrap();
        assert_eq!(out1.facts, out2.facts);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
