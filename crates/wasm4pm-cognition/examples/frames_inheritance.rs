//! frames_inheritance — Minsky 1974 frame-based slot resolution via isa-chain.
//!
//! Scenario: a zoological knowledge base where Animal is the root frame,
//! Bird inherits from Animal, Penguin inherits from Bird.  We resolve the
//! `locomotion` slot for Penguin — which overrides Bird's default ("fly")
//! with its own value ("swim").
//!
//! Run: cargo run --example frames_inheritance

use wasm4pm_cognition::breeds::frames_inheritance::FramesInheritance;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // intent = "resolve <frame> <slot>"
    let input = BreedInput {
        intent: "resolve Penguin locomotion".to_string(),
        candidates: vec![],
        facts: vec![
            // isa chain: Penguin -> Bird -> Animal
            Fact {
                key: "frame:Penguin:isa".to_string(),
                value: "Bird".to_string(),
            },
            Fact {
                key: "frame:Bird:isa".to_string(),
                value: "Animal".to_string(),
            },
            // Animal default slots
            Fact {
                key: "frame:Animal:slot:locomotion:default".to_string(),
                value: "walk".to_string(),
            },
            Fact {
                key: "frame:Animal:slot:warm_blooded:default".to_string(),
                value: "true".to_string(),
            },
            // Bird overrides locomotion default; adds own slot
            Fact {
                key: "frame:Bird:slot:locomotion:default".to_string(),
                value: "fly".to_string(),
            },
            Fact {
                key: "frame:Bird:slot:has_wings".to_string(),
                value: "true".to_string(),
            },
            // Penguin own-slot overrides Bird's default — penguins swim, not fly
            Fact {
                key: "frame:Penguin:slot:locomotion".to_string(),
                value: "swim".to_string(),
            },
            Fact {
                key: "frame:Penguin:slot:can_fly".to_string(),
                value: "false".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = FramesInheritance;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "frames_inheritance ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            println!("  trace steps: {}", output.inference_trace.len());
        }
        Err(e) => {
            eprintln!("frames_inheritance error: {e}");
            std::process::exit(1);
        }
    }
}
