//! Deterministic capability router: which AI surface (Claude Code editing a
//! repo file, Claude Chrome filling a web form, Claude Desktop drafting
//! text) should handle a task is a decidable admission + scheduling
//! question, not a routing-table heuristic. Same design as bcinr-pddl's
//! `capability_router.rs`, reimplemented fresh here against this crate's own
//! `parse`/`ground` types — there is no dependency between the two repos.
//!
//! A capability is modeled as a durative action; the shared human/session
//! resource it competes for (`attention` — one working human, one active
//! train of thought) is a numeric fluent; two capabilities that would touch
//! the same file both require an exclusive `locked` predicate on that file.
//!
//! Fixed capability set for this slice:
//! - `claude-code-edit-file(?f)`: edits a repo file, locks it for the duration.
//! - `claude-chrome-fill-form(?f)`: fills a web form referencing a file, does not lock it.
//! - `claude-desktop-draft(?f)`: drafts a document referencing a file, locks it for the duration.

use std::cmp::Ordering;

use crate::ground::{find_temporal_plan, ground_domain, TemporalPlan};
use crate::parse::{domain_from_pddl, problem_from_pddl, PlannerError};
use crate::schedule::max_parallelism;
use blake3::Hasher;

/// The fixed capability domain for this slice. `attention` bounds how many
/// capabilities may be in flight at once (the human's own concurrency cap);
/// `locked(?f)` models exclusive access to a single file across capabilities
/// that both mutate/reference it.
///
/// Each precondition also guards on its own goal atom not already being
/// true (`(not (edited ?f))` etc.) — without this idempotency guard, the
/// greedy scheduler in `find_temporal_plan` can starve a later-indexed
/// capability forever by perpetually re-starting an earlier, already-
/// satisfied one the instant its resource frees up. bcinr-pddl's router
/// needed this fix after discovering the starvation live; it's included
/// here from the start rather than rediscovered.
const CAPABILITY_DOMAIN: &str = r#"
(define (domain capability-router)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:types file)
  (:predicates (locked ?f - file) (edited ?f - file) (form-filled ?f - file) (drafted ?f - file))
  (:functions (attention))
  (:durative-action claude-code-edit-file
    :parameters (?f - file)
    :duration (= ?duration 5)
    :condition (and (at start (not (locked ?f))) (at start (not (edited ?f))) (at start (>= (attention) 1)))
    :effect (and
      (at start (decrease (attention) 1)) (at start (locked ?f))
      (at end (increase (attention) 1)) (at end (not (locked ?f))) (at end (edited ?f))))
  (:durative-action claude-chrome-fill-form
    :parameters (?f - file)
    :duration (= ?duration 3)
    :condition (and (at start (not (form-filled ?f))) (at start (>= (attention) 1)))
    :effect (and
      (at start (decrease (attention) 1))
      (at end (increase (attention) 1)) (at end (form-filled ?f))))
  (:durative-action claude-desktop-draft
    :parameters (?f - file)
    :duration (= ?duration 4)
    :condition (and (at start (not (locked ?f))) (at start (not (drafted ?f))) (at start (>= (attention) 1)))
    :effect (and
      (at start (decrease (attention) 1)) (at start (locked ?f))
      (at end (increase (attention) 1)) (at end (not (locked ?f))) (at end (drafted ?f)))))
"#;

/// A goal atom this router can plan towards, e.g. `Edited("f1")`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DesiredEffect {
    Edited(String),
    FormFilled(String),
    Drafted(String),
}

impl DesiredEffect {
    fn goal_atom(&self) -> String {
        match self {
            DesiredEffect::Edited(f) => format!("(edited {f})"),
            DesiredEffect::FormFilled(f) => format!("(form-filled {f})"),
            DesiredEffect::Drafted(f) => format!("(drafted {f})"),
        }
    }

    fn file(&self) -> &str {
        match self {
            DesiredEffect::Edited(f) | DesiredEffect::FormFilled(f) | DesiredEffect::Drafted(f) => {
                f
            }
        }
    }
}

/// A routing request: which effects must be achieved, and how many
/// capabilities may run concurrently (the human's attention capacity).
#[derive(Debug, Clone)]
pub struct CapabilityTask {
    pub desired_effects: Vec<DesiredEffect>,
    pub attention_capacity: u32,
}

