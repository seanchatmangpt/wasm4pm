//! wasm4pm-planner MCP server — the first MCP server in the wasm4pm repo.
//! Three tools proving the loop end to end (manufacture_world, analyze_schedule,
//! route_capability_plan), not a full tool surface on day one; see the plan
//! for the deferred rest.

use rmcp::{
    handler::server::wrapper::Parameters, schemars, tool, tool_router, transport::stdio, ServiceExt,
};
use serde::Deserialize;
use wasm4pm_planner::{CapabilityTask, DesiredEffect};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PlanInput {
    /// PDDL domain text (durative actions with numeric fluents)
    pub domain_text: String,
    /// PDDL problem text
    pub problem_text: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RouteCapabilityInput {
    /// Desired effects, each formatted "kind:file" where kind is one of
    /// edited, form-filled, drafted (e.g. "edited:f1", "form-filled:f2").
    pub desired_effects: Vec<String>,
    /// How many capabilities may run concurrently (the human's attention capacity).
    pub attention_capacity: u64,
}

fn parse_desired_effect(spec: &str) -> Result<DesiredEffect, String> {
    let (kind, file) = spec
        .split_once(':')
        .ok_or_else(|| format!("malformed desired_effect {spec:?}: expected \"kind:file\""))?;
    if file.is_empty() {
        return Err(format!("malformed desired_effect {spec:?}: empty file"));
    }
    match kind {
        "edited" => Ok(DesiredEffect::Edited(file.to_string())),
        "form-filled" => Ok(DesiredEffect::FormFilled(file.to_string())),
        "drafted" => Ok(DesiredEffect::Drafted(file.to_string())),
        other => Err(format!(
            "unknown desired_effect kind {other:?} in {spec:?}: expected one of edited, form-filled, drafted"
        )),
    }
}

#[derive(Clone, Default)]
pub struct Wasm4pmPlannerServer;

#[tool_router(server_handler)]
impl Wasm4pmPlannerServer {
    #[tool(
        description = "PDDL-subset (durative actions + numeric fluents) temporal planner with prolog8 admission gating. Returns JSON with admitted, refusal_reason, plan_steps, makespan, max_parallelism, manufacture_chain (BLAKE3)."
    )]
    async fn manufacture_world(&self, Parameters(input): Parameters<PlanInput>) -> String {
        let receipt = wasm4pm_planner::manufacture_world(&input.domain_text, &input.problem_text);
        serde_json::to_string(&receipt).unwrap_or_else(|e| {
            serde_json::json!({ "ok": false, "error": format!("serialization failed: {e}") })
                .to_string()
        })
    }

    #[tool(
        description = "Ground and plan a PDDL-subset temporal domain/problem, returning only the schedule-analysis view: makespan, max_parallelism, step_count."
    )]
    async fn analyze_schedule(&self, Parameters(input): Parameters<PlanInput>) -> String {
        let domain = match wasm4pm_planner::domain_from_pddl(&input.domain_text) {
            Ok(d) => d,
            Err(e) => {
                return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string()
            }
        };
        let problem = match wasm4pm_planner::problem_from_pddl(&input.problem_text) {
            Ok(p) => p,
            Err(e) => {
                return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string()
            }
        };
        let ground_actions = match wasm4pm_planner::ground_domain(&domain, &problem) {
            Ok(g) => g,
            Err(e) => {
                return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string()
            }
        };
        let plan = match wasm4pm_planner::find_temporal_plan(&ground_actions, &problem) {
            Ok(p) => p,
            Err(e) => {
                return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string()
            }
        };
        serde_json::json!({
            "ok": true,
            "makespan": plan.makespan,
            "max_parallelism": wasm4pm_planner::max_parallelism(&plan),
            "step_count": plan.steps.len(),
        })
        .to_string()
    }

    #[tool(
        description = "Route a capability task (desired effects over files, plus attention capacity) to a cost-ordered, schedulable plan across the fixed capability set (claude-code-edit-file, claude-chrome-fill-form, claude-desktop-draft). Returns JSON with admitted, refusal_reason, plan steps, cost fields, and route_chain (BLAKE3)."
    )]
    async fn route_capability_plan(
        &self,
        Parameters(input): Parameters<RouteCapabilityInput>,
    ) -> String {
        let mut desired_effects = Vec::with_capacity(input.desired_effects.len());
        for spec in &input.desired_effects {
            match parse_desired_effect(spec) {
                Ok(effect) => desired_effects.push(effect),
                Err(e) => return serde_json::json!({ "ok": false, "error": e }).to_string(),
            }
        }

        let task = CapabilityTask {
            desired_effects,
            attention_capacity: input.attention_capacity as u32,
        };

        let receipt = match wasm4pm_planner::route_capability_plan(&task) {
            Ok(r) => r,
            Err(e) => {
                return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string()
            }
        };

        let plan_steps: Vec<_> = receipt
            .plan
            .steps
            .iter()
            .map(|s| {
                serde_json::json!({
                    "action_name": s.action_name,
                    "args": s.args,
                    "start_time": s.start_time,
                    "duration": s.duration,
                })
            })
            .collect();

        serde_json::json!({
            "ok": true,
            "admitted": receipt.admitted,
            "refusal_reason": receipt.refusal_reason,
            "plan_steps": plan_steps,
            "makespan": receipt.plan.makespan,
            "max_parallelism": receipt.max_parallelism,
            "cost": {
                "admitted": receipt.cost.admitted,
                "unreceipted_mutation_risk": receipt.cost.unreceipted_mutation_risk,
                "human_attention_seconds": receipt.cost.human_attention_seconds,
                "token_cost": receipt.cost.token_cost,
                "latency_ms": receipt.cost.latency_ms,
                "context_switches": receipt.cost.context_switches,
            },
            "route_chain": receipt.route_chain,
        })
        .to_string()
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("wasm4pm-planner-mcp starting — 3 tools ready (manufacture_world, analyze_schedule, route_capability_plan)");

    let server = Wasm4pmPlannerServer::default();
    let running = match server.serve(stdio()).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("MCP server init error: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = running.waiting().await {
        eprintln!("MCP server error: {e}");
        std::process::exit(1);
    }
}
