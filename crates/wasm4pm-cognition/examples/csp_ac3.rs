//! CSP AC-3 — graph-coloring with 4 regions and inequality constraints.
//! Run: cargo run --example csp_ac3
//!
//! Models a simple map-coloring problem: regions A, B, C, D each assigned
//! one of {red, green, blue} such that adjacent regions differ in color.

use wasm4pm_cognition::breeds::csp_ac3::CspAc3;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "map-coloring".to_string(),
        candidates: vec![],
        facts: vec![
            // Variables: each region with domain {red, green, blue}
            Fact {
                key: "csp-var".to_string(),
                value: "A:red,green,blue".to_string(),
            },
            Fact {
                key: "csp-var".to_string(),
                value: "B:red,green,blue".to_string(),
            },
            Fact {
                key: "csp-var".to_string(),
                value: "C:red,green,blue".to_string(),
            },
            Fact {
                key: "csp-var".to_string(),
                value: "D:red,green,blue".to_string(),
            },
            // Constraints: adjacent regions must differ
            Fact {
                key: "csp-constraint".to_string(),
                value: "A!=B".to_string(),
            },
            Fact {
                key: "csp-constraint".to_string(),
                value: "A!=C".to_string(),
            },
            Fact {
                key: "csp-constraint".to_string(),
                value: "B!=C".to_string(),
            },
            Fact {
                key: "csp-constraint".to_string(),
                value: "B!=D".to_string(),
            },
            Fact {
                key: "csp-constraint".to_string(),
                value: "C!=D".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = CspAc3;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "csp_ac3 ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("csp_ac3 error: {e}");
            std::process::exit(1);
        }
    }
}
