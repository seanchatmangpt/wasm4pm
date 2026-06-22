use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write as _;

/// Qualitative Reasoning (QR) breed based on de Kleer-Brown sign algebra.
pub struct QualitativeReason;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
/// Qualitative sign (+, -, 0)
pub enum Sign {
    /// Negative sign
    Minus,
    /// Zero sign
    Zero,
    /// Positive sign
    Plus,
}

impl Sign {
    fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "+" | "pos" | "positive" | "p" => Some(Sign::Plus),
            "0" | "zero" | "z" => Some(Sign::Zero),
            "-" | "neg" | "negative" | "m" | "n" => Some(Sign::Minus),
            _ => None,
        }
    }

    fn as_str(&self) -> &'static str {
        match self {
            Sign::Plus => "+",
            Sign::Zero => "0",
            Sign::Minus => "-",
        }
    }

    fn add(self, other: Self) -> Vec<Self> {
        match (self, other) {
            (Sign::Plus, Sign::Plus) => vec![Sign::Plus],
            (Sign::Minus, Sign::Minus) => vec![Sign::Minus],
            (Sign::Zero, s) | (s, Sign::Zero) => vec![s],
            (Sign::Plus, Sign::Minus) | (Sign::Minus, Sign::Plus) => {
                vec![Sign::Plus, Sign::Zero, Sign::Minus]
            }
        }
    }

    fn negate(self) -> Self {
        match self {
            Sign::Plus => Sign::Minus,
            Sign::Zero => Sign::Zero,
            Sign::Minus => Sign::Plus,
        }
    }
}

#[derive(Debug, Clone)]
struct Confluence {
    id: String,
    left: Vec<(String, bool)>, // (variable_name, is_positive)
    right: String,             // variable name or "0"
}

impl QualitativeReason {
    fn evaluate_sum(&self, terms: &[(String, bool)], state: &BTreeMap<String, Sign>) -> Vec<Sign> {
        let mut results = vec![Sign::Zero];
        for (var, is_pos) in terms {
            let val = state.get(var).cloned().unwrap_or(Sign::Zero);
            let val = if *is_pos { val } else { val.negate() };

            let mut next_results = HashSet::new();
            for r in results {
                for next_r in r.add(val) {
                    next_results.insert(next_r);
                }
            }
            results = next_results.into_iter().collect();
        }
        results
    }
}

