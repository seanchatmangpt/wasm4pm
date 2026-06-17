//! Description Logic — concept hierarchy + instance classification via ALC subsumption.
//! Demonstrates: Animal → Mammal → Dog hierarchy, instance classification query.
//! Run: cargo run --example description_logic

use wasm4pm_cognition::breeds::description_logic::DescriptionLogic;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // ALC knowledge base: concept hierarchy + instance assertions
    // concept:X = "Y"  means X is a subclass of Y (TBox)
    // instance:X = "Y" means individual X is an instance of concept Y (ABox)
    let input = BreedInput {
        intent: "classify-organism".to_string(),
        candidates: vec![],
        facts: vec![
            // TBox — concept hierarchy
            Fact {
                key: "concept:Thing".to_string(),
                value: "Thing".to_string(),
            },
            Fact {
                key: "concept:Animal".to_string(),
                value: "Thing".to_string(),
            },
            Fact {
                key: "concept:Mammal".to_string(),
                value: "Animal".to_string(),
            },
            Fact {
                key: "concept:Dog".to_string(),
                value: "Mammal".to_string(),
            },
            Fact {
                key: "concept:Cat".to_string(),
                value: "Mammal".to_string(),
            },
            Fact {
                key: "concept:Reptile".to_string(),
                value: "Animal".to_string(),
            },
            // ABox — individual assertions
            Fact {
                key: "instance:Rex".to_string(),
                value: "Dog".to_string(),
            },
            Fact {
                key: "instance:Whiskers".to_string(),
                value: "Cat".to_string(),
            },
            Fact {
                key: "instance:Sly".to_string(),
                value: "Reptile".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            // Ask: classify Rex — expect Dog ⊆ Mammal ⊆ Animal ⊆ Thing
            Goal {
                id: "g1".to_string(),
                predicate: "classify".to_string(),
                value: "Rex".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = DescriptionLogic;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "description_logic ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("description_logic error: {e}");
            std::process::exit(1);
        }
    }
}
