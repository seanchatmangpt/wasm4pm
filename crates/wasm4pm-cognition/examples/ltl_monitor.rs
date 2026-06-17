//! LTL Monitor — runtime verification of Linear Temporal Logic properties over event traces.
//! Monitors a resource acquisition/release protocol: G(acquire -> F release).
//! Run: cargo run --example ltl_monitor

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::ltl_monitor::LtlMonitor;

fn main() {
    let input = BreedInput {
        intent: "verify-resource-protocol".to_string(),
        candidates: vec![],
        facts: vec![
            // Event trace: acquire → critical section → release
            Fact { key: "event:0".to_string(), value: "acquire".to_string() },
            Fact { key: "event:1".to_string(), value: "critical".to_string() },
            Fact { key: "event:2".to_string(), value: "release".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "monitor".to_string(),
                // Every acquire must be eventually followed by a release
                value: "G(acquire -> F release)".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = LtlMonitor;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("ltl_monitor ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("ltl_monitor error: {e}");
            std::process::exit(1);
        }
    }
}
