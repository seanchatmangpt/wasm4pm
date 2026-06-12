//! CLP(FD): Constraint Logic Programming over finite integer domains
//! (Jaffar & Lassez, "Constraint Logic Programming", POPL 1987).
//!
//! The CLP scheme instantiated with the finite-domain constraint system
//! (CLP(R)'s real arithmetic is out of scope; the FD instantiation keeps the
//! scheme's defining property — the solver, not enumeration, does the work).
//! The constraint store is propagated to arc consistency (AC-3 over binary
//! support checking, mirroring `support::csp`'s AC-3 contract but over integer
//! domains so arithmetic constraints like `x=y+c` are exact), then first-fail
//! labeling with chronological backtracking.
//!
//! Input facts:
//! - `clp:var:<x>`          value "1..5" or "3"       — integer domain
//! - `clp:constraint:<id>`  value one of:
//!     "x<y" | "x<=y" | "x=y" | "x!=y" | "x=y+<c>" | "x<=<c>" | "x<<c>" |
//!     "alldiff(x,y,z)"
//!   (constraints posted in lex order of <id>; `<c>` an integer literal)

use std::collections::BTreeMap;

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};

/// Maximum number of variables.
const MAX_VARS: usize = 24;
/// Maximum domain size.
const MAX_DOMAIN: usize = 16;
/// Maximum labeling expansions.
const MAX_EXPANSIONS: usize = 4096;

/// CLP(FD) breed.
pub struct Clp;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Constraint {
    /// x < y
    Lt(String, String),
    /// x <= y
    Le(String, String),
    /// x = y
    Eq(String, String),
    /// x != y
    Ne(String, String),
    /// x = y + c
    EqOffset(String, String, i64),
    /// x <= c (unary)
    LeConst(String, i64),
    /// x < c (unary)
    LtConst(String, i64),
    /// all different
    AllDiff(Vec<String>),
}

impl Constraint {
    fn vars(&self) -> Vec<&String> {
        match self {
            Constraint::Lt(a, b)
            | Constraint::Le(a, b)
            | Constraint::Eq(a, b)
            | Constraint::Ne(a, b)
            | Constraint::EqOffset(a, b, _) => vec![a, b],
            Constraint::LeConst(a, _) | Constraint::LtConst(a, _) => vec![a],
            Constraint::AllDiff(vs) => vs.iter().collect(),
        }
    }

    /// Binary check between two concrete values (for the two-var forms).
    fn check2(&self, va: i64, vb: i64) -> bool {
        match self {
            Constraint::Lt(_, _) => va < vb,
            Constraint::Le(_, _) => va <= vb,
            Constraint::Eq(_, _) => va == vb,
            Constraint::Ne(_, _) => va != vb,
            Constraint::EqOffset(_, _, c) => va == vb + c,
            _ => true,
        }
    }
}

type Domains = BTreeMap<String, Vec<i64>>;

fn parse_domain(spec: &str) -> Result<Vec<i64>, String> {
    let spec = spec.trim();
    if let Some((lo, hi)) = spec.split_once("..") {
        let lo: i64 = lo.trim().parse().map_err(|_| format!("malformed domain '{}'", spec))?;
        let hi: i64 = hi.trim().parse().map_err(|_| format!("malformed domain '{}'", spec))?;
        if lo > hi {
            return Err(format!("empty domain '{}'", spec));
        }
        Ok((lo..=hi).collect())
    } else {
        let v: i64 = spec.parse().map_err(|_| format!("malformed domain '{}'", spec))?;
        Ok(vec![v])
    }
}

