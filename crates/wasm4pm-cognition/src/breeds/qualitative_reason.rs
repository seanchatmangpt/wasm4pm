//! Qualitative reasoning: confluence propagation and envisionment
//! (de Kleer & Brown, "A Qualitative Physics Based on Confluences",
//! Artificial Intelligence 24, 1984).
//!
//! Sign algebra over {+, 0, -}: a confluence is a qualitative equation
//! Σ ±[dx_i] = 0. Input facts:
//! - `qr:confluence:<id>` value "+x,-y,-z"  — signed terms summing to 0
//! - `qr:sign:<v>`        value "+" | "0" | "-" — known derivative signs
//!
//! Propagation: when all but one term of a confluence is known and the sign
//! sum is determined, the remaining variable is inferred. Sign addition is
//! ambiguous for + ⊕ − (de Kleer & Brown's central source of branching):
//! envisionment branches on the lexicographically least unknown variable and
//! collects every globally consistent complete sign assignment (≤32 states).
//! Limit analysis marks each state's moving variables; a state where every
//! derivative is 0 is an equilibrium.

use std::collections::BTreeMap;

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of envisioned states.
const MAX_STATES: usize = 32;
/// Maximum number of variables.
const MAX_VARS: usize = 12;

/// Confluence-propagation breed.
pub struct QualitativeReason;

/// Sign values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Sign {
    Plus,
    Zero,
    Minus,
}

impl Sign {
    fn parse(s: &str) -> Result<Sign, String> {
        match s.trim() {
            "+" => Ok(Sign::Plus),
            "0" => Ok(Sign::Zero),
            "-" => Ok(Sign::Minus),
            other => Err(format!("malformed sign '{}'", other)),
        }
    }

    fn glyph(self) -> &'static str {
        match self {
            Sign::Plus => "+",
            Sign::Zero => "0",
            Sign::Minus => "-",
        }
    }

    fn negate(self) -> Sign {
        match self {
            Sign::Plus => Sign::Minus,
            Sign::Zero => Sign::Zero,
            Sign::Minus => Sign::Plus,
        }
    }
}

/// Qualitative sum of signs: None = ambiguous (+ ⊕ −).
fn sign_sum(signs: &[Sign]) -> Option<Sign> {
    let has_plus = signs.iter().any(|s| *s == Sign::Plus);
    let has_minus = signs.iter().any(|s| *s == Sign::Minus);
    match (has_plus, has_minus) {
        (true, true) => None, // ambiguous
        (true, false) => Some(Sign::Plus),
        (false, true) => Some(Sign::Minus),
        (false, false) => Some(Sign::Zero),
    }
}

/// A confluence: list of (positive-coefficient?, variable).
struct Confluence {
    id: String,
    terms: Vec<(bool, String)>,
}

struct Model {
    vars: Vec<String>,
    confluences: Vec<Confluence>,
    known: BTreeMap<String, Sign>,
}

fn parse(input: &BreedInput) -> Result<Model, String> {
    let mut vars: Vec<String> = Vec::new();
    let mut confluences: Vec<Confluence> = Vec::new();
    let mut known: BTreeMap<String, Sign> = BTreeMap::new();
    for f in &input.facts {
        if let Some(id) = f.key.strip_prefix("qr:confluence:") {
            let mut terms = Vec::new();
            for raw in f.value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
                let (pos, name) = match raw.strip_prefix('-') {
                    Some(n) => (false, n.trim().to_string()),
                    None => (true, raw.strip_prefix('+').unwrap_or(raw).trim().to_string()),
                };
                if name.is_empty() {
                    return Err(format!("malformed confluence term '{}'", raw));
                }
                if !vars.contains(&name) {
                    vars.push(name.clone());
                }
                terms.push((pos, name));
            }
            if terms.is_empty() {
                return Err(format!("confluence '{}' has no terms", id));
            }
            confluences.push(Confluence {
                id: id.to_string(),
                terms,
            });
        } else if let Some(v) = f.key.strip_prefix("qr:sign:") {
            known.insert(v.to_string(), Sign::parse(&f.value)?);
            if !vars.contains(&v.to_string()) {
                vars.push(v.to_string());
            }
        }
    }
    vars.sort();
    confluences.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(Model {
        vars,
        confluences,
        known,
    })
}

