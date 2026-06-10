use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep, Fact
};
use std::collections::HashSet;
use crate::breeds::support::formula::Formula;

/// LTL Monitor breed.
/// Implements Havelund–Roşu progression rewriting over Ltl AST.
pub struct LtlMonitor;

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
    fn from_formula(f: &Formula) -> Self {
        match f {
            Formula::True => Ltl::True,
            Formula::False => Ltl::False,
            Formula::Atom(s) => Ltl::Atom(s.clone()),
            Formula::Not(a) => Ltl::Not(Box::new(Ltl::from_formula(a))),
            Formula::And(a, b) => Ltl::And(Box::new(Ltl::from_formula(a)), Box::new(Ltl::from_formula(b))),
            Formula::Or(a, b) => Ltl::Or(Box::new(Ltl::from_formula(a)), Box::new(Ltl::from_formula(b))),
            Formula::Implies(a, b) => {
                Ltl::Or(
                    Box::new(Ltl::Not(Box::new(Ltl::from_formula(a)))),
                    Box::new(Ltl::from_formula(b))
                )
            }
            Formula::Next(a) => Ltl::Next(Box::new(Ltl::from_formula(a))),
            Formula::Eventually(a) => Ltl::Eventual(Box::new(Ltl::from_formula(a))),
            Formula::Globally(a) => Ltl::Always(Box::new(Ltl::from_formula(a))),
            Formula::Until(a, b) => Ltl::Until(Box::new(Ltl::from_formula(a)), Box::new(Ltl::from_formula(b))),
            Formula::Release(a, b) => {
                Ltl::Until(Box::new(Ltl::from_formula(b)), Box::new(Ltl::And(Box::new(Ltl::from_formula(a)), Box::new(Ltl::from_formula(b)))))
            }
            Formula::AllPaths(a) | Formula::ExistsPath(a) => Ltl::from_formula(a),
        }
    }
}

impl LtlMonitor {
    fn progress(phi: &Ltl, event: &HashSet<String>) -> Ltl {
        match phi {
            Ltl::True => Ltl::True,
            Ltl::False => Ltl::False,
            Ltl::Atom(a) => if event.contains(a) { Ltl::True } else { Ltl::False },
            Ltl::Not(p) => {
                let pp = Self::progress(p, event);
                match pp {
                    Ltl::True => Ltl::False,
                    Ltl::False => Ltl::True,
                    _ => Ltl::Not(Box::new(pp)),
                }
            },
            Ltl::And(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::False || qq == Ltl::False { return Ltl::False; }
                if pp == Ltl::True { return qq; }
                if qq == Ltl::True { return pp; }
                Ltl::And(Box::new(pp), Box::new(qq))
            },
            Ltl::Or(p, q) => {
                let pp = Self::progress(p, event);
                let qq = Self::progress(q, event);
                if pp == Ltl::True || qq == Ltl::True { return Ltl::True; }
                if pp == Ltl::False { return qq; }
                if qq == Ltl::False { return pp; }
                Ltl::Or(Box::new(pp), Box::new(qq))
            },
            Ltl::Next(p) => *p.clone(),
            Ltl::Always(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::False { return Ltl::False; }
                if pp == Ltl::True { return Ltl::Always(p.clone()); }
                Ltl::And(Box::new(pp), Box::new(Ltl::Always(p.clone())))
            },
            Ltl::Eventual(p) => {
                let pp = Self::progress(p, event);
                if pp == Ltl::True { return Ltl::True; }
                if pp == Ltl::False { return Ltl::Eventual(p.clone()); }
                Ltl::Or(Box::new(pp), Box::new(Ltl::Eventual(p.clone())))
            },
            Ltl::Until(p, q) => {
                let qq = Self::progress(q, event);
                if qq == Ltl::True { return Ltl::True; }
                let pp = Self::progress(p, event);
                if pp == Ltl::False { return qq; }
                Ltl::Or(
                    Box::new(qq),
                    Box::new(Ltl::And(
                        Box::new(pp),
                        Box::new(Ltl::Until(p.clone(), q.clone()))
                    ))
                )
            }
        }
    }

    fn evaluate_end(phi: &Ltl) -> bool {
        match phi {
            Ltl::True => true,
            Ltl::False => false,
            Ltl::Atom(_) => false,
            Ltl::Not(p) => !Self::evaluate_end(p),
            Ltl::And(p, q) => Self::evaluate_end(p) && Self::evaluate_end(q),
            Ltl::Or(p, q) => Self::evaluate_end(p) || Self::evaluate_end(q),
            Ltl::Next(_) => false,
            Ltl::Always(p) => Self::evaluate_end(p),
            Ltl::Eventual(_) => false,
            Ltl::Until(_, _) => false,
        }
    }
}