/// Deterministic lexicographic cost, cheapest-first ordering:
/// admitted → risk → attention → tokens → latency → switches.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CostVector {
    /// Whether a plan was found at all — non-admitted always loses.
    pub admitted: bool,
    /// Unreceipted mutation risk, 0 (none) .. 255 (highest) — this slice
    /// scores every fixed capability as 0 since none touches state outside
    /// its own witnessed plan.
    pub unreceipted_mutation_risk: u8,
    /// Wall-clock human attention consumed, in seconds (derived from makespan).
    pub human_attention_seconds: f64,
    /// Reserved for future LLM-token accounting; 0 for this slice.
    pub token_cost: u64,
    pub latency_ms: u64,
    /// Number of distinct capabilities in the plan — a proxy for context switches.
    pub context_switches: u8,
}

impl CostVector {
    fn from_plan(plan: &TemporalPlan) -> Self {
        let distinct_capabilities: std::collections::HashSet<&str> =
            plan.steps.iter().map(|s| s.action_name.as_str()).collect();
        CostVector {
            admitted: true,
            unreceipted_mutation_risk: 0,
            human_attention_seconds: plan.makespan,
            token_cost: 0,
            latency_ms: (plan.makespan * 1000.0) as u64,
            context_switches: distinct_capabilities.len() as u8,
        }
    }

    fn refused() -> Self {
        CostVector {
            admitted: false,
            unreceipted_mutation_risk: u8::MAX,
            human_attention_seconds: f64::INFINITY,
            token_cost: u64::MAX,
            latency_ms: u64::MAX,
            context_switches: u8::MAX,
        }
    }
}

impl Eq for CostVector {}

