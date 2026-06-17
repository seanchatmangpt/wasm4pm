//! MetaReasoning — cross-breed conflict detection and confidence-weighted
//! resolution (Cox & Raja 2011, "Metareasoning: Thinking about Thinking").
//!
//! Scenario: three object-level reasoners (mycin, prolog, bayesian_network)
//! each emit a therapy recommendation for a patient with suspected sepsis.
//! mycin and prolog disagree (gentamicin vs vancomycin); bayesian_network
//! agrees with mycin but with lower confidence.  Meta-reasoning detects the
//! conflict and resolves by confidence-weighted vote.
//!
//! Run: cargo run --example meta_reasoning

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::meta_reasoning::MetaReasoning;

fn main() {
    let input = BreedInput {
        intent: "arbitrate-therapy".to_string(),
        candidates: vec![],
        facts: vec![
            // mycin: high-confidence recommendation
            Fact { key: "breed:mycin:conclusion".to_string(),          value: "therapy=gentamicin".to_string() },
            Fact { key: "breed:mycin:confidence".to_string(),          value: "0.85".to_string() },
            // prolog: moderate-confidence contradicting recommendation
            Fact { key: "breed:prolog:conclusion".to_string(),         value: "therapy=vancomycin".to_string() },
            Fact { key: "breed:prolog:confidence".to_string(),         value: "0.60".to_string() },
            // bayesian_network: lower-confidence, agrees with mycin
            Fact { key: "breed:bayesian_network:conclusion".to_string(), value: "therapy=gentamicin".to_string() },
            Fact { key: "breed:bayesian_network:confidence".to_string(), value: "0.70".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = MetaReasoning;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("meta_reasoning ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
            for f in output.facts.iter().filter(|f| f.key.starts_with("meta:")) {
                println!("  {} = {}", f.key, f.value);
            }
        }
        Err(e) => {
            eprintln!("meta_reasoning error: {e}");
            std::process::exit(1);
        }
    }
}
