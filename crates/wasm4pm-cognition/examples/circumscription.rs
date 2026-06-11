//! Circumscription — McCarthy minimal-model nonmonotonic reasoning.
//!
//! Scenario: birds normally fly, but penguins are abnormal birds.
//! Tweety is a bird. Opus is a penguin (hence also a bird).
//! Circumscription minimises the abnormality set, so Tweety flies (cautiously
//! entailed) while Opus does not (blocked by the penguin rule that forces ab_opus).
//!
//! Run: cargo run --example circumscription

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::circumscription::Circumscription;

fn main() {
    let input = BreedInput {
        intent: "who-flies".to_string(),
        candidates: vec![],
        facts: vec![
            // Tweety is a bird, Opus is a penguin (and therefore a bird).
            Fact { key: "bird_tweety".to_string(), value: "true".to_string() },
            Fact { key: "penguin_opus".to_string(), value: "true".to_string() },
            Fact { key: "bird_opus".to_string(), value: "true".to_string() },
        ],
        cases: vec![],
        rules: vec![
            // Penguins are always abnormal (no negation — forced).
            Rule {
                id: "penguin-ab".to_string(),
                premise: vec!["penguin_opus".to_string()],
                conclusion: "ab_opus".to_string(),
                certainty: 1.0,
            },
            // A bird flies unless abnormal.
            Rule {
                id: "tweety-flies".to_string(),
                premise: vec!["bird_tweety".to_string(), "not_ab_tweety".to_string()],
                conclusion: "flies_tweety".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "opus-flies".to_string(),
                premise: vec!["bird_opus".to_string(), "not_ab_opus".to_string()],
                conclusion: "flies_opus".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![
            Goal { id: "g1".to_string(), predicate: "entail".to_string(), value: "flies_tweety".to_string() },
            Goal { id: "g2".to_string(), predicate: "entail".to_string(), value: "flies_opus".to_string() },
        ],
        state: vec![],
    };

    let breed = Circumscription;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("circumscription ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
            for f in &output.facts {
                println!("  {} = {}", f.key, f.value);
            }
        }
        Err(e) => {
            eprintln!("circumscription error: {e}");
            std::process::exit(1);
        }
    }
}
