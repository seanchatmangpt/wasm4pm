//! SNLP partial-order planning (McAllester & Rosenblitt, "Systematic Nonlinear
//! Planning", AAAI 1991).
//!
//! Propositional STRIPS operators are supplied as facts:
//! - `pop:op:<name>:pre` = "p,q"   — preconditions (may be absent = none)
//! - `pop:op:<name>:add` = "r,s"   — add effects
//! - `pop:op:<name>:del` = "t"     — delete effects
//!
//! The initial state is `input.state` (each atom's `predicate` field is the
//! proposition); the goals are `input.goals` (each goal's `predicate` is the
//! proposition). Synthetic Start (adds initial state) and Finish (preconditions
//! = goals) steps frame the plan.
//!
//! Algorithm: causal-link planning — pick the lexicographically least open
//! condition, choose a producer (existing steps in id order, then new operators
//! in name order, chronological backtracking over choices), add the causal
//! link, then detect threats (steps deleting a linked atom that can be ordered
//! between producer and consumer) and resolve by promotion first, then
//! demotion. Ordering consistency is checked by cycle detection.

use std::collections::{BTreeMap, BTreeSet};

use crate::breeds::support::breed_class::PlannerBreed;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum recursion depth.
const MAX_DEPTH: u32 = 64;
/// Maximum number of search-node expansions.
const MAX_EXPANSIONS: usize = 512;

/// SNLP partial-order planner.
pub struct PartialOrderPlan;

#[derive(Debug, Clone, Default)]
struct Op {
    pre: BTreeSet<String>,
    add: BTreeSet<String>,
    del: BTreeSet<String>,
}

#[derive(Debug, Clone)]
struct Plan {
    /// step id → operator name ("__start__"/"__finish__" for 0/1)
    steps: Vec<String>,
    /// strict ordering edges a < b
    orderings: BTreeSet<(usize, usize)>,
    /// causal links (producer, atom, consumer)
    links: Vec<(usize, String, usize)>,
    /// open conditions (atom, consumer) — BTreeSet gives lex-least selection
    agenda: BTreeSet<(String, usize)>,
}

fn parse_ops(input: &BreedInput) -> BTreeMap<String, Op> {
    let mut ops: BTreeMap<String, Op> = BTreeMap::new();
    for f in &input.facts {
        if let Some(rest) = f.key.strip_prefix("pop:op:") {
            let parse_list = |v: &str| -> BTreeSet<String> {
                v.split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect()
            };
            if let Some(name) = rest.strip_suffix(":pre") {
                ops.entry(name.to_string()).or_default().pre = parse_list(&f.value);
            } else if let Some(name) = rest.strip_suffix(":add") {
                ops.entry(name.to_string()).or_default().add = parse_list(&f.value);
            } else if let Some(name) = rest.strip_suffix(":del") {
                ops.entry(name.to_string()).or_default().del = parse_list(&f.value);
            }
        }
    }
    ops
}

/// True iff a path b ⇒ a exists (adding a<b would create a cycle).
fn creates_cycle(orderings: &BTreeSet<(usize, usize)>, a: usize, b: usize) -> bool {
    if a == b {
        return true;
    }
    let mut stack = vec![b];
    let mut seen = BTreeSet::new();
    while let Some(x) = stack.pop() {
        if x == a {
            return true;
        }
        if !seen.insert(x) {
            continue;
        }
        for &(f, t) in orderings.iter() {
            if f == x {
                stack.push(t);
            }
        }
    }
    false
}

/// True iff a < b is consistent (a may be ordered before b).
fn can_order_before(orderings: &BTreeSet<(usize, usize)>, a: usize, b: usize) -> bool {
    !creates_cycle(orderings, a, b)
}

struct Ctx<'a> {
    ops: &'a BTreeMap<String, Op>,
    trace: Vec<TraceStep>,
    step: usize,
    expansions: usize,
}

impl Ctx<'_> {
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

    fn op_of(&self, plan: &Plan, sid: usize) -> Op {
        match plan.steps[sid].as_str() {
            "__start__" | "__finish__" => Op::default(),
            name => self.ops.get(name).cloned().unwrap_or_default(),
        }
    }
}

