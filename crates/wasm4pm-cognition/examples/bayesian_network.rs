//! Bayesian Network — variable elimination over a CPT-encoded DAG.
//! Demonstrates a simple "Rain → Sprinkler → WetGrass" diagnostic network.
//! Run: cargo run --example bayesian_network

use wasm4pm_cognition::breeds::bayesian_network::BayesianNetwork;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // Network topology: Rain -> WetGrass, Sprinkler -> WetGrass
    // We observe WetGrass=true and query P(Rain=true | WetGrass=true).
    let input = BreedInput {
        intent: "diagnose-rain".to_string(),
        candidates: vec![],
        facts: vec![
            // Priors
            Fact { key: "cpt:Rain".to_string(),       value: "0.2".to_string() },
            Fact { key: "cpt:Sprinkler".to_string(),  value: "0.4".to_string() },
            // Conditional: P(WetGrass=true | Rain, Sprinkler) encoded as
            // "p(true|rain=true,sprinkler=true), p(true|rain=true,sprinkler=false),
            //  p(true|rain=false,sprinkler=true), p(true|rain=false,sprinkler=false)"
            Fact {
                key:   "cpt:WetGrass|Rain,Sprinkler".to_string(),
                value: "0.99,0.9,0.8,0.0".to_string(),
            },
            // Evidence
            Fact { key: "evidence:WetGrass".to_string(), value: "true".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id:        "query-rain".to_string(),
                predicate: "query".to_string(),
                value:     "prob:Rain".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = BayesianNetwork;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "bayesian_network ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("bayesian_network error: {e}");
            std::process::exit(1);
        }
    }
}
