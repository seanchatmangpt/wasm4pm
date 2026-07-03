//! PDDL-subset parser: durative actions with numeric fluents only (the
//! temporal-planning shape this crate exists for) — a fresh grammar, not
//! ported from bcinr-pddl's `parse.rs`. Classical (non-durative) actions are
//! intentionally out of scope for this first slice.

use crate::sexpr::{parse_sexpr, SExpr};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Atom {
    pub pred: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CompareOp {
    Ge,
    Le,
    Gt,
    Lt,
    Eq,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    Atom(Atom),
    Not(Box<Condition>),
    Compare(String, CompareOp, f64),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    Add(Atom),
    Del(Atom),
    Increase(String, f64),
    Decrease(String, f64),
}

/// A durative-action condition/effect tagged by when it applies.
#[derive(Debug, Clone, PartialEq)]
pub struct Timed<T> {
    pub at_end: bool,
    pub inner: T,
}

#[derive(Debug, Clone)]
pub struct DurativeActionSchema {
    pub name: String,
    /// Parameter names, in declared order (types are parsed but not
    /// enforced — this slice has one implicit object type, matching the
    /// bcinr-pddl capacity test domains this crate's tests mirror).
    pub params: Vec<String>,
    pub duration: f64,
    pub conditions: Vec<Timed<Condition>>,
    pub effects: Vec<Timed<Effect>>,
}

#[derive(Debug, Clone)]
pub struct Domain {
    pub name: String,
    pub durative_actions: Vec<DurativeActionSchema>,
}

#[derive(Debug, Clone)]
pub struct Problem {
    pub name: String,
    pub domain: String,
    pub objects: Vec<String>,
    pub init_atoms: Vec<Atom>,
    pub init_fn_values: HashMap<String, f64>,
    /// Goal: conjunction of positive atoms (negation not needed for this slice).
    pub goal: Vec<Atom>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlannerError {
    Parse(String),
}

impl std::fmt::Display for PlannerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlannerError::Parse(msg) => write!(f, "parse error: {msg}"),
        }
    }
}

impl std::error::Error for PlannerError {}

fn err(msg: impl Into<String>) -> PlannerError {
    PlannerError::Parse(msg.into())
}

fn atom_str(e: &SExpr) -> Result<&str, PlannerError> {
    e.as_atom().ok_or_else(|| err("expected atom"))
}

fn list_items(e: &SExpr) -> Result<&[SExpr], PlannerError> {
    e.as_list().ok_or_else(|| err("expected list"))
}

/// Strip `?` sigils and drop `- type` markers, keeping only param/object
/// names — e.g. `(w1 w2 - worker)` yields `["w1", "w2"]`, not
/// `["w1", "w2", "worker"]`. Supports multiple `- type` groups in one list
/// (`a b - t1 c - t2`), the common PDDL typed-list shape.
fn parse_typed_name_list(items: &[SExpr]) -> Vec<String> {
    let mut names = Vec::new();
    let mut i = 0;
    while i < items.len() {
        match items[i].as_atom() {
            Some("-") => {
                // Skip the type name that follows the dash.
                i += 2;
            }
            Some(s) => {
                names.push(s.trim_start_matches('?').to_string());
                i += 1;
            }
            None => {
                i += 1;
            }
        }
    }
    names
}

fn parse_param_list(items: &[SExpr]) -> Vec<String> {
    items
        .iter()
        .filter_map(|e| e.as_atom())
        .filter(|s| s.starts_with('?'))
        .map(|s| s.trim_start_matches('?').to_string())
        .collect()
}

fn parse_atom(e: &SExpr) -> Result<Atom, PlannerError> {
    let items = list_items(e)?;
    let (pred, rest) = items.split_first().ok_or_else(|| err("empty atom"))?;
    let pred = atom_str(pred)?.to_string();
    let args = rest
        .iter()
        .filter_map(|a| a.as_atom())
        .map(|s| s.trim_start_matches('?').to_string())
        .collect();
    Ok(Atom { pred, args })
}

