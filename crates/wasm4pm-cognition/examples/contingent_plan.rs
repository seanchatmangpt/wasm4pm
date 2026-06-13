//! ContingentPlan — AND-OR search over belief states with sensing actions.
//! Models a robot that must clean two rooms (L and R) but doesn't know the
//! initial dirt state of the right room. A sensing action checks right-dirty
//! before choosing to suck or move.
//!
//! Run: cargo run --example contingent_plan

use wasm4pm_cognition::breeds::contingent_plan::ContingentPlan;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "clean-both-rooms".to_string(),
        candidates: vec![],
        facts: vec![
            // Known initial state: robot is at-left, left room is dirty
            Fact {
                key: "cp:init:at-left".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "cp:init:left-dirty".to_string(),
                value: "true".to_string(),
            },
            // Unknown: whether the right room starts dirty
            Fact {
                key: "cp:unknown".to_string(),
                value: "right-dirty".to_string(),
            },
            // Physical action: suck (cleans whichever room the robot is in)
            Fact {
                key: "cp:act:suck-left:pre".to_string(),
                value: "at-left,left-dirty".to_string(),
            },
            Fact {
                key: "cp:act:suck-left:add".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "cp:act:suck-left:del".to_string(),
                value: "left-dirty".to_string(),
            },
            Fact {
                key: "cp:act:suck-right:pre".to_string(),
                value: "at-right,right-dirty".to_string(),
            },
            Fact {
                key: "cp:act:suck-right:add".to_string(),
                value: "".to_string(),
            },
            Fact {
                key: "cp:act:suck-right:del".to_string(),
                value: "right-dirty".to_string(),
            },
            // Physical action: move-right
            Fact {
                key: "cp:act:move-right:pre".to_string(),
                value: "at-left".to_string(),
            },
            Fact {
                key: "cp:act:move-right:add".to_string(),
                value: "at-right".to_string(),
            },
            Fact {
                key: "cp:act:move-right:del".to_string(),
                value: "at-left".to_string(),
            },
            // Sensing action: check whether right room is dirty
            Fact {
                key: "cp:sense:check-right".to_string(),
                value: "right-dirty".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            // Goal: neither room is dirty
            Goal {
                id: "g-left".to_string(),
                predicate: "cp:goal:left-dirty".to_string(),
                value: "false".to_string(),
            },
            Goal {
                id: "g-right".to_string(),
                predicate: "cp:goal:right-dirty".to_string(),
                value: "false".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = ContingentPlan;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "contingent_plan ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("contingent_plan error: {e}");
            std::process::exit(1);
        }
    }
}