impl CognitionBreed for LtlMonitor {
    fn id(&self) -> BreedId {
        BreedId::LtlMonitor
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["runtime_monitoring".to_string(), "ltl_progression".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let formula_str = if let Some(formula_fact) = input.facts.iter().find(|f| f.key == "ltl:formula" || f.key == "formula") {
            formula_fact.value.clone()
        } else if !input.intent.is_empty() {
            input.intent.clone()
        } else {
            return Err("missing ltl:formula fact".to_string());
        };

        if formula_str.len() > 256 {
            return Err(format!("Formula exceeds 256 chars (len={})", formula_str.len()));
        }

        let formula_ast = Formula::parse(&formula_str)
            .map_err(|e| format!("Formula parse error: {}", e))?;

        if formula_ast.size() > 100 {
            return Err("Formula exceeds node limit".to_string());
        }

        let trace_count = if !input.cases.is_empty() {
            input.cases.len()
        } else {
            input.facts.iter().filter(|f| f.key.starts_with("trace:")).count()
        };

        if trace_count > 1000 {
            return Err(format!("Trace exceeds 1000 events (len={})", trace_count));
        }

        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let formula_str = if let Some(formula_fact) = input.facts.iter().find(|f| f.key == "ltl:formula" || f.key == "formula") {
            formula_fact.value.clone()
        } else if !input.intent.is_empty() {
            input.intent.clone()
        } else {
            return Err(BreedError { breed: self.id(), message: "missing ltl:formula fact".to_string() });
        };

        let mut trace_events: Vec<(usize, HashSet<String>)> = Vec::new();
        if !input.cases.is_empty() {
            for (idx, case) in input.cases.iter().enumerate() {
                let ev: HashSet<String> = case.facts.iter().map(|f| f.key.clone()).collect();
                trace_events.push((idx, ev));
            }
        } else {
            for fact in &input.facts {
                if let Some(num_str) = fact.key.strip_prefix("trace:") {
                    if let Ok(idx) = num_str.parse::<usize>() {
                        let ev: HashSet<String> = fact.value.split(',').filter(|s| !s.is_empty()).map(|s| s.trim().to_string()).collect();
                        trace_events.push((idx, ev));
                    }
                }
            }
        }
        trace_events.sort_by_key(|k| k.0);

        let mut trace = Vec::new();
        let mut step = 0;

        let formula_ast = Formula::parse(&formula_str).map_err(|e| BreedError {
            breed: BreedId::LtlMonitor,
            message: format!("Parse error: {}", e),
        })?;
        let mut current_phi = Ltl::from_formula(&formula_ast);

        trace.push(TraceStep {
            step,
            kind: "ltl-init".to_string(),
            detail: formula_str.clone(),
            depth: 0,
            objects: vec![],
        });
        step += 1;

        let mut verdict = None;

        for (idx, ev) in trace_events {
            current_phi = Self::progress(&current_phi, &ev);
            trace.push(TraceStep {
                step,
                kind: "ltl-progress".to_string(),
                detail: format!("trace:{} -> {:?}", idx, current_phi),
                depth: 0,
                objects: vec![],
            });
            step += 1;

            if current_phi == Ltl::True {
                verdict = Some(true);
                break;
            }
            if current_phi == Ltl::False {
                verdict = Some(false);
                break;
            }
        }

        if verdict.is_none() {
            verdict = Some(Self::evaluate_end(&current_phi));
        }

        let final_verdict = verdict.unwrap();
        trace.push(TraceStep {
            step,
            kind: "ltl-verdict".to_string(),
            detail: final_verdict.to_string(),
            depth: 0,
            objects: vec![],
        });

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: "conforms".to_string(),
            value: final_verdict.to_string(),
        });

        Ok(BreedOutput {
            breed: BreedId::LtlMonitor,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(final_verdict.to_string()),
            explanation: format!("LTL formula '{}' evaluated to {}", formula_str, final_verdict),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        let has_init = output.inference_trace.iter().any(|t| t.kind == "ltl-init");
        let has_verdict = output.inference_trace.iter().any(|t| t.kind == "ltl-verdict");
        if !has_init || !has_verdict {
            return Err("Trace must include ltl-init and ltl-verdict".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    #[test]
    fn test_refusal_formula_too_long() {
        let breed = LtlMonitor;
        let long_formula = "A".repeat(257);
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![Fact { key: "ltl:formula".into(), value: long_formula }],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = breed.preconditions(&input).unwrap_err();
        assert!(err.contains("exceeds 256 chars"));
    }

    #[test]
    fn test_refusal_trace_too_long() {
        let breed = LtlMonitor;
        let mut facts = vec![Fact { key: "ltl:formula".into(), value: "true".into() }];
        for i in 0..1001 {
            facts.push(Fact { key: format!("trace:{}", i), value: "".into() });
        }
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = breed.preconditions(&input).unwrap_err();
        assert!(err.contains("exceeds 1000 events"));
    }

    #[test]
    fn test_hidden_oracle_always_zorp() {
        let breed = LtlMonitor;
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![
                Fact { key: "ltl:formula".into(), value: "G zorp".into() },
                Fact { key: "trace:0".into(), value: "zorp".into() },
                Fact { key: "trace:1".into(), value: "zorp".into() },
                Fact { key: "trace:2".into(), value: "zorp".into() },
                Fact { key: "trace:3".into(), value: "foo".into() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("false"));
        let t_progress = out.inference_trace.iter().filter(|t| t.kind == "ltl-progress").count();
        assert_eq!(t_progress, 4); // evaluated at 0, 1, 2, 3 and failed at 3
    }

    #[test]
    fn test_hidden_oracle_until() {
        let breed = LtlMonitor;
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![
                Fact { key: "ltl:formula".into(), value: "quux U blee".into() },
                Fact { key: "trace:0".into(), value: "quux".into() },
                Fact { key: "trace:1".into(), value: "quux".into() },
                Fact { key: "trace:2".into(), value: "blee".into() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = breed.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("true"));
        let t_progress = out.inference_trace.iter().filter(|t| t.kind == "ltl-progress").count();
        assert_eq!(t_progress, 3); // 0, 1, 2 (satisfied at 2)
    }

    #[test]
    fn test_paper_grounded_determinism() {
        let breed = LtlMonitor;
        let input1 = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![
                Fact { key: "ltl:formula".into(), value: "G zorp".into() },
                Fact { key: "trace:0".into(), value: "zorp".into() },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out1 = breed.run(&input1).unwrap();
        let out2 = breed.run(&input1).unwrap();
        assert_eq!(out1.selected, out2.selected);
        assert_eq!(out1.inference_trace, out2.inference_trace);
    }
}