/// Resolve all threats in `plan`; returns refined plans (branching on promote/demote).
fn resolve_threats(ctx: &mut Ctx, mut plan: Plan, depth: u32) -> Result<Vec<Plan>, String> {
    // Find the first unresolved threat.
    for li in 0..plan.links.len() {
        let (p, atom, c) = plan.links[li].clone();
        for t in 0..plan.steps.len() {
            if t == p || t == c {
                continue;
            }
            let deletes = match plan.steps[t].as_str() {
                "__start__" | "__finish__" => false,
                name => ctx
                    .ops
                    .get(name)
                    .map(|o| o.del.contains(&atom))
                    .unwrap_or(false),
            };
            if !deletes {
                continue;
            }
            // Already strictly outside the link interval?
            let strictly_before = !can_order_before(&plan.orderings, p, t); // t necessarily before p
            let strictly_after = !can_order_before(&plan.orderings, t, c); // t necessarily after c
            if strictly_before || strictly_after {
                continue; // cannot fall inside the interval
            }
            ctx.tr(
                "pop-resolve",
                format!(
                    "step '{}' deletes '{}' threatening link {}→{}",
                    plan.steps[t], atom, plan.steps[p], plan.steps[c]
                ),
                depth,
            );
            let mut results = Vec::new();
            // Promotion: order threat after consumer (c < t).
            if can_order_before(&plan.orderings, c, t) && c != 1 {
                let mut promoted = plan.clone();
                promoted.orderings.insert((c, t));
                ctx.tr(
                    "pop-resolve",
                    format!("'{}' after '{}'", promoted.steps[t], promoted.steps[c]),
                    depth,
                );
                results.extend(resolve_threats(ctx, promoted, depth)?);
            }
            // Demotion: order threat before producer (t < p).
            if results.is_empty() && can_order_before(&plan.orderings, t, p) && p != 0 {
                let mut demoted = plan.clone();
                demoted.orderings.insert((t, p));
                ctx.tr(
                    "pop-resolve",
                    format!("'{}' before '{}'", demoted.steps[t], demoted.steps[p]),
                    depth,
                );
                results.extend(resolve_threats(ctx, demoted, depth)?);
            }
            return Ok(results);
        }
    }
    plan.links.sort();
    Ok(vec![plan])
}

/// Depth-first refinement search.
fn solve(ctx: &mut Ctx, plan: Plan, depth: u32) -> Result<Option<Plan>, String> {
    ctx.expansions += 1;
    if ctx.expansions > MAX_EXPANSIONS {
        return Err(format!("expansion cap {} exceeded", MAX_EXPANSIONS));
    }
    if depth > MAX_DEPTH {
        return Err(format!("depth cap {} exceeded", MAX_DEPTH));
    }

    let (atom, consumer) = match plan.agenda.iter().next().cloned() {
        None => return Ok(Some(plan)),
        Some(oc) => oc,
    };
    ctx.tr(
        "pop-resolve",
        format!("'{}' needed by '{}'", atom, plan.steps[consumer]),
        depth,
    );

    // Producer choices: existing steps in id order, then new ops in name order.
    let mut choices: Vec<(bool, String, usize)> = Vec::new(); // (is_new, name, sid)
    for sid in 0..plan.steps.len() {
        if sid == consumer {
            continue;
        }
        let provides = match plan.steps[sid].as_str() {
            "__finish__" => false,
            name => ctx
                .ops
                .get(name)
                .map(|o| o.add.contains(&atom))
                .unwrap_or(false),
        };
        if provides && can_order_before(&plan.orderings, sid, consumer) {
            choices.push((false, plan.steps[sid].clone(), sid));
        }
    }
    for (name, op) in ctx.ops.iter() {
        if name == "__start__" {
            continue;
        }
        if op.add.contains(&atom) {
            choices.push((true, name.clone(), usize::MAX));
        }
    }

    for (is_new, name, sid) in choices {
        let mut next = plan.clone();
        next.agenda.remove(&(atom.clone(), consumer));
        let producer = if is_new {
            let new_id = next.steps.len();
            next.steps.push(name.clone());
            next.orderings.insert((0, new_id));
            next.orderings.insert((new_id, 1));
            for pre in &ctx.ops[&name].pre {
                next.agenda.insert((pre.clone(), new_id));
            }
            ctx.tr("pop-resolve", format!("'{}' (id {})", name, new_id), depth);
            new_id
        } else {
            sid
        };
        if !can_order_before(&next.orderings, producer, consumer) {
            ctx.tr(
                "pop-resolve",
                format!("'{}' cannot precede consumer", name),
                depth,
            );
            continue;
        }
        next.orderings.insert((producer, consumer));
        next.links.push((producer, atom.clone(), consumer));
        ctx.tr(
            "pop-resolve",
            format!(
                "{} --{}--> {}",
                next.steps[producer], atom, next.steps[consumer]
            ),
            depth,
        );

        let refined = resolve_threats(ctx, next, depth)?;
        if refined.is_empty() {
            ctx.tr(
                "pop-resolve",
                format!("threats unresolvable for producer '{}'", name),
                depth,
            );
            continue;
        }
        for r in refined {
            if let Some(done) = solve(ctx, r, depth + 1)? {
                return Ok(Some(done));
            }
            ctx.tr(
                "pop-resolve",
                format!("dead end under producer '{}'", name),
                depth,
            );
        }
    }
    Ok(None)
}

