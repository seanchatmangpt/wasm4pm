//! LTL runtime monitor — Havelund & Roşu 2001 progression (formula rewriting).
//!
//! Finite-trace semantics (documented contract):
//! after consuming every trace event via progression, the residual formula is
//! evaluated at end-of-trace with the standard finite-trace valuation:
//! - `G φ` → **true** (no remaining step can violate it: good prefix),
//! - `F φ` / `φ U ψ` / `X φ` / bare atoms → **false** (the obligated future
//!   state does not exist),
//! - boolean connectives evaluate recursively.
//!
//! So `G p` over a trace where `p` holds at every step is **satisfied**, and a
//! violation at step k yields verdict false with exactly k+1 progression steps.
//!
//! Input contract (facts): `ltl:formula` = formula text (≤256 chars, parsed by
//! the shared `support::formula` Pratt parser); `trace:N` = comma-separated
//! atoms true at step N (≤1000 events).
//!
//! Trace kinds: `ltl-init`(1,1) → `ltl-progress`(1,*) → `ltl-verdict`(1,1).

use crate::breeds::support::breed_class::VerifierBreed;
use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::formula::Formula;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};
use std::collections::BTreeSet;

/// LTL runtime monitor breed (Havelund–Roşu progression).
pub struct LtlMonitor;

impl BoundedBreed for LtlMonitor {
    fn breed_name(&self) -> &'static str {
        "ltl_monitor"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        // A missing formula is a content error, reported by preconditions().
        if let Ok(formula_str) = extract_formula(input) {
            if formula_str.len() > 256 {
                return Some(CognitionError::ComplexityCap {
                    breed: self.breed_name(),
                    detail: format!("formula exceeds 256 chars (len={})", formula_str.len()),
                });
            }
        }
        let trace_count = input
            .facts
            .iter()
            .filter(|f| f.key.starts_with("trace:"))
            .count();
        if trace_count > 1000 {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("trace exceeds 1000 events (len={})", trace_count),
            });
        }
        None
    }
}

/// LTL-only AST (CTL path quantifiers rejected at translation).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Ltl {
    True,
    False,
    Atom(String),
    Not(Box<Ltl>),
    And(Box<Ltl>, Box<Ltl>),
    Or(Box<Ltl>, Box<Ltl>),
    Next(Box<Ltl>),
    Always(Box<Ltl>),
    Eventual(Box<Ltl>),
    Until(Box<Ltl>, Box<Ltl>),
}

impl Ltl {
    fn from_formula(f: &Formula) -> Result<Self, String> {
        Ok(match f {
            Formula::True => Ltl::True,
            Formula::False => Ltl::False,
            Formula::Atom(s) => Ltl::Atom(s.clone()),
            Formula::Not(a) => Ltl::Not(Box::new(Ltl::from_formula(a)?)),
            Formula::And(a, b) => Ltl::And(
                Box::new(Ltl::from_formula(a)?),
                Box::new(Ltl::from_formula(b)?),
            ),
            Formula::Or(a, b) => Ltl::Or(
                Box::new(Ltl::from_formula(a)?),
                Box::new(Ltl::from_formula(b)?),
            ),
            Formula::Implies(a, b) => Ltl::Or(
                Box::new(Ltl::Not(Box::new(Ltl::from_formula(a)?))),
                Box::new(Ltl::from_formula(b)?),
            ),
            Formula::Next(a) => Ltl::Next(Box::new(Ltl::from_formula(a)?)),
            Formula::Eventually(a) => Ltl::Eventual(Box::new(Ltl::from_formula(a)?)),
            Formula::Globally(a) => Ltl::Always(Box::new(Ltl::from_formula(a)?)),
            Formula::Until(a, b) => Ltl::Until(
                Box::new(Ltl::from_formula(a)?),
                Box::new(Ltl::from_formula(b)?),
            ),
            // φ R ψ  ≡  ψ U (φ & ψ)  weakened: finite-trace R as G ψ | ψ U (φ&ψ).
            Formula::Release(a, b) => {
                let a = Ltl::from_formula(a)?;
                let b = Ltl::from_formula(b)?;
                Ltl::Or(
                    Box::new(Ltl::Always(Box::new(b.clone()))),
                    Box::new(Ltl::Until(
                        Box::new(b.clone()),
                        Box::new(Ltl::And(Box::new(a), Box::new(b))),
                    )),
                )
            }
            Formula::AllPaths(_) | Formula::ExistsPath(_) => {
                return Err("CTL path quantifiers are not valid in LTL".to_string())
            }
        })
    }
}

impl LtlMonitor {
    /// Havelund–Roşu progression: rewrite φ against one trace event.
    fn progress(phi: &Ltl, event: &BTreeSet<String>) -> Ltl {
        match phi {
            Ltl::True => Ltl::True,
            Ltl::False => Ltl::False,
            Ltl::Atom(a) => {
                if event.contains(a) {
                    Ltl::True
                } else {
                    Ltl::False
                }
            }
            Ltl::Not(p) => {
                let pp = Self::progress(p, event);
                match pp {
                    Ltl::True => Ltl::False,
                    Ltl::False => Ltl::True,
                    _ => Ltl::Not(Box::new(pp)),
                }
            }
            Ltl::And(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::False || qq == Ltl::False {
                    return Ltl::False;
                }
                if pp == Ltl::True {
                    return qq;
                }
                if qq == Ltl::True {
                    return pp;
                }
                Ltl::And(Box::new(pp), Box::new(qq))
            }
            Ltl::Or(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::True || qq == Ltl::True {
                    return Ltl::True;
                }
                if pp == Ltl::False {
                    return qq;
                }
                if qq == Ltl::False {
                    return pp;
                }
                Ltl::Or(Box::new(pp), Box::new(qq))
            }
            Ltl::Next(p) => *p.clone(),
            Ltl::Always(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::False {
                    return Ltl::False;
                }
                if pp == Ltl::True {
                    return Ltl::Always(p.clone());
                }
                Ltl::And(Box::new(pp), Box::new(Ltl::Always(p.clone())))
            }
            Ltl::Eventual(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::True {
                    return Ltl::True;
                }
                if pp == Ltl::False {
                    return Ltl::Eventual(p.clone());
                }
                Ltl::Or(Box::new(pp), Box::new(Ltl::Eventual(p.clone())))
            }
            Ltl::Until(p, q) => {
                let qq = Self::progress(q, event);
                if qq == Ltl::True {
                    return Ltl::True;
                }
                let pp = Self::progress(p, event);
                if pp == Ltl::False {
                    return qq;
                }
                Ltl::Or(
                    Box::new(qq),
                    Box::new(Ltl::And(
                        Box::new(pp),
                        Box::new(Ltl::Until(p.clone(), q.clone())),
                    )),
                )
            }
        }
    }