fn parse_condition(e: &SExpr) -> Result<Condition, PlannerError> {
    let items = list_items(e)?;
    let head = atom_str(items.first().ok_or_else(|| err("empty condition"))?)?;
    match head {
        "not" => {
            let inner = parse_condition(items.get(1).ok_or_else(|| err("not: missing operand"))?)?;
            Ok(Condition::Not(Box::new(inner)))
        }
        ">=" | "<=" | ">" | "<" | "=" => {
            let fn_name = parse_fn_ref(items.get(1).ok_or_else(|| err("compare: missing fn"))?)?;
            let value: f64 = atom_str(items.get(2).ok_or_else(|| err("compare: missing value"))?)?
                .parse()
                .map_err(|_| err("compare: invalid number"))?;
            let op = match head {
                ">=" => CompareOp::Ge,
                "<=" => CompareOp::Le,
                ">" => CompareOp::Gt,
                "<" => CompareOp::Lt,
                _ => CompareOp::Eq,
            };
            Ok(Condition::Compare(fn_name, op, value))
        }
        _ => Ok(Condition::Atom(parse_atom(e)?)),
    }
}

fn parse_fn_ref(e: &SExpr) -> Result<String, PlannerError> {
    let items = list_items(e)?;
    let name = atom_str(items.first().ok_or_else(|| err("empty function ref"))?)?;
    Ok(name.to_string())
}

/// Parse a `(at start ...)` / `(at end ...)` wrapper, or an `(and ...)` of
/// such wrappers, into a flat list of timed items using `parse_inner` for
/// the wrapped condition/effect.
fn parse_timed_list<T>(
    e: &SExpr,
    parse_inner: fn(&SExpr) -> Result<T, PlannerError>,
) -> Result<Vec<Timed<T>>, PlannerError> {
    let items = list_items(e)?;
    let head = atom_str(items.first().ok_or_else(|| err("empty timed expression"))?)?;
    if head == "and" {
        let mut out = Vec::new();
        for sub in &items[1..] {
            out.extend(parse_timed_list(sub, parse_inner)?);
        }
        Ok(out)
    } else if head == "at" {
        let when = atom_str(items.get(1).ok_or_else(|| err("at: missing start/end"))?)?;
        let at_end = match when {
            "start" => false,
            "end" => true,
            other => return Err(err(format!("at: expected start/end, got {other}"))),
        };
        let inner = parse_inner(items.get(2).ok_or_else(|| err("at: missing body"))?)?;
        Ok(vec![Timed { at_end, inner }])
    } else {
        Err(err(format!("expected 'and' or 'at', got {head}")))
    }
}

fn parse_effect_inner(e: &SExpr) -> Result<Effect, PlannerError> {
    let items = list_items(e)?;
    let head = atom_str(items.first().ok_or_else(|| err("empty effect"))?)?;
    match head {
        "not" => {
            let atom = parse_atom(items.get(1).ok_or_else(|| err("not: missing atom"))?)?;
            Ok(Effect::Del(atom))
        }
        "increase" => {
            let fn_name = parse_fn_ref(items.get(1).ok_or_else(|| err("increase: missing fn"))?)?;
            let value: f64 = atom_str(items.get(2).ok_or_else(|| err("increase: missing value"))?)?
                .parse()
                .map_err(|_| err("increase: invalid number"))?;
            Ok(Effect::Increase(fn_name, value))
        }
        "decrease" => {
            let fn_name = parse_fn_ref(items.get(1).ok_or_else(|| err("decrease: missing fn"))?)?;
            let value: f64 = atom_str(items.get(2).ok_or_else(|| err("decrease: missing value"))?)?
                .parse()
                .map_err(|_| err("decrease: invalid number"))?;
            Ok(Effect::Decrease(fn_name, value))
        }
        _ => Ok(Effect::Add(parse_atom(e)?)),
    }
}

fn find_kw<'a>(items: &'a [SExpr], kw: &str) -> Option<&'a SExpr> {
    items.iter().enumerate().find_map(|(i, e)| {
        if e.as_atom() == Some(kw) {
            items.get(i + 1)
        } else {
            None
        }
    })
}

