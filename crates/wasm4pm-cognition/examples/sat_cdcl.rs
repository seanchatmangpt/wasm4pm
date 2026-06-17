//! SAT-CDCL — Conflict-Driven Clause Learning satisfiability solver.
//! Demonstrates a scheduling feasibility check: can we assign shifts
//! to three workers (Alice, Bob, Carol) such that coverage and
//! exclusivity constraints are all satisfied simultaneously?
//!
//! Variables:
//!   x1 = Alice works morning
//!   x2 = Bob works morning
//!   x3 = Carol works evening
//!
//! Clauses (CNF):
//!   clause:1  =  "x1,x2,-x3"   — at least one morning worker OR Carol off evenings
//!   clause:2  = "-x1,x3"       — if Alice works morning, Carol must work evening
//!   clause:3  = "-x2,-x3"      — Bob and Carol cannot both be scheduled together
//!
//! Run: cargo run --example sat_cdcl

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::sat_cdcl::SatCdcl;

fn main() {
    let input = BreedInput {
        intent: "shift-scheduling-feasibility".to_string(),
        candidates: vec![],
        facts: vec![
            // CNF clauses encoding the scheduling constraints
            Fact { key: "clause:1".to_string(), value: "x1,x2,-x3".to_string() },
            Fact { key: "clause:2".to_string(), value: "-x1,x3".to_string() },
            Fact { key: "clause:3".to_string(), value: "-x2,-x3".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "satisfiable".to_string(),
                value: "true".to_string(),
            },
        ],
        state: vec![],
    };

    let breed = SatCdcl;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("sat_cdcl ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("sat_cdcl error: {e}");
            std::process::exit(1);
        }
    }
}
