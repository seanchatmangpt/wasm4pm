//! CDCL SAT solver with 1-UIP conflict-driven clause learning
//! (Marques-Silva & Sakallah 1999, GRASP, IEEE Trans. Computers).
//!
//! Algorithm: naive-scan unit propagation, lowest-index positive-phase
//! branching, GRASP-style conflict analysis resolving backwards along the
//! implication trail to the first unique implication point (1-UIP), and
//! non-chronological backjumping to the second-highest decision level in the
//! learned clause.
//!
//! Every `learn-clause` trace step carries the learned clause AND the full
//! resolution certificate (`from=` antecedent clause indices, `pivots=`
//! resolution variables) so the oracle can independently re-derive the
//! learned clause as a resolvent and confirm it is falsified at the conflict.
//!
//! Contract: facts `clause:<i>` with DIMACS-style values ("1 -2 3"; 1-based
//! variables, negative = negated). Caps (refusals): ≤64 variables,
//! ≤256 input clauses.

use crate::breeds::support::clauses::{Clause, Lit};
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::BTreeMap;

/// GRASP-style CDCL solver.
pub struct SatCdcl;

fn parse_clauses(input: &BreedInput) -> Result<Vec<Clause>, String> {
    let mut keyed: Vec<(String, Clause)> = Vec::new();
    for f in &input.facts {
        if f.key.starts_with("clause:") {
            let mut lits = Vec::new();
            for tok in f.value.split_whitespace() {
                let n: i64 = tok
                    .parse()
                    .map_err(|_| format!("clause '{}' has non-integer literal '{}'", f.key, tok))?;
                if n == 0 {
                    return Err(format!("clause '{}' contains literal 0", f.key));
                }
                let var = (n.unsigned_abs() - 1) as u32;
                if var >= 64 {
                    return Err(format!(
                        "variable {} exceeds the 64-variable cap (refusal, not truncation)",
                        n.unsigned_abs()
                    ));
                }
                lits.push(if n > 0 { Lit::pos(var) } else { Lit::neg(var) });
            }
            if lits.is_empty() {
                return Err(format!("clause '{}' is empty", f.key));
            }
            keyed.push((f.key.clone(), Clause::new(lits)));
        }
    }
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(keyed.into_iter().map(|(_, c)| c).collect())
}

