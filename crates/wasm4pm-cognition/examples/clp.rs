//! CLP(FD) — Constraint Logic Programming over finite integer domains.
//!
//! Demonstrates a small task-scheduling problem: four tasks (A, B, C, D) must
//! each be assigned to a time slot in 1..4 (one slot per hour).  Business rules:
//!   - A must finish before B  (A < B)
//!   - C must finish before D  (C < D)
//!   - A and C cannot overlap  (A != C)
//!   - all four tasks are in distinct slots  (alldiff)
//!
//! AC-3 propagation fires first; first-fail labeling handles any remaining choices.
//! Run: cargo run --example clp

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::clp::Clp;

fn main() {
    let input = BreedInput {
        intent: "schedule four tasks into four time slots".to_string(),
        candidates: vec![],
        facts: vec![
            // Variable domains: each task can occupy slot 1, 2, 3, or 4.
            Fact { key: "clp:var:A".to_string(), value: "1..4".to_string() },
            Fact { key: "clp:var:B".to_string(), value: "1..4".to_string() },
            Fact { key: "clp:var:C".to_string(), value: "1..4".to_string() },
            Fact { key: "clp:var:D".to_string(), value: "1..4".to_string() },
            // Constraints (sorted key order controls posting sequence).
            // c1: A must precede B
            Fact { key: "clp:constraint:c1".to_string(), value: "A<B".to_string() },
            // c2: C must precede D
            Fact { key: "clp:constraint:c2".to_string(), value: "C<D".to_string() },
            // c3: A and C cannot share the same slot
            Fact { key: "clp:constraint:c3".to_string(), value: "A!=C".to_string() },
            // c4: all tasks occupy distinct slots
            Fact { key: "clp:constraint:c4".to_string(), value: "alldiff(A,B,C,D)".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = Clp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output to JSON");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            println!("clp ok — assignment={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);

            // Print the per-variable solution facts for human readability.
            for fact in &output.facts {
                if fact.key.starts_with("clp:solution:") {
                    println!("  {} = {}", &fact.key["clp:solution:".len()..], fact.value);
                }
            }
        }
        Err(e) => {
            eprintln!("clp error: {e}");
            std::process::exit(1);
        }
    }
}