impl PartialOrd for CostVector {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for CostVector {
    fn cmp(&self, other: &Self) -> Ordering {
        // admitted (true wins) first — Rust bool Ord has false < true, so reverse.
        other
            .admitted
            .cmp(&self.admitted)
            .then_with(|| {
                self.unreceipted_mutation_risk
                    .cmp(&other.unreceipted_mutation_risk)
            })
            .then_with(|| {
                self.human_attention_seconds
                    .partial_cmp(&other.human_attention_seconds)
                    .unwrap_or(Ordering::Equal)
            })
            .then_with(|| self.token_cost.cmp(&other.token_cost))
            .then_with(|| self.latency_ms.cmp(&other.latency_ms))
            .then_with(|| self.context_switches.cmp(&other.context_switches))
    }
}

/// The router's output: the plan it found, its parallelism, its cost, and a
/// BLAKE3 chain binding all three together — same witnessing pattern as
/// `receipt::manufacture_world`, not a new format.
#[derive(Debug, Clone)]
pub struct CapabilityRouteReceipt {
    pub admitted: bool,
    pub refusal_reason: Option<String>,
    pub plan: TemporalPlan,
    pub max_parallelism: usize,
    pub cost: CostVector,
    pub route_chain: String,
}

fn build_problem_text(task: &CapabilityTask) -> String {
    let mut files: Vec<&str> = task.desired_effects.iter().map(|e| e.file()).collect();
    files.sort_unstable();
    files.dedup();

    let objects = files.join(" ");
    let goal_atoms: Vec<String> = task.desired_effects.iter().map(|e| e.goal_atom()).collect();

    format!(
        r#"
(define (problem capability-route)
  (:domain capability-router)
  (:objects {objects} - file)
  (:init (= (attention) {capacity}))
  (:goal (and {goal})))
"#,
        objects = objects,
        capacity = task.attention_capacity,
        goal = goal_atoms.join(" ")
    )
}

fn hex(b: &[u8; 32]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn route_chain_hash(problem_text: &str, plan: &TemporalPlan, cost: &CostVector) -> String {
    let mut h = Hasher::new();
    h.update(problem_text.as_bytes());
    for step in &plan.steps {
        h.update(step.action_name.as_bytes());
        h.update(&step.start_time.to_le_bytes());
        h.update(&step.duration.to_le_bytes());
    }
    h.update(&cost.human_attention_seconds.to_le_bytes());
    h.update(&cost.context_switches.to_le_bytes());
    hex(h.finalize().as_bytes())
}

fn refused_chain(problem_text: &str) -> String {
    let mut h = Hasher::new();
    h.update(problem_text.as_bytes());
    hex(h.finalize().as_bytes())
}

/// Route a [`CapabilityTask`] to a schedulable, cost-ordered plan over the
/// fixed capability set. Returns `Err` only for a malformed domain/problem
/// (should not happen given the fixed domain text); an infeasible task under
/// the given attention capacity is reported as a non-admitted receipt, not a
/// silent default route.
pub fn route_capability_plan(
    task: &CapabilityTask,
) -> Result<CapabilityRouteReceipt, PlannerError> {
    let domain = domain_from_pddl(CAPABILITY_DOMAIN)?;
    let problem_text = build_problem_text(task);
    let problem = problem_from_pddl(&problem_text)?;
    let ground_actions = ground_domain(&domain, &problem)
        .map_err(|e| PlannerError::Parse(format!("grounding failed: {e}")))?;

    let plan = match find_temporal_plan(&ground_actions, &problem) {
        Ok(plan) => plan,
        Err(e) => {
            return Ok(CapabilityRouteReceipt {
                admitted: false,
                refusal_reason: Some(format!(
                    "routing infeasible under attention capacity {}: {e}",
                    task.attention_capacity
                )),
                plan: TemporalPlan::default(),
                max_parallelism: 0,
                cost: CostVector::refused(),
                route_chain: refused_chain(&problem_text),
            });
        }
    };

    let parallelism = max_parallelism(&plan);
    let cost = CostVector::from_plan(&plan);
    let route_chain = route_chain_hash(&problem_text, &plan, &cost);

    Ok(CapabilityRouteReceipt {
        admitted: true,
        refusal_reason: None,
        plan,
        max_parallelism: parallelism,
        cost,
        route_chain,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disjoint_files_parallel_with_capacity_2() {
        let task = CapabilityTask {
            desired_effects: vec![
                DesiredEffect::Edited("f1".to_string()),
                DesiredEffect::FormFilled("f2".to_string()),
            ],
            attention_capacity: 2,
        };
        let receipt = route_capability_plan(&task).expect("routing should succeed");
        assert!(
            receipt.admitted,
            "refusal_reason={:?}",
            receipt.refusal_reason
        );
        assert_eq!(
            receipt.max_parallelism, 2,
            "disjoint-file capabilities under capacity 2 should run concurrently"
        );
    }

    /// Note: `find_temporal_plan` greedily starts every applicable durative
    /// action, not just goal-relevant ones — with attention capacity 2 it may
    /// also opportunistically schedule the unrequested `claude-chrome-fill-form`
    /// capability in the gap, so global max parallelism for the whole plan can
    /// legitimately be 2 even though the two *requested*, file-conflicting
    /// capabilities are correctly sequenced. This test asserts the specific
    /// guarantee the router makes (the conflicting pair never overlaps), not a
    /// global parallelism count the fixed capability set doesn't promise.
    #[test]
    fn same_file_conflict_sequenced() {
        let task = CapabilityTask {
            desired_effects: vec![
                DesiredEffect::Edited("f1".to_string()),
                DesiredEffect::Drafted("f1".to_string()),
            ],
            attention_capacity: 2,
        };
        let receipt = route_capability_plan(&task).expect("routing should succeed");
        assert!(
            receipt.admitted,
            "refusal_reason={:?}",
            receipt.refusal_reason
        );

        let interval = |name: &str| -> (f64, f64) {
            let s = receipt
                .plan
                .steps
                .iter()
                .find(|s| s.action_name == name)
                .unwrap_or_else(|| panic!("expected a {name} step in the plan"));
            (s.start_time, s.start_time + s.duration)
        };
        let edit = interval("claude-code-edit-file");
        let draft = interval("claude-desktop-draft");
        let overlaps = edit.0 < draft.1 && draft.0 < edit.1;
        assert!(
            !overlaps,
            "edit and draft on the same file must be sequenced: edit={edit:?} draft={draft:?}"
        );
    }

    #[test]
    fn zero_capacity_infeasible_refused() {
        let task = CapabilityTask {
            desired_effects: vec![DesiredEffect::Edited("f1".to_string())],
            attention_capacity: 0,
        };
        let receipt =
            route_capability_plan(&task).expect("route_capability_plan itself should not error");
        assert!(
            !receipt.admitted,
            "zero attention capacity must refuse, not silently default a route"
        );
        assert!(receipt.refusal_reason.is_some());
        assert_eq!(receipt.max_parallelism, 0);
        assert!(!receipt.cost.admitted);
    }

    #[test]
    fn deterministic_same_task_same_route() {
        let task = CapabilityTask {
            desired_effects: vec![
                DesiredEffect::Edited("f1".to_string()),
                DesiredEffect::FormFilled("f2".to_string()),
            ],
            attention_capacity: 2,
        };
        let r1 = route_capability_plan(&task).expect("first route");
        let r2 = route_capability_plan(&task).expect("second route");
        assert_eq!(
            r1.route_chain, r2.route_chain,
            "same task must produce identical route chain"
        );
    }

    #[test]
    fn cost_vector_orders_admitted_before_refused() {
        let admitted = CostVector {
            admitted: true,
            unreceipted_mutation_risk: 5,
            human_attention_seconds: 100.0,
            token_cost: 1000,
            latency_ms: 5000,
            context_switches: 3,
        };
        let refused = CostVector::refused();
        assert!(
            admitted < refused,
            "an admitted route must always sort before a refused one"
        );
    }
}