fn fmt_clause(c: &Clause) -> String {
    c.lits()
        .iter()
        .map(|l| {
            let v = (l.var + 1) as i64;
            if l.positive { v } else { -v }.to_string()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

impl CognitionBreed for SatCdcl {
    fn id(&self) -> BreedId {
        BreedId::SatCdcl
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "cdcl_sat".to_string(),
            "1uip_clause_learning".to_string(),
            "nonchronological_backjumping".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let clauses = parse_clauses(input)?;
        if clauses.is_empty() {
            return Err("sat_cdcl requires at least one clause:<i> fact".to_string());
        }
        if clauses.len() > 256 {
            return Err(format!(
                "complexity cap exceeded: {} clauses > 256 (refusal, not truncation)",
                clauses.len()
            ));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let mut db: Vec<Clause> = parse_clauses(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let n_input = db.len();
        let nvars: u32 = db
            .iter()
            .flat_map(|c| c.lits().iter().map(|l| l.var + 1))
            .max()
            .unwrap_or(0);

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };
        for (i, c) in db.iter().enumerate() {
            push(&mut trace, "load-clause", format!("c{}: ({})", i, fmt_clause(c)));
        }

        // Solver state.
        let mut assignment: BTreeMap<u32, bool> = BTreeMap::new();
        let mut level_of: BTreeMap<u32, u32> = BTreeMap::new();
        let mut reason_of: BTreeMap<u32, usize> = BTreeMap::new();
        let mut trail: Vec<Lit> = Vec::new();
        let mut level: u32 = 0;
        let mut learned_facts: Vec<Fact> = Vec::new();
        let mut learn_count = 0usize;

        let mut assign = |lit: Lit,
                          reason: Option<usize>,
                          level: u32,
                          assignment: &mut BTreeMap<u32, bool>,
                          level_of: &mut BTreeMap<u32, u32>,
                          reason_of: &mut BTreeMap<u32, usize>,
                          trail: &mut Vec<Lit>| {
            assignment.insert(lit.var, lit.positive);
            level_of.insert(lit.var, level);
            if let Some(r) = reason {
                reason_of.insert(lit.var, r);
            } else {
                reason_of.remove(&lit.var);
            }
            trail.push(lit);
        };

        let verdict: &str;
        let mut guard = 0usize;
        'solve: loop {
            guard += 1;
            if guard > 100_000 {
                return Err(BreedError {
                    breed: self.id(),
                    message: "search budget exhausted (100000 iterations)".to_string(),
                });
            }

            // Unit propagation by naive clause scan.
            let mut conflict: Option<usize> = None;
            'propagate: loop {
                let mut progressed = false;
                for (ci, c) in db.iter().enumerate() {
                    match c.eval(&assignment) {
                        Some(true) => {}
                        Some(false) => {
                            conflict = Some(ci);
                            push(
                                &mut trace,
                                "conflict",
                                format!("c{} ({}) falsified at level {}", ci, fmt_clause(c), level),
                            );
                            break 'propagate;
                        }
                        None => {
                            let unassigned: Vec<Lit> = c
                                .lits()
                                .iter()
                                .copied()
                                .filter(|l| !assignment.contains_key(&l.var))
                                .collect();
                            // eval == None ⇒ no literal true; exactly one
                            // unassigned literal ⇒ the clause is unit.
                            if unassigned.len() == 1 {
                                let l = unassigned[0];
                                assign(
                                    l,
                                    Some(ci),
                                    level,
                                    &mut assignment,
                                    &mut level_of,
                                    &mut reason_of,
                                    &mut trail,
                                );
                                push(
                                    &mut trace,
                                    "propagate",
                                    format!(
                                        "unit c{} forces {}{} @L{}",
                                        ci,
                                        if l.positive { "" } else { "-" },
                                        l.var + 1,
                                        level
                                    ),
                                );
                                progressed = true;
                            }
                        }
                    }
                }
                if !progressed {
                    break;
                }
            }

            if let Some(conflict_idx) = conflict {
                if level == 0 {
                    verdict = "UNSAT";
                    break 'solve;
                }
                // GRASP/1-UIP conflict analysis: resolve backwards along the
                // trail until exactly one literal of the current level remains.
                let mut cur = db[conflict_idx].clone();
                let mut from: Vec<usize> = vec![conflict_idx];
                let mut pivots: Vec<u32> = Vec::new();
                loop {
                    let at_level: Vec<Lit> = cur
                        .lits()
                        .iter()
                        .copied()
                        .filter(|l| level_of.get(&l.var) == Some(&level))
                        .collect();
                    if at_level.len() <= 1 {
                        break;
                    }
                    // Last-assigned literal of the current level having a reason.
                    let pivot_lit = trail
                        .iter()
                        .rev()
                        .find(|t| {
                            at_level.iter().any(|l| l.var == t.var)
                                && reason_of.contains_key(&t.var)
                        })
                        .copied();
                    let pivot_lit = match pivot_lit {
                        Some(p) => p,
                        None => break, // only decisions remain — treat as UIP
                    };
                    let r_idx = reason_of[&pivot_lit.var];
                    let reason = db[r_idx].clone();
                    // Resolve cur with reason on pivot var (polarity-aware).
                    let resolved = if cur.contains(Lit::pos(pivot_lit.var)) {
                        cur.resolve(&reason, pivot_lit.var)
                    } else {
                        reason.resolve(&cur, pivot_lit.var)
                    };
                    match resolved {
                        Some(r) => {
                            cur = r;
                            from.push(r_idx);
                            pivots.push(pivot_lit.var);
                        }
                        None => break,
                    }
                }
                let learned = cur;
                if learned.is_empty() {
                    verdict = "UNSAT";
                    push(
                        &mut trace,
                        "learn-clause",
                        format!(
                            "learned=[] from=[{}] pivots=[{}] (empty clause)",
                            from.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(","),
                            pivots.iter().map(|v| (v + 1).to_string()).collect::<Vec<_>>().join(",")
                        ),
                    );
                    break 'solve;
                }
                // Backjump level: second-highest level among learned literals.
                let mut levels: Vec<u32> = learned
                    .lits()
                    .iter()
                    .map(|l| *level_of.get(&l.var).unwrap_or(&0))
                    .collect();
                levels.sort_unstable();
                levels.dedup();
                let bj = if levels.len() >= 2 {
                    levels[levels.len() - 2]
                } else {
                    0
                };
                db.push(learned.clone());
                let learned_idx = db.len() - 1;
                learn_count += 1;
                push(
                    &mut trace,
                    "learn-clause",
                    format!(
                        "learned=[{}] from=[{}] pivots=[{}]",
                        fmt_clause(&learned),
                        from.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(","),
                        pivots.iter().map(|v| (v + 1).to_string()).collect::<Vec<_>>().join(",")
                    ),
                );
                learned_facts.push(Fact {
                    key: format!("learned:{}", learn_count - 1),
                    value: fmt_clause(&learned),
                });
                // Backjump: pop trail above bj.
                while let Some(t) = trail.last().copied() {
                    if level_of.get(&t.var) > Some(&bj) {
                        trail.pop();
                        assignment.remove(&t.var);
                        level_of.remove(&t.var);
                        reason_of.remove(&t.var);
                    } else {
                        break;
                    }
                }
                level = bj;
                push(
                    &mut trace,
                    "backjump",
                    format!("non-chronological backjump to level {}", bj),
                );
                // Assert the UIP literal (learned clause is now unit or empty at bj).
                let uip: Vec<Lit> = learned
                    .lits()
                    .iter()
                    .copied()
                    .filter(|l| !assignment.contains_key(&l.var))
                    .collect();
                if uip.len() == 1 && learned.eval(&assignment) != Some(true) {
                    assign(
                        uip[0],
                        Some(learned_idx),
                        level,
                        &mut assignment,
                        &mut level_of,
                        &mut reason_of,
                        &mut trail,
                    );
                    push(
                        &mut trace,
                        "propagate",
                        format!(
                            "asserted UIP {}{} @L{} by learned c{}",
                            if uip[0].positive { "" } else { "-" },
                            uip[0].var + 1,
                            level,
                            learned_idx
                        ),
                    );
                }
                continue 'solve;
            }

            // No conflict: all variables assigned → SAT; else decide.
            if assignment.len() as u32 >= nvars {
                verdict = "SAT";
                break 'solve;
            }
            let var = (0..nvars).find(|v| !assignment.contains_key(v)).unwrap();
            level += 1;
            assign(
                Lit::pos(var),
                None,
                level,
                &mut assignment,
                &mut level_of,
                &mut reason_of,
                &mut trail,
            );
            push(&mut trace, "decide", format!("decide {} = true @L{}", var + 1, level));
        }

        let mut facts = learned_facts;
        if verdict == "SAT" {
            for (v, val) in &assignment {
                facts.push(Fact {
                    key: format!("model:{}", v + 1),
                    value: val.to_string(),
                });
            }
        }
        push(
            &mut trace,
            "decision",
            format!("{} ({} input clauses, {} learned)", verdict, n_input, learn_count),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(verdict.to_string()),
            explanation: format!(
                "CDCL verdict {} after learning {} clauses over {} variables",
                verdict, learn_count, nvars
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace — no evidence of search".to_string());
        }
        match output.selected.as_deref() {
            Some("SAT") | Some("UNSAT") => Ok(()),
            other => Err(format!("invalid SAT verdict {:?}", other)),
        }
    }
}