fn parse_durative_action(items: &[SExpr]) -> Result<DurativeActionSchema, PlannerError> {
    // items[0] = ":durative-action", items[1] = name
    let name = atom_str(
        items
            .get(1)
            .ok_or_else(|| err("durative-action: missing name"))?,
    )?
    .to_string();

    let params = find_kw(items, ":parameters")
        .map(|e| list_items(e).map(parse_param_list))
        .transpose()?
        .unwrap_or_default();

    let duration_expr =
        find_kw(items, ":duration").ok_or_else(|| err("durative-action: missing :duration"))?;
    let dur_items = list_items(duration_expr)?;
    // (= ?duration N)
    let duration: f64 = atom_str(
        dur_items
            .get(2)
            .ok_or_else(|| err(":duration: malformed"))?,
    )?
    .parse()
    .map_err(|_| err(":duration: invalid number"))?;

    let conditions = find_kw(items, ":condition")
        .map(|e| parse_timed_list(e, parse_condition))
        .transpose()?
        .unwrap_or_default();

    let effects = find_kw(items, ":effect")
        .map(|e| parse_timed_list(e, parse_effect_inner))
        .transpose()?
        .unwrap_or_default();

    Ok(DurativeActionSchema {
        name,
        params,
        duration,
        conditions,
        effects,
    })
}

pub fn domain_from_pddl(text: &str) -> Result<Domain, PlannerError> {
    let root = parse_sexpr(text).map_err(|e| err(e.to_string()))?;
    let items = list_items(&root)?;
    // (define (domain NAME) ...)
    if items.first().and_then(|e| e.as_atom()) != Some("define") {
        return Err(err("expected (define ...)"));
    }
    let domain_header = list_items(items.get(1).ok_or_else(|| err("missing domain header"))?)?;
    let name = atom_str(
        domain_header
            .get(1)
            .ok_or_else(|| err("missing domain name"))?,
    )?
    .to_string();

    let mut durative_actions = Vec::new();
    for section in &items[2..] {
        let Ok(sec_items) = list_items(section) else {
            continue;
        };
        if sec_items.first().and_then(|e| e.as_atom()) == Some(":durative-action") {
            durative_actions.push(parse_durative_action(sec_items)?);
        }
    }

    if name.is_empty() {
        return Err(err("domain name is empty"));
    }

    Ok(Domain {
        name,
        durative_actions,
    })
}

pub fn problem_from_pddl(text: &str) -> Result<Problem, PlannerError> {
    let root = parse_sexpr(text).map_err(|e| err(e.to_string()))?;
    let items = list_items(&root)?;
    if items.first().and_then(|e| e.as_atom()) != Some("define") {
        return Err(err("expected (define ...)"));
    }
    let problem_header = list_items(items.get(1).ok_or_else(|| err("missing problem header"))?)?;
    let name = atom_str(
        problem_header
            .get(1)
            .ok_or_else(|| err("missing problem name"))?,
    )?
    .to_string();

    let mut domain = String::new();
    let mut objects = Vec::new();
    let mut init_atoms = Vec::new();
    let mut init_fn_values = HashMap::new();
    let mut goal = Vec::new();

    for section in &items[2..] {
        let Ok(sec_items) = list_items(section) else {
            continue;
        };
        match sec_items.first().and_then(|e| e.as_atom()) {
            Some(":domain") => {
                domain = atom_str(
                    sec_items
                        .get(1)
                        .ok_or_else(|| err(":domain: missing name"))?,
                )?
                .to_string();
            }
            Some(":objects") => {
                objects = parse_typed_name_list(&sec_items[1..]);
            }
            Some(":init") => {
                for init_item in &sec_items[1..] {
                    let init_list = list_items(init_item)?;
                    if init_list.first().and_then(|e| e.as_atom()) == Some("=") {
                        let fn_name = parse_fn_ref(
                            init_list.get(1).ok_or_else(|| err("init: malformed ="))?,
                        )?;
                        let value: f64 =
                            atom_str(init_list.get(2).ok_or_else(|| err("init: missing value"))?)?
                                .parse()
                                .map_err(|_| err("init: invalid number"))?;
                        init_fn_values.insert(fn_name, value);
                    } else {
                        init_atoms.push(parse_atom(init_item)?);
                    }
                }
            }
            Some(":goal") => {
                let goal_expr = sec_items.get(1).ok_or_else(|| err(":goal: missing body"))?;
                let goal_items = list_items(goal_expr)?;
                if goal_items.first().and_then(|e| e.as_atom()) == Some("and") {
                    for g in &goal_items[1..] {
                        goal.push(parse_atom(g)?);
                    }
                } else {
                    goal.push(parse_atom(goal_expr)?);
                }
            }
            _ => {}
        }
    }

    if name.is_empty() || domain.is_empty() {
        return Err(err("problem/domain name is empty"));
    }

    Ok(Problem {
        name,
        domain,
        objects,
        init_atoms,
        init_fn_values,
        goal,
    })
}
