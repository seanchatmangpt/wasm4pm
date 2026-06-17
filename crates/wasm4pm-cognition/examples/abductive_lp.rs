//! Abductive Logic Programming (Kakas, Kowalski & Toni, 1992) — KKT ⟨P, A, IC⟩.
//!
//! Scenario: fault diagnosis for a network service outage.
//! Observation: "service_down"
//! Abducibles: disk_full, network_failure, process_crash
//! Rules: each abducible implies service_down via Horn clauses.
//! IC: disk_full and network_failure cannot both be true simultaneously
//!     (they are mutually exclusive root causes in this domain).
//!
//! Run: cargo run --example abductive_lp

use wasm4pm_cognition::breeds::abductive_lp::AbductiveLp;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "explain".to_string(),
        candidates: vec![],
        facts: vec![
            // Abducibles — hypothesised root causes
            Fact {
                key: "alp:abducible:disk_full".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "alp:abducible:network_failure".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "alp:abducible:process_crash".to_string(),
                value: "true".to_string(),
            },
            // Integrity constraint: disk_full and network_failure are mutually exclusive
            Fact {
                key: "alp:ic:mutual_exclusion".to_string(),
                value: "disk_full,network_failure".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![
            // disk_full → io_blocked → service_down
            Rule {
                id: "r1".to_string(),
                premise: vec!["disk_full".to_string()],
                conclusion: "io_blocked".to_string(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".to_string(),
                premise: vec!["io_blocked".to_string()],
                conclusion: "service_down".to_string(),
                certainty: 1.0,
            },
            // network_failure → service_down (direct)
            Rule {
                id: "r3".to_string(),
                premise: vec!["network_failure".to_string()],
                conclusion: "service_down".to_string(),
                certainty: 1.0,
            },
            // process_crash → service_down (direct)
            Rule {
                id: "r4".to_string(),
                premise: vec!["process_crash".to_string()],
                conclusion: "service_down".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "alp:observe".to_string(),
            value: "service_down".to_string(),
        }],
        state: vec![],
    };

    let breed = AbductiveLp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "abductive_lp ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in output
                .facts
                .iter()
                .filter(|f| f.key.starts_with("alp:explanation"))
            {
                println!("  {} = {}", f.key, f.value);
            }
        }
        Err(e) => {
            eprintln!("abductive_lp error: {e}");
            std::process::exit(1);
        }
    }
}
