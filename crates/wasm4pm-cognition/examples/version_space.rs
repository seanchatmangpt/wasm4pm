//! VersionSpace — Mitchell candidate-elimination (Artificial Intelligence 18(2), 1982).
//!
//! Demonstrates concept learning for the classic EnjoySport domain.
//! After 4 training examples the S boundary converges to <Sunny,Warm,?,Strong,?,?>
//! and the G boundary contains 2 maximally-general hypotheses.
//!
//! Run: cargo run --example version_space

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::version_space::VersionSpace;

fn main() {
    // Mitchell's EnjoySport: 6 attributes, 4 labelled examples.
    // After elimination: S = <Sunny,Warm,?,Strong,?,?>, |G| = 2.
    let input = BreedInput {
        intent: "learn-enjoysport-concept".to_string(),
        candidates: vec![],
        facts: vec![
            Fact { key: "vs:attrs".to_string(),     value: "sky,airtemp,humidity,wind,water,forecast".to_string() },
            // Positive examples
            Fact { key: "vs:example:1".to_string(), value: "Sunny,Warm,Normal,Strong,Warm,Same:+".to_string() },
            Fact { key: "vs:example:2".to_string(), value: "Sunny,Warm,High,Strong,Warm,Same:+".to_string() },
            // Negative example — forces G specialisation
            Fact { key: "vs:example:3".to_string(), value: "Rainy,Cold,High,Strong,Warm,Change:-".to_string() },
            // Another positive example — finalises S
            Fact { key: "vs:example:4".to_string(), value: "Sunny,Warm,High,Strong,Cool,Change:+".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = VersionSpace;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            let s = output
                .facts
                .iter()
                .find(|f| f.key == "vs:s")
                .map(|f| f.value.as_str())
                .unwrap_or("<unknown>");

            let g_boundaries: Vec<&str> = output
                .facts
                .iter()
                .filter(|f| f.key.starts_with("vs:g:"))
                .map(|f| f.value.as_str())
                .collect();

            let converged = output
                .facts
                .iter()
                .any(|f| f.key == "vs:converged" && f.value == "true");

            println!("version_space ok — hash={}", &output_hash[..16]);
            println!("  S boundary : <{}>", s);
            for (i, h) in g_boundaries.iter().enumerate() {
                println!("  G[{}]       : <{}>", i, h);
            }
            println!("  converged  : {}", converged);
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("version_space error: {e}");
            std::process::exit(1);
        }
    }
}
