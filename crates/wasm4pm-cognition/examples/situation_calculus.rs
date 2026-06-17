//! Situation Calculus — Reiter successor-state axioms (Reiter 1991).
//!
//! Demonstrates a robot-arm pick-and-place scenario:
//!   S0: arm is empty, block A is on the table, block B is on the table.
//!   Actions: pick(A), stack(A,B), inspect
//!
//! Run: cargo run --example situation_calculus

use wasm4pm_cognition::breeds::situation_calculus::SituationCalculus;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "robot-arm-progression".to_string(),
        candidates: vec![],
        facts: vec![
            // Initial situation S0
            Fact {
                key: "fluent:arm_empty".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "fluent:block_A_on_table".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "fluent:block_B_on_table".to_string(),
                value: "true".to_string(),
            },
            // Action: pick_A
            //   pre: arm must be empty AND block A must be on the table
            Fact {
                key: "action:pick_A:pre".to_string(),
                value: "arm_empty".to_string(),
            },
            Fact {
                key: "action:pick_A:pre".to_string(),
                value: "block_A_on_table".to_string(),
            },
            Fact {
                key: "action:pick_A:add".to_string(),
                value: "holding_A".to_string(),
            },
            Fact {
                key: "action:pick_A:del".to_string(),
                value: "arm_empty".to_string(),
            },
            Fact {
                key: "action:pick_A:del".to_string(),
                value: "block_A_on_table".to_string(),
            },
            // Action: stack_A_on_B
            //   pre: must be holding A AND block B must be on the table
            Fact {
                key: "action:stack_A_on_B:pre".to_string(),
                value: "holding_A".to_string(),
            },
            Fact {
                key: "action:stack_A_on_B:pre".to_string(),
                value: "block_B_on_table".to_string(),
            },
            Fact {
                key: "action:stack_A_on_B:add".to_string(),
                value: "arm_empty".to_string(),
            },
            Fact {
                key: "action:stack_A_on_B:add".to_string(),
                value: "A_on_B".to_string(),
            },
            Fact {
                key: "action:stack_A_on_B:del".to_string(),
                value: "holding_A".to_string(),
            },
            // Action: inspect
            //   pre: arm must be empty (idle state check)
            Fact {
                key: "action:inspect:pre".to_string(),
                value: "arm_empty".to_string(),
            },
            Fact {
                key: "action:inspect:add".to_string(),
                value: "inspected".to_string(),
            },
            // do: sequence — three steps
            Fact {
                key: "do:0".to_string(),
                value: "pick_A".to_string(),
            },
            Fact {
                key: "do:1".to_string(),
                value: "stack_A_on_B".to_string(),
            },
            Fact {
                key: "do:2".to_string(),
                value: "inspect".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "goal_stack".to_string(),
            predicate: "holds".to_string(),
            value: "A_on_B".to_string(),
        }],
        state: vec![StateAtom {
            predicate: "domain".to_string(),
            value: "blocks-world".to_string(),
        }],
    };

    let breed = SituationCalculus;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "situation_calculus ok — final_situation={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            println!("  fluents holding in final situation:");
            for f in &output.facts {
                println!("    {}", f.key);
            }
        }
        Err(e) => {
            eprintln!("situation_calculus error: {e}");
            std::process::exit(1);
        }
    }
}
