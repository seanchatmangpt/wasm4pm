//! HTN Planning — SHOP2-style total-order decomposition (Nau et al. 2003).
//!
//! Scenario: a robot must deliver a package from a warehouse to a customer.
//! The high-level task `deliver` decomposes into `navigate` then `handoff`.
//! `navigate` decomposes into `op:pick-route` then `op:move`.
//! `handoff` decomposes into `op:verify-id` then `op:transfer`.
//!
//! Run: cargo run --example htn_planning

use wasm4pm_cognition::breeds::htn_planning::HtnPlanning;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    let input = BreedInput {
        intent: "deliver-package".to_string(),
        candidates: vec![
            Candidate {
                id: "route-A".to_string(),
                score: 0.85,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "route-B".to_string(),
                score: 0.65,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "package".to_string(),
                value: "PKG-001".to_string(),
            },
            Fact {
                key: "destination".to_string(),
                value: "customer-site".to_string(),
            },
        ],
        cases: vec![],
        // Domain rules: methods decompose compound tasks; op: rules are primitives.
        rules: vec![
            // method:deliver:standard — no preconditions; decomposes into navigate then handoff
            Rule {
                id: "method:deliver:standard".to_string(),
                premise: vec![],
                conclusion: "navigate ; handoff".to_string(),
                certainty: 1.0,
            },
            // method:navigate:has-route — decompose only when a route is already selected
            Rule {
                id: "method:navigate:has-route".to_string(),
                premise: vec!["route=selected".to_string()],
                conclusion: "op:move".to_string(),
                certainty: 1.0,
            },
            // method:navigate:no-route — pick a route first, then move
            Rule {
                id: "method:navigate:no-route".to_string(),
                premise: vec![],
                conclusion: "op:pick-route ; op:move".to_string(),
                certainty: 1.0,
            },
            // method:handoff:standard — verify identity then transfer
            Rule {
                id: "method:handoff:standard".to_string(),
                premise: vec![],
                conclusion: "op:verify-id ; op:transfer".to_string(),
                certainty: 1.0,
            },
            // op:pick-route — selects a route; adds route=selected
            Rule {
                id: "op:pick-route".to_string(),
                premise: vec![],
                conclusion: "route=selected".to_string(),
                certainty: 1.0,
            },
            // op:move — robot moves to destination; requires route=selected
            Rule {
                id: "op:move".to_string(),
                premise: vec!["route=selected".to_string()],
                conclusion: "at=customer-site".to_string(),
                certainty: 1.0,
            },
            // op:verify-id — verifies recipient; requires robot at destination
            Rule {
                id: "op:verify-id".to_string(),
                premise: vec!["at=customer-site".to_string()],
                conclusion: "id=verified".to_string(),
                certainty: 1.0,
            },
            // op:transfer — hands off the package; requires id verified
            Rule {
                id: "op:transfer".to_string(),
                premise: vec!["id=verified".to_string()],
                conclusion: "package=delivered ; !id=verified".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "task".to_string(),
            value: "deliver".to_string(),
        }],
        state: vec![
            StateAtom {
                predicate: "at".to_string(),
                value: "warehouse".to_string(),
            },
            StateAtom {
                predicate: "package".to_string(),
                value: "loaded".to_string(),
            },
        ],
    };

    let breed = HtnPlanning;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "htn_planning ok — plan={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            println!("  trace steps: {}", output.inference_trace.len());
        }
        Err(e) => {
            eprintln!("htn_planning error: {e}");
            std::process::exit(1);
        }
    }
}
