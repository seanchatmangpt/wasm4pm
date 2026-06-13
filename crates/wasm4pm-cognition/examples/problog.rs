//! ProbLog — exact possible-worlds probabilistic Horn logic.
//! Models a simple disease-diagnosis program:
//!   - 0.3::cold  (30% chance of having a cold)
//!   - 0.1::flu   (10% chance of having flu)
//!   - sick :- cold.
//!   - sick :- flu.
//! Query: P(sick) = 1 - (1-0.3)*(1-0.1) = 0.37
//!
//! Run: cargo run --example problog

use wasm4pm_cognition::breeds::problog::Problog;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "diagnose-sick".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "pfact:cold".to_string(),
                value: "0.3".to_string(),
            },
            Fact {
                key: "pfact:flu".to_string(),
                value: "0.1".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".to_string(),
                premise: vec!["cold".to_string()],
                conclusion: "sick".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["flu".to_string()],
                conclusion: "sick".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "q1".to_string(),
            predicate: "query".to_string(),
            value: "sick".to_string(),
        }],
        state: vec![],
    };

    let breed = Problog;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "problog ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("problog error: {e}");
            std::process::exit(1);
        }
    }
}
