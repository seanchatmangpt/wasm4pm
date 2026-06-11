//! chain_planning — 3-stage cognition chain: HTN decomposition → STRIPS grounding
//! → contingent execution.
//!
//! Each stage embeds the blake3 output_hash[:16] of the previous stage as fact
//! "prior_hash", creating an unforgeable hash chain across the pipeline.
//!
//! Stage 0 (HtnPlanning):   decompose "deploy_app" into sub-tasks via task network.
//! Stage 1 (Strips):        ground HTN tasks as STRIPS operators.
//! Stage 2 (ContingentPlan): build a contingent plan that handles possible failures.
//!
//! Run: cargo run --example chain_planning

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::htn_planning::HtnPlanning;
use wasm4pm_cognition::breeds::strips::Strips;
use wasm4pm_cognition::breeds::contingent_plan::ContingentPlan;

fn main() {
    // ── Stage 0: HTN Planning ─────────────────────────────────────────────────
    // Decompose the high-level task "deploy_app" into primitive operators.
    let stage0_input = BreedInput {
        intent: "deploy_app".to_string(),
        candidates: vec![
            Candidate { id: "canary-deploy".to_string(),    score: 0.90, eliminated: false, elimination_reason: None },
            Candidate { id: "blue-green-deploy".to_string(), score: 0.75, eliminated: false, elimination_reason: None },
        ],
        facts: vec![
            Fact { key: "app".to_string(),     value: "payment-service".to_string() },
            Fact { key: "env".to_string(),     value: "production".to_string() },
            Fact { key: "version".to_string(), value: "v2.4.1".to_string() },
        ],
        cases: vec![],
        rules: vec![
            // method:deploy_app:standard — no preconditions; decomposes into build, test, release
            Rule {
                id: "method:deploy_app:standard".to_string(),
                premise: vec![],
                conclusion: "build_image ; run_smoke_tests ; release_to_prod".to_string(),
                certainty: 1.0,
            },
            // method:build_image — compile and package
            Rule {
                id: "method:build_image:standard".to_string(),
                premise: vec![],
                conclusion: "op:compile ; op:package".to_string(),
                certainty: 1.0,
            },
            // method:run_smoke_tests — requires image built
            Rule {
                id: "method:run_smoke_tests:standard".to_string(),
                premise: vec!["image=built".to_string()],
                conclusion: "op:smoke_test".to_string(),
                certainty: 1.0,
            },
            // method:release_to_prod — requires tests passed
            Rule {
                id: "method:release_to_prod:standard".to_string(),
                premise: vec!["tests=passed".to_string()],
                conclusion: "op:deploy_canary ; op:promote_full".to_string(),
                certainty: 1.0,
            },
            // Primitive ops
            Rule {
                id: "op:compile".to_string(),
                premise: vec![],
                conclusion: "code=compiled".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "op:package".to_string(),
                premise: vec!["code=compiled".to_string()],
                conclusion: "image=built".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "op:smoke_test".to_string(),
                premise: vec!["image=built".to_string()],
                conclusion: "tests=passed".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "op:deploy_canary".to_string(),
                premise: vec!["tests=passed".to_string()],
                conclusion: "canary=live".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "op:promote_full".to_string(),
                premise: vec!["canary=live".to_string()],
                conclusion: "app=deployed ; !canary=live".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "task".to_string(),
                value: "deploy_app".to_string(),
            },
        ],
        state: vec![
            StateAtom { predicate: "code".to_string(),  value: "source".to_string() },
            StateAtom { predicate: "image".to_string(), value: "stale".to_string() },
        ],
    };

    let htn = HtnPlanning;
    let stage0_output = match run_breed(&htn, &stage0_input) {
        Ok(out) => out,
        Err(e) => {
            eprintln!("stage 0 [htn_planning] error: {e}");
            std::process::exit(1);
        }
    };

    let s0_json = serde_json::to_string(&stage0_output).expect("serialize stage 0 output");
    let s0_hash = blake3::hash(s0_json.as_bytes()).to_hex().to_string();
    println!("stage 0 [htn_planning]: ok hash={}", &s0_hash[..16]);

    // ── Stage 1: STRIPS grounding ─────────────────────────────────────────────
    // Ground the HTN primitive operators as STRIPS actions and solve the plan.
    // Prior hash from stage 0 is embedded as fact "prior_hash".
    let stage1_input = BreedInput {
        intent: "ground_and_solve_deploy".to_string(),
        candidates: vec![],
        facts: vec![
            // Chain link: hash of previous stage output
            Fact { key: "prior_hash".to_string(), value: s0_hash[..16].to_string() },
        ],
        cases: vec![],
        // STRIPS operators grounded from HTN primitives.
        // Forward IDFS: at each depth, all actions applicable in current state
        // are tried. The initial state already has image=built and tests=passed
        // (output of stage 0 HTN decomposition), so the planner needs only
        // op:deploy_canary then op:promote_full to reach app=deployed.
        rules: vec![
            Rule {
                id: "op:deploy_canary".to_string(),
                premise: vec!["image=built".to_string(), "tests=passed".to_string()],
                conclusion: "canary=live".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "op:promote_full".to_string(),
                premise: vec!["canary=live".to_string()],
                conclusion: "app=deployed".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![
            Goal {
                id: "g-deploy".to_string(),
                predicate: "app".to_string(),
                value: "deployed".to_string(),
            },
        ],
        // HTN stage produced image=built and tests=passed; deploy_canary fires
        // immediately (both preconditions satisfied), then promote_full fires.
        state: vec![
            StateAtom { predicate: "image".to_string(),  value: "built".to_string() },
            StateAtom { predicate: "tests".to_string(),  value: "passed".to_string() },
            StateAtom { predicate: "canary".to_string(), value: "live".to_string() },
        ],
    };

    let strips = Strips;
    let stage1_output = match run_breed(&strips, &stage1_input) {
        Ok(out) => out,
        Err(e) => {
            eprintln!("stage 1 [strips] error: {e}");
            std::process::exit(1);
        }
    };

    let s1_json = serde_json::to_string(&stage1_output).expect("serialize stage 1 output");
    let s1_hash = blake3::hash(s1_json.as_bytes()).to_hex().to_string();
    println!("stage 1 [strips]: ok hash={}", &s1_hash[..16]);

    // ── Stage 2: Contingent Plan ──────────────────────────────────────────────
    // Build a contingent plan that handles smoke-test failure uncertainty.
    // The deployment environment may or may not have a healthy canary slot.
    // Prior hash from stage 1 is embedded as fact "prior_hash".
    let stage2_input = BreedInput {
        intent: "contingent_deploy_with_rollback".to_string(),
        candidates: vec![],
        facts: vec![
            // Chain link: hash of previous stage output
            Fact { key: "prior_hash".to_string(), value: s1_hash[..16].to_string() },

            // Known initial state: image is built, tests passed
            Fact { key: "cp:init:image-ready".to_string(),  value: "true".to_string() },
            Fact { key: "cp:init:tests-passed".to_string(), value: "true".to_string() },
            // Unknown: whether the canary slot is healthy
            Fact { key: "cp:unknown".to_string(), value: "canary-healthy".to_string() },

            // Physical action: deploy to canary slot (no preconditions — always applicable)
            Fact { key: "cp:act:deploy-canary:pre".to_string(), value: "image-ready,tests-passed".to_string() },
            Fact { key: "cp:act:deploy-canary:add".to_string(), value: "canary-live".to_string() },
            Fact { key: "cp:act:deploy-canary:del".to_string(), value: "".to_string() },

            // Physical action: promote to full prod (requires healthy canary)
            // In the canary-healthy=true world this is applicable after deploy-canary
            Fact { key: "cp:act:promote-full:pre".to_string(), value: "canary-live,canary-healthy".to_string() },
            Fact { key: "cp:act:promote-full:add".to_string(), value: "deploy-complete".to_string() },
            Fact { key: "cp:act:promote-full:del".to_string(), value: "".to_string() },

            // Physical action: rollback (canary not healthy; deploy-canary must have run)
            // In the canary-healthy=false world, rollback is applicable after deploy-canary
            Fact { key: "cp:act:rollback:pre".to_string(), value: "canary-live".to_string() },
            Fact { key: "cp:act:rollback:add".to_string(), value: "deploy-complete".to_string() },
            Fact { key: "cp:act:rollback:del".to_string(), value: "".to_string() },

            // Sensing action: check whether canary slot is healthy (splits belief state)
            Fact { key: "cp:sense:check-canary".to_string(), value: "canary-healthy".to_string() },

            // Goal: deploy-complete=true must hold in every possible world
            Fact { key: "cp:goal:deploy-complete".to_string(), value: "true".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        // ContingentPlan reads goals from facts as cp:goal:<atom>=true/false
        goals: vec![],
        state: vec![],
    };

    let contingent = ContingentPlan;
    let stage2_output = match run_breed(&contingent, &stage2_input) {
        Ok(out) => out,
        Err(e) => {
            eprintln!("stage 2 [contingent_plan] error: {e}");
            std::process::exit(1);
        }
    };

    let s2_json = serde_json::to_string(&stage2_output).expect("serialize stage 2 output");
    let s2_hash = blake3::hash(s2_json.as_bytes()).to_hex().to_string();
    println!("stage 2 [contingent_plan]: ok hash={}", &s2_hash[..16]);

    println!();
    println!("chain complete — unforgeable: each stage hash is embedded in the next");
    println!("  s0→s1 link: {}", &s0_hash[..16]);
    println!("  s1→s2 link: {}", &s1_hash[..16]);
    println!("  final seal: {}", &s2_hash[..16]);

    // Print human-readable explanation from each stage
    println!();
    println!("stage 0 explanation: {}", stage0_output.explanation);
    println!("stage 1 explanation: {}", stage1_output.explanation);
    println!("stage 2 explanation: {}", stage2_output.explanation);
}
