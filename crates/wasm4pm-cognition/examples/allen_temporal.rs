//! Allen Temporal — classify the Allen interval relation between two events.
//! Demonstrates OVERLAPS: task A starts before task B but they share a window.
//! Run: cargo run --example allen_temporal

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::allen_temporal::AllenTemporal;

fn main() {
    // Scenario: code-review (A) starts at t=0, ends at t=10.
    //           merge-window (B) starts at t=7, ends at t=15.
    // Expected Allen relation: OVERLAPS (A overlaps B).
    let input = BreedInput {
        intent: "classify-interval-relation".to_string(),
        candidates: vec![],
        facts: vec![
            Fact { key: "interval:A:start".to_string(), value: "0".to_string() },
            Fact { key: "interval:A:end".to_string(),   value: "10".to_string() },
            Fact { key: "interval:B:start".to_string(), value: "7".to_string() },
            Fact { key: "interval:B:end".to_string(),   value: "15".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "relation".to_string(),
                value: "A,B".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = AllenTemporal;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "allen_temporal ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("allen_temporal error: {e}");
            std::process::exit(1);
        }
    }
}
