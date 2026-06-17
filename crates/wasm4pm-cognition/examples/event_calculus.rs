//! Event Calculus — discrete narrative: door lock/unlock lifecycle.
//!
//! Narrative:
//!   - door starts unlocked (initially)
//!   - lock action at t=2 initiates locked, terminates unlocked
//!   - unlock action at t=5 initiates unlocked, terminates locked
//!
//! Queries: is `locked` held at t=3? is `unlocked` held at t=6?
//!
//! Run: cargo run --example event_calculus

use wasm4pm_cognition::breeds::event_calculus::EventCalculus;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "door-lock-lifecycle".to_string(),
        candidates: vec![],
        facts: vec![
            // Initially unlocked
            Fact {
                key: "ec:initially".to_string(),
                value: "unlocked".to_string(),
            },
            // Events
            Fact {
                key: "ec:happens:2".to_string(),
                value: "lock".to_string(),
            },
            Fact {
                key: "ec:happens:5".to_string(),
                value: "unlock".to_string(),
            },
            // Causal laws
            Fact {
                key: "ec:initiates:lock".to_string(),
                value: "locked".to_string(),
            },
            Fact {
                key: "ec:terminates:lock".to_string(),
                value: "unlocked".to_string(),
            },
            Fact {
                key: "ec:initiates:unlock".to_string(),
                value: "unlocked".to_string(),
            },
            Fact {
                key: "ec:terminates:unlock".to_string(),
                value: "locked".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            // locked should hold at t=3 (after lock at t=2)
            Goal {
                id: "q1".to_string(),
                predicate: "ec:holdsat".to_string(),
                value: "locked@3".to_string(),
            },
            // unlocked should hold at t=6 (after unlock at t=5)
            Goal {
                id: "q2".to_string(),
                predicate: "ec:holdsat".to_string(),
                value: "unlocked@6".to_string(),
            },
            // unlocked should NOT hold at t=3 (clipped by lock)
            Goal {
                id: "q3".to_string(),
                predicate: "ec:holdsat".to_string(),
                value: "unlocked@3".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = EventCalculus;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "event_calculus ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("event_calculus error: {e}");
            std::process::exit(1);
        }
    }
}