fn parse_constraint(spec: &str, vars: &Domains) -> Result<Constraint, String> {
    let s = spec.trim();
    if let Some(inner) = s.strip_prefix("alldiff(").and_then(|r| r.strip_suffix(')')) {
        let names: Vec<String> = inner
            .split(',')
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .collect();
        if names.len() < 2 {
            return Err(format!("alldiff needs >=2 variables: '{}'", s));
        }
        for n in &names {
            if !vars.contains_key(n) {
                return Err(format!("unknown variable '{}' in '{}'", n, s));
            }
        }
        return Ok(Constraint::AllDiff(names));
    }
    // operators in scan order: != , <= , < , =
    for op in ["!=", "<=", "<", "="] {
        if let Some(pos) = s.find(op) {
            let lhs = s[..pos].trim().to_string();
            let rhs = s[pos + op.len()..].trim().to_string();
            if !vars.contains_key(&lhs) {
                return Err(format!("unknown variable '{}' in '{}'", lhs, s));
            }
            if let Ok(c) = rhs.parse::<i64>() {
                return match op {
                    "<=" => Ok(Constraint::LeConst(lhs, c)),
                    "<" => Ok(Constraint::LtConst(lhs, c)),
                    "=" => Ok(Constraint::EqOffset(lhs.clone(), lhs, 0)).and_then(|_| {
                        Err(format!("unary '=' to constant not supported; narrow the clp:var domain instead: '{}'", s))
                    }),
                    _ => Err(format!("unary '{}' not supported: '{}'", op, s)),
                };
            }
            // x = y + c ?
            if op == "=" {
                if let Some((y, c)) = rhs.split_once('+') {
                    let y = y.trim().to_string();
                    let c: i64 = c.trim().parse().map_err(|_| format!("malformed offset in '{}'", s))?;
                    if !vars.contains_key(&y) {
                        return Err(format!("unknown variable '{}' in '{}'", y, s));
                    }
                    return Ok(Constraint::EqOffset(lhs, y, c));
                }
            }
            if !vars.contains_key(&rhs) {
                return Err(format!("unknown variable '{}' in '{}'", rhs, s));
            }
            return match op {
                "!=" => Ok(Constraint::Ne(lhs, rhs)),
                "<=" => Ok(Constraint::Le(lhs, rhs)),
                "<" => Ok(Constraint::Lt(lhs, rhs)),
                "=" => Ok(Constraint::Eq(lhs, rhs)),
                _ => unreachable!(),
            };
        }
    }
    Err(format!("unparseable constraint '{}'", s))
}

fn render_domain(d: &[i64]) -> String {
    format!(
        "{{{}}}",
        d.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",")
    )
}

struct Ctx {
    trace: Vec<TraceStep>,
    step: usize,
    expansions: usize,
}

impl Ctx {
    fn tr(&mut self, kind: &str, detail: String, depth: u32) {
        self.trace.push(TraceStep {
            step: self.step,
            kind: kind.to_string(),
            detail,
            depth,
            objects: vec![],
        });
        self.step += 1;
    }
}

