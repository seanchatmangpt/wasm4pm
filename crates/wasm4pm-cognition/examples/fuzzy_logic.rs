//! FuzzyLogic — Mamdani fuzzy inference: fuzzify inputs, apply rules, defuzzify output.
//! Scenario: HVAC fan speed control based on room temperature.
//! Run: cargo run --example fuzzy_logic

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::fuzzy_logic::FuzzyLogic;

fn main() {
    let input = BreedInput {
        intent: "hvac-fan-control".to_string(),
        candidates: vec![],
        facts: vec![
            // Membership functions for temperature linguistic variable
            Fact { key: "fuzzy:temp:cold".to_string(),     value: "tri:0,10,20".to_string() },
            Fact { key: "fuzzy:temp:comfortable".to_string(), value: "tri:15,22,28".to_string() },
            Fact { key: "fuzzy:temp:hot".to_string(),      value: "tri:24,35,45".to_string() },
            // Membership functions for fan speed output variable
            Fact { key: "fuzzy:speed:off".to_string(),    value: "tri:0,0,25".to_string() },
            Fact { key: "fuzzy:speed:low".to_string(),    value: "tri:10,30,50".to_string() },
            Fact { key: "fuzzy:speed:high".to_string(),   value: "tri:40,75,100".to_string() },
            // Crisp input: room temperature sensor reads 30 °C
            Fact { key: "fuzzy:input:temp".to_string(),   value: "30".to_string() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".to_string(),
                premise: vec!["fuzzy:temp:cold".to_string()],
                conclusion: "fuzzy:speed:off".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["fuzzy:temp:comfortable".to_string()],
                conclusion: "fuzzy:speed:low".to_string(),
                certainty: 0.8,
            },
            Rule {
                id: "r3".to_string(),
                premise: vec!["fuzzy:temp:hot".to_string()],
                conclusion: "fuzzy:speed:high".to_string(),
                certainty: 0.95,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "defuzzify".to_string(),
                value: "speed".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = FuzzyLogic;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("fuzzy_logic ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("fuzzy_logic error: {e}");
            std::process::exit(1);
        }
    }
}
