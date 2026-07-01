//! wasm4pm-planner: a wasm4pm-native PDDL-subset temporal planner with
//! prolog8 admission gating — a fresh design drawing lessons from
//! bcinr-pddl's durative-action scheduler and capability-router pattern,
//! not a port of its code. bcinr stays algorithm-only; this crate is the
//! wasm4pm-side orchestration layer.

pub mod admission;
pub mod capability_router;
pub mod ground;
pub mod parse;
pub mod receipt;
pub mod schedule;
pub mod sexpr;

pub use capability_router::{
    route_capability_plan, CapabilityRouteReceipt, CapabilityTask, CostVector, DesiredEffect,
};
pub use ground::{
    find_temporal_plan, ground_domain, GroundAction, PlanError, PlanStep, TemporalPlan,
};
pub use parse::{domain_from_pddl, problem_from_pddl, Domain, PlannerError, Problem};
pub use receipt::{manufacture_world, ManufactureReceipt, PlanStepView};
pub use schedule::max_parallelism;