/// Propagate the store to arc consistency. Returns false on domain wipeout.
/// Emits one `propagate` step per domain reduction.
fn propagate(ctx: &mut Ctx, domains: &mut Domains, constraints: &[Constraint], depth: u32) -> bool {
    loop {
        let mut changed = false;
        for c in constraints {
            match c {
                Constraint::LeConst(x, k) | Constraint::LtConst(x, k) => {
                    let strict = matches!(c, Constraint::LtConst(_, _));
                    let old = domains[x].clone();
                    let new: Vec<i64> = old
                        .iter()
                        .copied()
                        .filter(|v| if strict { v < k } else { v <= k })
                        .collect();
                    if new.len() != old.len() {
                        ctx.tr(
                            "propagate",
                            format!("{}: {} -> {}", x, render_domain(&old), render_domain(&new)),
                            depth,
                        );
                        domains.insert(x.clone(), new.clone());
                        changed = true;
                    }
                    if new.is_empty() {
                        return false;
                    }
                }
                Constraint::Lt(_, _)
                | Constraint::Le(_, _)
                | Constraint::Eq(_, _)
                | Constraint::Ne(_, _)
                | Constraint::EqOffset(_, _, _) => {
                    let vs = c.vars();
                    let (x, y) = (vs[0].clone(), vs[1].clone());
                    // Revise x against y, then y against x (support semantics).
                    for (a, b, fwd) in [(&x, &y, true), (&y, &x, false)] {
                        let da = domains[a].clone();
                        let db = domains[b].clone();
                        let new: Vec<i64> = da
                            .iter()
                            .copied()
                            .filter(|&va| {
                                db.iter().any(|&vb| {
                                    if fwd {
                                        c.check2(va, vb)
                                    } else {
                                        c.check2(vb, va)
                                    }
                                })
                            })
                            .collect();
                        if new.len() != da.len() {
                            ctx.tr(
                                "propagate",
                                format!("{}: {} -> {}", a, render_domain(&da), render_domain(&new)),
                                depth,
                            );
                            domains.insert(a.clone(), new.clone());
                            changed = true;
                        }
                        if domains[a].is_empty() {
                            return false;
                        }
                    }
                }
                Constraint::AllDiff(names) => {
                    // Singleton-elimination propagation for alldiff.
                    let singles: Vec<(String, i64)> = names
                        .iter()
                        .filter(|n| domains[*n].len() == 1)
                        .map(|n| (n.clone(), domains[n][0]))
                        .collect();
                    for n in names {
                        let old = domains[n].clone();
                        let new: Vec<i64> = old
                            .iter()
                            .copied()
                            .filter(|v| {
                                !singles
                                    .iter()
                                    .any(|(sn, sv)| sn != n && sv == v)
                            })
                            .collect();
                        if new.len() != old.len() {
                            ctx.tr(
                                "propagate",
                                format!("{}: {} -> {} (alldiff)", n, render_domain(&old), render_domain(&new)),
                                depth,
                            );
                            domains.insert(n.clone(), new.clone());
                            changed = true;
                        }
                        if domains[n].is_empty() {
                            return false;
                        }
                    }
                }
            }
        }
        if !changed {
            return true;
        }
    }
}

/// First-fail labeling with chronological backtracking.
fn label(
    ctx: &mut Ctx,
    domains: &Domains,
    constraints: &[Constraint],
    depth: u32,
) -> Result<Option<Domains>, String> {
    ctx.expansions += 1;
    if ctx.expansions > MAX_EXPANSIONS {
        return Err(format!("labeling expansion cap {} exceeded", MAX_EXPANSIONS));
    }
    // First-fail: smallest domain > 1, lex tiebreak.
    let pick = domains
        .iter()
        .filter(|(_, d)| d.len() > 1)
        .min_by_key(|(n, d)| (d.len(), (*n).clone()));
    let (var, dom) = match pick {
        None => return Ok(Some(domains.clone())),
        Some((v, d)) => (v.clone(), d.clone()),
    };
    for val in dom {
        ctx.tr("label", format!("{} := {}", var, val), depth);
        let mut next = domains.clone();
        next.insert(var.clone(), vec![val]);
        if propagate(ctx, &mut next, constraints, depth + 1) {
            if let Some(sol) = label(ctx, &next, constraints, depth + 1)? {
                return Ok(Some(sol));
            }
        }
        ctx.tr("backtrack", format!("{} != {}", var, val), depth);
    }
    Ok(None)
}

impl BoundedBreed for Clp {
    fn breed_name(&self) -> &'static str {
        "clp"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let mut vars: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();
        for f in &input.facts {
            if let Some(x) = f.key.strip_prefix("clp:var:") {
                // Unparseable domains are content errors, reported by preconditions().
                if let Ok(d) = parse_domain(&f.value) {
                    if d.len() > MAX_DOMAIN {
                        return Some(CognitionError::ComplexityCap {
                            breed: self.breed_name(),
                            detail: format!(
                                "domain of '{}' has {} values (cap {})",
                                x,
                                d.len(),
                                MAX_DOMAIN
                            ),
                        });
                    }
                }
                vars.insert(x);
            }
        }
        if vars.len() > MAX_VARS {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("variable count {} exceeds cap {}", vars.len(), MAX_VARS),
            });
        }
        None
    }
}