impl CognitionBreed for QualitativeReason {
    fn id(&self) -> BreedId {
        BreedId::QualitativeReason
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "sign_algebra".to_string(),
            "confluence_propagation".to_string(),
            "envisionment".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() && input.facts.is_empty() {
            return Err(
                "QualitativeReason requires at least one confluence (rule) or initial sign (fact)"
                    .to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // 1. Parse confluences and variables
        let mut variables: BTreeSet<String> = BTreeSet::new();
        let mut initial_signs = HashMap::new();
        let mut confluences = Vec::new();

        // Fact-encoded inputs (de Kleer & Brown fixture convention):
        //   qr:confluence:<id> = "+p,+a,-q"  → [dP] + [dA] - [dQ] = 0
        //   qr:sign:<var>       = "+"/"-"/"0" → initial sign of variable <var>
        for f in &input.facts {
            if let Some(conf_id) = f.key.strip_prefix("qr:confluence:") {
                let mut left = Vec::new();
                for term in f.value.split(',') {
                    let term = term.trim();
                    if term.is_empty() {
                        continue;
                    }
                    let (var, is_pos) = if let Some(stripped) = term.strip_prefix('-') {
                        (stripped.to_string(), false)
                    } else if let Some(stripped) = term.strip_prefix('+') {
                        (stripped.to_string(), true)
                    } else {
                        (term.to_string(), true)
                    };
                    variables.insert(var.clone());
                    left.push((var, is_pos));
                }
                confluences.push(Confluence {
                    id: conf_id.to_string(),
                    left,
                    right: "0".to_string(),
                });
            } else if let Some(var) = f.key.strip_prefix("qr:sign:") {
                if let Some(sign) = Sign::from_str(&f.value) {
                    initial_signs.insert(var.to_string(), sign);
                    variables.insert(var.to_string());
                }
            } else if let Some(sign) = Sign::from_str(&f.value) {
                initial_signs.insert(f.key.clone(), sign);
                variables.insert(f.key.clone());
            }
        }

        for r in &input.rules {
            let mut left = Vec::new();
            for p in &r.premise {
                let (var, is_pos) = if let Some(stripped) = p.strip_prefix('-') {
                    (stripped.to_string(), false)
                } else {
                    (p.clone(), true)
                };
                variables.insert(var.clone());
                left.push((var, is_pos));
            }
            variables.insert(r.conclusion.clone());
            confluences.push(Confluence {
                id: r.id.clone(),
                left,
                right: r.conclusion.clone(),
            });
        }

        variables.remove("0");
        let var_list: Vec<String> = variables.into_iter().collect();

        trace.push(TraceStep {
            step: trace.len(),
            kind: "limit-analysis".to_string(),
            detail: format!(
                "Loaded {} variables and {} confluences",
                var_list.len(),
                confluences.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // 2. Envisionment: find all valid states
        let mut valid_states = Vec::new();
        let n_vars = var_list.len();

        if n_vars > 12 {
            return Err(BreedError {
                breed: BreedId::QualitativeReason,
                message: format!(
                    "Too many variables for exact envisionment (max 12, got {})",
                    n_vars
                ),
            });
        }

        let total_combinations = 3usize.pow(n_vars as u32);
        for i in 0..total_combinations {
            let mut state: BTreeMap<String, Sign> = BTreeMap::new();
            let mut temp_i = i;
            for j in 0..n_vars {
                let sign_idx = temp_i % 3;
                temp_i /= 3;
                let sign = match sign_idx {
                    0 => Sign::Minus,
                    1 => Sign::Zero,
                    2 => Sign::Plus,
                    _ => unreachable!(),
                };
                state.insert(var_list[j].clone(), sign);
            }

            // Check against initial signs
            let mut matches_initial = true;
            for (var, sign) in &initial_signs {
                if state.get(var) != Some(sign) {
                    matches_initial = false;
                    break;
                }
            }
            if !matches_initial {
                continue;
            }

            // Check all confluences
            let mut satisfied = true;
            for conf in &confluences {
                let sum_signs = self.evaluate_sum(&conf.left, &state);
                let target_sign = if conf.right == "0" {
                    Sign::Zero
                } else {
                    state.get(&conf.right).cloned().unwrap_or(Sign::Zero)
                };

                if !sum_signs.contains(&target_sign) {
                    satisfied = false;
                    break;
                }
            }

            if satisfied {
                valid_states.push(state);
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "branch-ambiguity".to_string(),
            detail: format!(
                "Envisionment produced {} valid qualitative states",
                valid_states.len()
            ),
            depth: 0,
            objects: vec![],
        });

        // 3. Prepare output
        let mut out_facts = Vec::new();
        out_facts.push(Fact {
            key: "state_count".to_string(),
            value: valid_states.len().to_string(),
        });

        let has_equilibrium = valid_states
            .iter()
            .any(|s| s.values().all(|&sign| sign == Sign::Zero));
        out_facts.push(Fact {
            key: "equilibrium_reachable".to_string(),
            value: has_equilibrium.to_string(),
        });

        for (idx, state) in valid_states.iter().enumerate() {
            let mut state_str = String::new();
            for key in state.keys() {
                let _ = write!(state_str, "{}:{},", key, state[key].as_str());
            }
            out_facts.push(Fact {
                key: format!("state_{}", idx),
                value: state_str.clone(),
            });
            trace.push(TraceStep {
                step: trace.len(),
                kind: "envision-state".to_string(),
                detail: format!(
                    "Qualitative state {}: {}",
                    idx,
                    state_str.trim_end_matches(',')
                ),
                depth: 1,
                objects: vec![],
            });
        }

        let explanation = format!(
            "Qualitative Reasoning: found {} valid states. Equilibrium reachable: {}",
            valid_states.len(),
            has_equilibrium
        );

        Ok(BreedOutput {
            breed: BreedId::QualitativeReason,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: None,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("QualitativeReason must emit at least one trace step".to_string());
        }
        Ok(())
    }
}
