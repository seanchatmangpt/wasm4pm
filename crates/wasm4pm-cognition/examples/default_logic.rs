//! Default Logic — Reiter 1980 normal defaults with justification blocking.
//!
//! Scenario: bird classification defaults.
//!   - By default, birds fly (unless they are penguins).
//!   - By default, penguins are birds.
//!   - Tweety is a penguin, so the "birds fly" default is blocked.
//!   - Opus is a generic bird, so the "birds fly" default fires.
//!
//! Run: cargo run --example default_logic

use wasm4pm_cognition::breeds::default_logic::DefaultLogic;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "classify-flying-ability".to_string(),
        candidates: vec![],
        facts: vec![
            // Known facts: Tweety is a penguin; Opus is a bird
            Fact {
                key: "fact".to_string(),
                value: "penguin".to_string(),
            },
            Fact {
                key: "fact".to_string(),
                value: "Tweety".to_string(),
            },
            Fact {
                key: "fact".to_string(),
                value: "bird".to_string(),
            },
            Fact {
                key: "fact".to_string(),
                value: "Opus".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![
            // More specific: penguins are birds (no justification needed)
            Rule {
                id: "penguin-is-bird".to_string(),
                premise: vec!["penguin".to_string(), "Tweety".to_string()],
                conclusion: "Tweety-is-bird".to_string(),
                certainty: 1.0,
            },
            // Default: birds fly — unless the subject is a penguin
            Rule {
                id: "birds-fly-tweety".to_string(),
                premise: vec!["Tweety-is-bird".to_string(), "unless:penguin".to_string()],
                conclusion: "Tweety-flies".to_string(),
                certainty: 0.9,
            },
            // Default: Opus (a plain bird) flies — no blocking justification
            Rule {
                id: "birds-fly-opus".to_string(),
                premise: vec!["bird".to_string(), "Opus".to_string()],
                conclusion: "Opus-flies".to_string(),
                certainty: 0.9,
            },
        ],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "infer".to_string(),
            value: "Opus-flies".to_string(),
        }],
        state: vec![],
    };

    let breed = DefaultLogic;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "default_logic ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("default_logic error: {e}");
            std::process::exit(1);
        }
    }
}
