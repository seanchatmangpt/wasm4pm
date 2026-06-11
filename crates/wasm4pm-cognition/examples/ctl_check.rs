//! CTL Model Checker — Computation Tree Logic verification over a Kripke structure.
//! Demonstrates EF (exists finally), AG (always globally), and EG checks.
//! Run: cargo run --example ctl_check

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::ctl_check::CtlCheck;

fn main() {
    // Kripke structure modelling a simple mutual-exclusion protocol:
    //   s0 (idle)  --→  s1 (waiting)  --→  s2 (critical)  --→  s0
    //   s0 also self-loops so AG idle is reachable from start
    //
    // Atomic propositions:
    //   idle      — process is in idle state
    //   waiting   — process has requested the lock
    //   critical  — process holds the lock
    //
    // CTL formula under check: EF critical
    //   "There exists a path on which the process eventually enters the critical section."
    let input = BreedInput {
        intent: "mutex-safety".to_string(),
        candidates: vec![],
        facts: vec![
            // State propositions
            Fact { key: "state:s0:prop".to_string(), value: "idle".to_string() },
            Fact { key: "state:s1:prop".to_string(), value: "waiting".to_string() },
            Fact { key: "state:s2:prop".to_string(), value: "critical".to_string() },
            // Transitions
            Fact { key: "trans:s0".to_string(), value: "s1".to_string() },
            Fact { key: "trans:s1".to_string(), value: "s2".to_string() },
            Fact { key: "trans:s2".to_string(), value: "s0".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".to_string(),
                predicate: "check".to_string(),
                value: "EF critical".to_string(),
            },
        ],
        state: vec![
            StateAtom {
                predicate: "initial".to_string(),
                value: "s0".to_string(),
            },
        ],
    };

    let breed = CtlCheck;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("ctl_check ok — selected={:?}  hash={}", output.selected, &output_hash[..16]);
            println!("  {}", output.explanation);
        }
        Err(e) => {
            eprintln!("ctl_check error: {e}");
            std::process::exit(1);
        }
    }
}