    /// End-of-trace valuation (finite-trace semantics, see module header).
    fn evaluate_end(phi: &Ltl) -> bool {
        match phi {
            Ltl::True => true,
            Ltl::False => false,
            // No further state exists: pending state obligations are false…
            Ltl::Atom(_) | Ltl::Next(_) | Ltl::Eventual(_) | Ltl::Until(_, _) => false,
            // …but G φ is vacuously satisfied on the empty remaining suffix.
            Ltl::Always(_) => true,
            Ltl::Not(p) => !Self::evaluate_end(p),
            Ltl::And(p, q) => Self::evaluate_end(p) && Self::evaluate_end(q),
            Ltl::Or(p, q) => Self::evaluate_end(p) || Self::evaluate_end(q),
        }
    }
}

fn extract_formula(input: &BreedInput) -> Result<String, String> {
    input
        .facts
        .iter()
        .find(|f| f.key == "ltl:formula")
        .map(|f| f.value.clone())
        .ok_or_else(|| "missing ltl:formula fact".to_string())
}

fn extract_trace(input: &BreedInput) -> Vec<(usize, BTreeSet<String>)> {
    let mut trace_events: Vec<(usize, BTreeSet<String>)> = Vec::new();
    for fact in &input.facts {
        if let Some(num_str) = fact.key.strip_prefix("trace:") {
            if let Ok(idx) = num_str.parse::<usize>() {
                let ev: BTreeSet<String> = fact
                    .value
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                trace_events.push((idx, ev));
            }
        }
    }
    trace_events.sort_by_key(|k| k.0);
    trace_events
}

impl VerifierBreed for LtlMonitor {
    fn valid_verdicts(&self) -> &'static [&'static str] {
        &["true", "false"]
    }
}

impl CognitionBreed for LtlMonitor {
    fn id(&self) -> BreedId {
        BreedId::LtlMonitor
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "runtime_monitoring".to_string(),
            "ltl_progression".to_string(),
            "finite_trace_semantics".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let formula_str = extract_formula(input)?;
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        let formula_ast =
            Formula::parse(&formula_str).map_err(|e| format!("formula parse error: {}", e))?;
        Ltl::from_formula(&formula_ast)?;
        let trace_count = input
            .facts
            .iter()
            .filter(|f| f.key.starts_with("trace:"))
            .count();
        if trace_count == 0 {
            return Err("missing trace:N facts (at least one trace event required)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::LtlMonitor,
            message,
        };
        let formula_str = extract_formula(input).map_err(&err)?;
        let formula_ast = Formula::parse(&formula_str)
            .map_err(|e| err(format!("formula parse error: {}", e)))?;
        let mut current_phi = Ltl::from_formula(&formula_ast).map_err(&err)?;
        let trace_events = extract_trace(input);
        if trace_events.is_empty() {
            return Err(err("missing trace:N facts".to_string()));
        }

        let mut trace = Vec::new();
        trace.push(TraceStep {
            step: 0,
            kind: "ltl-init".to_string(),
            detail: formula_str.clone(),
            depth: 0,
            objects: vec![("formula".to_string(), "ltl".to_string())],
        });

        let mut verdict = None;
        for (idx, ev) in &trace_events {
            current_phi = Self::progress(&current_phi, ev);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "ltl-progress".to_string(),
                detail: format!("trace:{} -> {:?}", idx, current_phi),
                depth: 0,
                objects: vec![("event".to_string(), format!("trace-{}", idx))],
            });
            if current_phi == Ltl::True {
                verdict = Some(true);
                break;
            }
            if current_phi == Ltl::False {
                verdict = Some(false);
                break;
            }
        }
        let final_verdict = verdict.unwrap_or_else(|| Self::evaluate_end(&current_phi));

        trace.push(TraceStep {
            step: trace.len(),
            kind: "ltl-verdict".to_string(),
            detail: final_verdict.to_string(),
            depth: 0,
            objects: vec![("decision".to_string(), "verdict".to_string())],
        });

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: "ltl:verdict".to_string(),
            value: final_verdict.to_string(),
        });

        Ok(BreedOutput {
            breed: BreedId::LtlMonitor,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(final_verdict.to_string()),
            explanation: format!(
                "LTL formula '{}' evaluated to {} by Havelund-Rosu progression over {} events",
                formula_str,
                final_verdict,
                trace_events.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_verdict_valid(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_count("ltl-init", 1)?;
        tq.require_at_least("ltl-progress", 1)?;
        tq.require_count("ltl-verdict", 1)?;
        if !output.facts.iter().any(|f| f.key == "ltl:verdict") {
            return Err("missing ltl:verdict output fact".to_string());
        }
        Ok(())
    }
}