/// Topological linearization (Kahn's algorithm, smallest-id tiebreak).
fn linearize(plan: &Plan) -> Vec<String> {
    let n = plan.steps.len();
    let mut indeg = vec![0usize; n];
    let mut adj: BTreeSet<(usize, usize)> = plan.orderings.clone();
    for (p, _, c) in &plan.links {
        adj.insert((*p, *c));
    }
    for &(_, b) in &adj {
        indeg[b] += 1;
    }
    let mut order = Vec::new();
    let mut ready: BTreeSet<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    while let Some(&x) = ready.iter().next() {
        ready.remove(&x);
        order.push(x);
        for &(a, b) in adj.iter() {
            if a == x {
                indeg[b] -= 1;
                if indeg[b] == 0 {
                    ready.insert(b);
                }
            }
        }
    }
    order
        .into_iter()
        .filter(|&i| i > 1)
        .map(|i| plan.steps[i].clone())
        .collect()
}

impl PlannerBreed for PartialOrderPlan {
    fn required_trace_kinds(&self) -> &'static [&'static str] {
        &["pop-init", "pop-plan"]
    }
}

impl CognitionBreed for PartialOrderPlan {
    fn id(&self) -> BreedId {
        BreedId::PartialOrderPlan
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "causal-link-planning".to_string(),
            "threat-resolution-promotion-demotion".to_string(),
            "partial-order-linearization".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let ops = parse_ops(input);
        if ops.is_empty() {
            return Err("partial_order_plan requires at least one pop:op:* operator".to_string());
        }
        if input.goals.is_empty() {
            return Err("partial_order_plan requires at least one goal".to_string());
        }
        if ops.len() > 16 {
            return Err(format!("operator count {} exceeds cap 16", ops.len()));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut ops = parse_ops(input);
        let initial: BTreeSet<String> = input
            .state
            .iter()
            .map(|a| a.predicate.trim().to_string())
            .collect();
        ops.insert(
            "__start__".to_string(),
            Op {
                pre: BTreeSet::new(),
                add: initial.clone(),
                del: BTreeSet::new(),
            },
        );
        let goals: BTreeSet<String> = input
            .goals
            .iter()
            .map(|g| g.predicate.trim().to_string())
            .collect();

        let mut ctx = Ctx {
            ops: &ops,
            trace: Vec::new(),
            step: 0,
            expansions: 0,
        };

        let plan = Plan {
            steps: vec!["__start__".to_string(), "__finish__".to_string()],
            orderings: BTreeSet::from([(0usize, 1usize)]),
            links: vec![],
            agenda: goals.iter().map(|g| (g.clone(), 1usize)).collect(),
        };
        ctx.tr(
            "pop-init",
            format!(
                "Start adds {{{}}}, Finish needs {{{}}}",
                initial.iter().cloned().collect::<Vec<_>>().join(","),
                goals.iter().cloned().collect::<Vec<_>>().join(",")
            ),
            0,
        );

        let solved = solve(&mut ctx, plan, 1).map_err(|m| BreedError {
            breed: BreedId::PartialOrderPlan,
            message: m,
        })?;

        let solved = solved.ok_or_else(|| BreedError {
            breed: BreedId::PartialOrderPlan,
            message: "no plan exists for the given operators and goals".to_string(),
        })?;

        let linear = linearize(&solved);
        ctx.tr("pop-plan", format!("plan: [{}]", linear.join(";")), 0);

        let mut facts = vec![Fact {
            key: "pop:plan".to_string(),
            value: linear.join(";"),
        }];
        facts.push(Fact {
            key: "pop:step_count".to_string(),
            value: linear.len().to_string(),
        });

        let trace = ctx.trace;
        Ok(BreedOutput {
            breed: BreedId::PartialOrderPlan,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(linear.join(";")),
            explanation: format!(
                "SNLP causal-link planning: {} steps, {} causal links, {} orderings.",
                linear.len(),
                solved.links.len(),
                solved.orderings.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        self.assert_plan_trace_complete(output)?;
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("pop-init")?;
        tq.require_last("pop-plan")?;
        if !output.facts.iter().any(|f| f.key == "pop:plan") {
            return Err("missing pop:plan fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Goal, StateAtom};

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>, state: Vec<&str>, goals: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "plan".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: goals
                .into_iter()
                .enumerate()
                .map(|(i, g)| Goal {
                    id: format!("g{}", i),
                    predicate: g.into(),
                    value: "true".into(),
                })
                .collect(),
            state: state
                .into_iter()
                .map(|s| StateAtom {
                    predicate: s.into(),
                    value: "true".into(),
                })
                .collect(),
        }
    }

    /// Sussman anomaly (McAllester & Rosenblitt 1991): the interleaved solution
    /// c-to-table, b-on-c, a-on-b — unreachable by linear goal-at-a-time planners.
    #[test]
    fn sussman_anomaly_interleaved_solution() {
        let facts = vec![
            fact("pop:op:put_c_from_a_on_table:pre", "clear_c,on_c_a"),
            fact("pop:op:put_c_from_a_on_table:add", "clear_a,ontable_c"),
            fact("pop:op:put_c_from_a_on_table:del", "on_c_a"),
            fact("pop:op:put_a_on_b:pre", "clear_a,clear_b,ontable_a"),
            fact("pop:op:put_a_on_b:add", "on_a_b"),
            fact("pop:op:put_a_on_b:del", "clear_b,ontable_a"),
            fact("pop:op:put_b_on_c:pre", "clear_b,clear_c,ontable_b"),
            fact("pop:op:put_b_on_c:add", "on_b_c"),
            fact("pop:op:put_b_on_c:del", "clear_c,ontable_b"),
        ];
        let inp = input(
            facts,
            vec!["on_c_a", "clear_c", "clear_b", "ontable_a", "ontable_b"],
            vec!["on_a_b", "on_b_c"],
        );
        let out = PartialOrderPlan.run(&inp).unwrap();
        assert_eq!(
            out.selected.as_deref(),
            Some("put_c_from_a_on_table;put_b_on_c;put_a_on_b")
        );
        assert!(out.inference_trace.iter().any(|t| t.kind == "pop-resolve"));
    }

    /// Promotion forced when demotion would order a step before Start.
    #[test]
    fn promotion_forced() {
        let facts = vec![
            fact("pop:op:wibble:pre", "q"),
            fact("pop:op:wibble:add", "g2"),
            fact("pop:op:blat:add", "g1"),
            fact("pop:op:blat:del", "q"),
        ];
        let inp = input(facts, vec!["q"], vec!["g1", "g2"]);
        let out = PartialOrderPlan.run(&inp).unwrap();
        assert_eq!(out.selected.as_deref(), Some("wibble;blat"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "pop-resolve"));
    }

    #[test]
    fn refuses_without_operators() {
        let inp = input(vec![], vec!["p"], vec!["g"]);
        assert!(PartialOrderPlan.preconditions(&inp).is_err());
    }
}
