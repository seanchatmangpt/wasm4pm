//! Partial-order planning (SNLP / causal-link) — Sussman anomaly.
//!
//! Three blocks A, B, C on a table.  Initial state: C is on A, B is on the
//! table.  Goal: A on B, B on C (the classic interleaved plan that defeats
//! linear goal-at-a-time planners).
//!
//! Run: cargo run --example partial_order_plan

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::partial_order_plan::PartialOrderPlan;

fn main() {
    let input = BreedInput {
        intent: "plan".to_string(),
        candidates: vec![],
        facts: vec![
            // Operator: move C from A to table
            Fact { key: "pop:op:put_c_from_a_on_table:pre".to_string(),  value: "clear_c,on_c_a".to_string() },
            Fact { key: "pop:op:put_c_from_a_on_table:add".to_string(),  value: "clear_a,ontable_c".to_string() },
            Fact { key: "pop:op:put_c_from_a_on_table:del".to_string(),  value: "on_c_a".to_string() },
            // Operator: stack A on B
            Fact { key: "pop:op:put_a_on_b:pre".to_string(), value: "clear_a,clear_b,ontable_a".to_string() },
            Fact { key: "pop:op:put_a_on_b:add".to_string(), value: "on_a_b".to_string() },
            Fact { key: "pop:op:put_a_on_b:del".to_string(), value: "clear_b,ontable_a".to_string() },
            // Operator: stack B on C
            Fact { key: "pop:op:put_b_on_c:pre".to_string(), value: "clear_b,clear_c,ontable_b".to_string() },
            Fact { key: "pop:op:put_b_on_c:add".to_string(), value: "on_b_c".to_string() },
            Fact { key: "pop:op:put_b_on_c:del".to_string(), value: "clear_c,ontable_b".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        // Goals: achieve A-on-B and B-on-C simultaneously
        goals: vec![
            Goal { id: "g0".to_string(), predicate: "on_a_b".to_string(), value: "true".to_string() },
            Goal { id: "g1".to_string(), predicate: "on_b_c".to_string(), value: "true".to_string() },
        ],
        // Initial world state: C is on A, B and A are on the table; C and B are clear
        state: vec![
            StateAtom { predicate: "on_c_a".to_string(),    value: "true".to_string() },
            StateAtom { predicate: "clear_c".to_string(),   value: "true".to_string() },
            StateAtom { predicate: "clear_b".to_string(),   value: "true".to_string() },
            StateAtom { predicate: "ontable_a".to_string(), value: "true".to_string() },
            StateAtom { predicate: "ontable_b".to_string(), value: "true".to_string() },
        ],
    };

    let breed = PartialOrderPlan;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "partial_order_plan ok — plan={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("partial_order_plan error: {e}");
            std::process::exit(1);
        }
    }
}
