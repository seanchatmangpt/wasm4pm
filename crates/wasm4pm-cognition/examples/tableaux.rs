//! Tableaux — Smullyan signed analytic tableaux for propositional validity.
//! Demonstrates a realistic inference chain: ((p -> q) & (q -> r)) -> (p -> r)
//! (hypothetical syllogism), which is a classical tautology.
//! Run: cargo run --example tableaux

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::tableaux::Tableaux;

fn main() {
    // Prove hypothetical syllogism: ((p -> q) & (q -> r)) -> (p -> r)
    // The tableaux prover assumes the formula false and tries to find a
    // countermodel; if every branch closes, the formula is valid (a tautology).
    let input = BreedInput {
        intent: "prove-hypothetical-syllogism".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "formula:phi".to_string(),
                value: "((p -> q) & (q -> r)) -> (p -> r)".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "prove".to_string(),
                value: "((p -> q) & (q -> r)) -> (p -> r)".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = Tableaux;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "tableaux ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("tableaux error: {e}");
            std::process::exit(1);
        }
    }
}