impl CognitionBreed for Clp {
    fn id(&self) -> BreedId {
        BreedId::Clp
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "finite-domain-constraints".to_string(),
            "arc-consistency-propagation".to_string(),
            "first-fail-labeling".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        let mut domains: Domains = BTreeMap::new();
        for f in &input.facts {
            if let Some(x) = f.key.strip_prefix("clp:var:") {
                let d = parse_domain(&f.value)?;
                domains.insert(x.to_string(), d);
            }
        }
        if domains.is_empty() {
            return Err("clp requires at least one clp:var:* fact".to_string());
        }
        let mut any = false;
        for f in &input.facts {
            if f.key.starts_with("clp:constraint:") {
                parse_constraint(&f.value, &domains)?;
                any = true;
            }
        }
        if !any {
            return Err("clp requires at least one clp:constraint:* fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::Clp,
            message: m,
        };
        let mut domains: Domains = BTreeMap::new();
        for f in &input.facts {
            if let Some(x) = f.key.strip_prefix("clp:var:") {
                domains.insert(x.to_string(), parse_domain(&f.value).map_err(err)?);
            }
        }
        let mut constraint_specs: Vec<(String, String)> = input
            .facts
            .iter()
            .filter_map(|f| {
                f.key
                    .strip_prefix("clp:constraint:")
                    .map(|id| (id.to_string(), f.value.clone()))
            })
            .collect();
        constraint_specs.sort();

        let mut ctx = Ctx {
            trace: Vec::new(),
            step: 0,
            expansions: 0,
        };

        // Incrementally post each constraint and propagate (CLP scheme: the
        // store is consulted as constraints arrive).
        let mut constraints: Vec<Constraint> = Vec::new();
        let mut consistent = true;
        for (id, spec) in &constraint_specs {
            let c = parse_constraint(spec, &domains).map_err(err)?;
            ctx.tr("post-constraint", format!("{}: {}", id, spec), 0);
            constraints.push(c);
            if !propagate(&mut ctx, &mut domains, &constraints, 1) {
                consistent = false;
                break;
            }
        }

        let solution: Option<Domains> = if consistent {
            label(&mut ctx, &domains, &constraints, 1).map_err(err)?
        } else {
            None
        };

        let mut facts: Vec<Fact> = Vec::new();
        let selected;
        match &solution {
            Some(sol) => {
                let assignment = sol
                    .iter()
                    .map(|(v, d)| format!("{}={}", v, d[0]))
                    .collect::<Vec<_>>()
                    .join(",");
                ctx.tr("solution", assignment.clone(), 0);
                for (v, d) in sol {
                    facts.push(Fact {
                        key: format!("clp:solution:{}", v),
                        value: d[0].to_string(),
                    });
                }
                selected = Some(assignment);
            }
            None => {
                ctx.tr(
                    "inconsistent",
                    "constraint store has no solution (domain wipeout)".to_string(),
                    0,
                );
                facts.push(Fact {
                    key: "clp:status".to_string(),
                    value: "inconsistent".to_string(),
                });
                selected = None;
            }
        }

        let backtracks = ctx
            .trace
            .iter()
            .filter(|t| t.kind == "backtrack")
            .count();
        facts.push(Fact {
            key: "clp:backtracks".to_string(),
            value: backtracks.to_string(),
        });

        let trace = ctx.trace;
        Ok(BreedOutput {
            breed: BreedId::Clp,
            candidates: input.candidates.clone(),
            facts,
            selected,
            explanation: format!(
                "CLP(FD): {} constraints posted, {} backtrack(s), {}.",
                constraint_specs.len(),
                backtracks,
                if solution.is_some() {
                    "solution found"
                } else {
                    "store inconsistent"
                }
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("post-constraint")?;
        let last = tq.as_slice().last().map(|t| t.kind.as_str());
        if last != Some("solution") && last != Some("inconsistent") {
            return Err("final step must be 'solution' or 'inconsistent'".to_string());
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
            intent: "solve constraints".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// x<y<z≤3 over 1..5: propagation alone forces x=1,y=2,z=3 — zero backtracks.
    #[test]
    fn propagation_alone_solves_chain() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:x", "1..5"),
                fact("clp:var:y", "1..5"),
                fact("clp:var:z", "1..5"),
                fact("clp:constraint:c1", "x<y"),
                fact("clp:constraint:c2", "y<z"),
                fact("clp:constraint:c3", "z<=3"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("x=1,y=2,z=3"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "clp:backtracks" && f.value == "0"));
        // Exact final domain reductions visible in the trace.
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "propagate" && t.detail == "z: {3,4,5} -> {3}"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "propagate" && t.detail.starts_with("x:") && t.detail.ends_with("{1}")));
        assert!(out.inference_trace.iter().all(|t| t.kind != "backtrack"));
    }

    /// EqOffset arithmetic: x = y + 3, y < 4, x domain forces unique solution.
    #[test]
    fn eq_offset_arithmetic() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:x", "6..9"),
                fact("clp:var:y", "0..9"),
                fact("clp:constraint:c1", "x=y+3"),
                fact("clp:constraint:c2", "y<4"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("x=6,y=3"));
    }

    /// Inconsistent store: x<y over singleton-crossing domains.
    #[test]
    fn wipeout_reports_inconsistent() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:x", "5..5"),
                fact("clp:var:y", "1..4"),
                fact("clp:constraint:c1", "x<y"),
            ]))
            .unwrap();
        assert!(out.selected.is_none());
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "clp:status" && f.value == "inconsistent"));
        assert_eq!(
            out.inference_trace.last().map(|t| t.kind.as_str()),
            Some("inconsistent")
        );
    }

    /// alldiff with labeling.
    #[test]
    fn alldiff_labeled() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:a", "1..2"),
                fact("clp:var:b", "1..2"),
                fact("clp:constraint:c1", "alldiff(a,b)"),
                fact("clp:constraint:c2", "a<b"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("a=1,b=2"));
    }

    #[test]
    fn refuses_without_constraints() {
        let inp = input(vec![fact("clp:var:x", "1..3")]);
        assert!(Clp.preconditions(&inp).is_err());
    }

    #[test]
    fn refuses_domain_too_large() {
        let inp = input(vec![
            fact("clp:var:x", "1..100"),
            fact("clp:constraint:c1", "x=1")
        ]);
        assert!(Clp.custom_check(&inp).is_some());
    }

    #[test]
    fn refuses_malformed_constraint() {
        let inp = input(vec![
            fact("clp:var:x", "1..5"),
            fact("clp:constraint:c1", "x<<<y")
        ]);
        assert!(Clp.preconditions(&inp).is_err());
    }

    #[test]
    fn falsification_gate_alldiff_singleton_elimination() {
        let out = Clp
            .run(&input(vec![
                fact("clp:var:a", "1..1"),
                fact("clp:var:b", "1..3"),
                fact("clp:var:c", "1..3"),
                fact("clp:constraint:c1", "alldiff(a,b,c)"),
                fact("clp:constraint:c2", "b<c"),
            ]))
            .unwrap();
        assert_eq!(out.selected.as_deref(), Some("a=1,b=2,c=3"));
        assert!(out.facts.iter().any(|f| f.key == "clp:backtracks" && f.value == "0"));
    }

    #[test]
    fn invariant_order_independence() {
        let facts1 = vec![
            fact("clp:var:x", "1..5"),
            fact("clp:var:y", "1..5"),
            fact("clp:var:z", "1..5"),
            fact("clp:constraint:c1", "x<y"),
            fact("clp:constraint:c2", "y<z"),
        ];
        let facts2 = vec![
            fact("clp:var:z", "1..5"),
            fact("clp:var:y", "1..5"),
            fact("clp:var:x", "1..5"),
            fact("clp:constraint:c2", "y<z"),
            fact("clp:constraint:c1", "x<y"),
        ];
        let out1 = Clp.run(&input(facts1)).unwrap();
        let out2 = Clp.run(&input(facts2)).unwrap();
        
        let sol1 = out1.selected.unwrap();
        let sol2 = out2.selected.unwrap();
        assert_eq!(sol1, "x=1,y=2,z=3");
        assert_eq!(sol2, "x=1,y=2,z=3");
    }
}