/// True iff a complete assignment satisfies every confluence (sum can be 0).
fn consistent(assign: &BTreeMap<String, Sign>, confluences: &[Confluence]) -> bool {
    for c in confluences {
        let signs: Vec<Sign> = c
            .terms
            .iter()
            .map(|(pos, v)| {
                let s = assign[v];
                if *pos {
                    s
                } else {
                    s.negate()
                }
            })
            .collect();
        match sign_sum(&signs) {
            Some(Sign::Zero) => {}
            Some(_) => return false,
            None => {} // + ⊕ − can be zero — consistent
        }
    }
    true
}

impl CognitionBreed for QualitativeReason {
    fn id(&self) -> BreedId {
        BreedId::QualitativeReason
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "confluence-propagation".to_string(),
            "ambiguity-branching".to_string(),
            "envisionment-limit-analysis".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let m = parse(input)?;
        if m.confluences.is_empty() {
            return Err("qualitative_reason requires at least one qr:confluence:* fact".to_string());
        }
        if m.vars.len() > MAX_VARS {
            return Err(format!("variable count {} exceeds cap {}", m.vars.len(), MAX_VARS));
        }
        for (v, _) in &m.known {
            if !m.confluences.iter().any(|c| c.terms.iter().any(|(_, t)| t == v)) {
                return Err(format!("qr:sign:{} names a variable not in any confluence", v));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let m = parse(input).map_err(|msg| BreedError {
            breed: BreedId::QualitativeReason,
            message: msg,
        })?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut step = 0usize;
        let mut tr = |trace: &mut Vec<TraceStep>, kind: &str, detail: String, depth: u32| {
            trace.push(TraceStep {
                step,
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
            step += 1;
        };

        tr(
            &mut trace,
            "load-model",
            format!(
                "{} variables, {} confluences, {} known signs",
                m.vars.len(),
                m.confluences.len(),
                m.known.len()
            ),
            0,
        );

        // Propagation to fixpoint: infer single unknowns in determined confluences.
        let mut assign = m.known.clone();
        loop {
            let mut changed = false;
            for c in &m.confluences {
                let unknown: Vec<&(bool, String)> = c
                    .terms
                    .iter()
                    .filter(|(_, v)| !assign.contains_key(v))
                    .collect();
                if unknown.len() != 1 {
                    continue;
                }
                let known_signs: Vec<Sign> = c
                    .terms
                    .iter()
                    .filter(|(_, v)| assign.contains_key(v))
                    .map(|(pos, v)| if *pos { assign[v] } else { assign[v].negate() })
                    .collect();
                match sign_sum(&known_signs) {
                    Some(s) => {
                        let (pos, v) = unknown[0];
                        // term + s = 0  ⇒ term = -s; var = ∓s depending on coefficient.
                        let var_sign = if *pos { s.negate() } else { s };
                        assign.insert(v.clone(), var_sign);
                        tr(
                            &mut trace,
                            "propagate-confluence",
                            format!("{}: [{}] = {} forced", c.id, v, var_sign.glyph()),
                            1,
                        );
                        changed = true;
                    }
                    None => {
                        tr(
                            &mut trace,
                            "branch-ambiguity",
                            format!("{}: + ⊕ − ambiguous, deferring to envisionment", c.id),
                            1,
                        );
                    }
                }
            }
            if !changed {
                break;
            }
        }
        if trace.len() == 1 {
            // No propagation possible at all: record the survey step.
            tr(
                &mut trace,
                "propagate-confluence",
                "no determined confluence; all inference deferred to envisionment".to_string(),
                1,
            );
        }

        // Envisionment: DFS over unknown variables (lex order), keep consistent states.
        let unknown_vars: Vec<String> = m
            .vars
            .iter()
            .filter(|v| !assign.contains_key(*v))
            .cloned()
            .collect();
        let mut states: Vec<BTreeMap<String, Sign>> = Vec::new();
        let mut stack: Vec<BTreeMap<String, Sign>> = vec![assign.clone()];
        while let Some(cur) = stack.pop() {
            let next_var = unknown_vars.iter().find(|v| !cur.contains_key(*v));
            match next_var {
                None => {
                    if consistent(&cur, &m.confluences) {
                        states.push(cur);
                    }
                }
                Some(v) => {
                    // Push in reverse so exploration order is +, 0, −.
                    for s in [Sign::Minus, Sign::Zero, Sign::Plus] {
                        let mut nxt = cur.clone();
                        nxt.insert(v.clone(), s);
                        stack.push(nxt);
                    }
                }
            }
        }
        states.sort();
        if states.len() > MAX_STATES {
            return Err(BreedError {
                breed: BreedId::QualitativeReason,
                message: format!("envisionment produced {} states (cap {})", states.len(), MAX_STATES),
            });
        }
        if states.is_empty() {
            return Err(BreedError {
                breed: BreedId::QualitativeReason,
                message: "no consistent qualitative state (over-constrained confluences)".to_string(),
            });
        }

        let mut facts: Vec<Fact> = Vec::new();
        let mut equilibrium: Option<usize> = None;
        for (i, st) in states.iter().enumerate() {
            let rendered = m
                .vars
                .iter()
                .map(|v| format!("{}:{}", v, st[v].glyph()))
                .collect::<Vec<_>>()
                .join(",");
            tr(&mut trace, "envision-state", format!("S{}: {}", i, rendered), 1);
            let moving: Vec<&String> = m.vars.iter().filter(|v| st[*v] != Sign::Zero).collect();
            tr(
                &mut trace,
                "limit-analysis",
                if moving.is_empty() {
                    format!("S{}: all derivatives 0 (no limit crossing)", i)
                } else {
                    format!(
                        "S{}: moving variables [{}]",
                        i,
                        moving
                            .iter()
                            .map(|s| s.as_str())
                            .collect::<Vec<_>>()
                            .join(",")
                    )
                },
                1,
            );
            facts.push(Fact {
                key: format!("qr:state:{}", i),
                value: rendered,
            });
            if moving.is_empty() && equilibrium.is_none() {
                equilibrium = Some(i);
            }
        }
        facts.push(Fact {
            key: "qr:state_count".to_string(),
            value: states.len().to_string(),
        });
        facts.push(Fact {
            key: "qr:equilibrium".to_string(),
            value: equilibrium
                .map(|i| format!("S{}", i))
                .unwrap_or_else(|| "none".to_string()),
        });
        if let Some(i) = equilibrium {
            tr(
                &mut trace,
                "equilibrium",
                format!("S{} is a quiescent state (all derivatives 0)", i),
                0,
            );
        }

        Ok(BreedOutput {
            breed: BreedId::QualitativeReason,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(format!("{} states", states.len())),
            explanation: format!(
                "Confluence envisionment: {} consistent qualitative state(s); equilibrium {}.",
                states.len(),
                equilibrium
                    .map(|i| format!("S{}", i))
                    .unwrap_or_else(|| "none".to_string())
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (FM-5 fraud signal)".to_string());
        }
        if output.inference_trace.first().map(|t| t.kind.as_str()) != Some("load-model") {
            return Err("first step must be 'load-model'".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "envision-state") {
            return Err("missing 'envision-state' step".to_string());
        }
        if !output.facts.iter().any(|f| f.key == "qr:state_count") {
            return Err("missing qr:state_count fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "qualitative".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Bathtub: [in] − [out] − [dlevel] = 0 with in=+, out=+ — the ambiguous
    /// + ⊕ − confluence yields all three dlevel branches; one is equilibrium.
    #[test]
    fn bathtub_ambiguity_three_branches() {
        let out = QualitativeReason
            .run(&input(vec![
                fact("qr:confluence:c1", "+in,-out,-dlevel"),
                fact("qr:sign:in", "+"),
                fact("qr:sign:out", "+"),
            ]))
            .unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "qr:state_count" && f.value == "3"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "branch-ambiguity"));
        // dlevel=0 state exists but full equilibrium requires in/out 0 too: none.
        assert!(out
            .facts
            .iter()
            .any(|f| f.key.starts_with("qr:state:") && f.value.contains("dlevel:0")));
    }

    /// Determined confluence propagates the single unknown.
    #[test]
    fn propagation_forces_sign() {
        let out = QualitativeReason
            .run(&input(vec![
                fact("qr:confluence:c1", "+x,-y"),
                fact("qr:sign:x", "+"),
            ]))
            .unwrap();
        // +x − y = 0 with x=+ forces y=+.
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "propagate-confluence" && t.detail.contains("[y] = +")));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "qr:state_count" && f.value == "1"));
    }

    /// All-zero state is the equilibrium.
    #[test]
    fn equilibrium_detected() {
        let out = QualitativeReason
            .run(&input(vec![
                fact("qr:confluence:c1", "+x,-y"),
                fact("qr:sign:x", "0"),
            ]))
            .unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "qr:equilibrium" && f.value == "S0"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "equilibrium"));
    }

    #[test]
    fn refuses_without_confluences() {
        assert!(QualitativeReason
            .preconditions(&input(vec![fact("qr:sign:x", "+")]))
            .is_err());
    }
}
