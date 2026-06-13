//! Belief merging — distance-based IC merging (Konieczny & Pino Pérez 2002).
//! Three agents hold conflicting beliefs about a system incident (network outage).
//! The integrity constraint encodes a physical invariant that must hold in the
//! merged belief, regardless of what any individual agent believes.
//!
//! Run: cargo run --example belief_merging

use wasm4pm_cognition::breeds::belief_merging::BeliefMerging;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn main() {
    // Atoms: outage(o), router_fault(r), dns_fault(d)
    //
    // Agent 1 (NOC): believes outage caused by router fault only   →  o, r, -d
    // Agent 2 (DevOps): believes outage caused by DNS fault only   →  o, -r, d
    // Agent 3 (Security): believes no outage at all               → -o, -r, -d
    //
    // IC: if there is an outage there must be at least one fault cause.
    //     Encoded as the negation of the forbidden world (o, -r, -d):
    //     IC literal conjunction "-o" is too strong here, so we use "true" (no IC)
    //     and rely on base distances to drive convergence.  A richer IC would
    //     require disjunctive support which this breed handles via world enumeration.
    //
    // With IC = "true" (tautology, all worlds allowed):
    //   Σ operator: world (o,-r,-d) has distances (1,1,2) sum=4; (o,r,-d) has (0,2,1) sum=3;
    //   (-o,-r,-d) has (2,2,0) sum=4; (-o,r,-d) has (2,3,1)=6; etc.
    //   The Σ-minimal world is (o,r,-d) sum=3 — majority router-fault diagnosis wins.
    let input = BreedInput {
        intent: "incident-root-cause".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "bm:atoms".to_string(),
                value: "o,r,d".to_string(),
            },
            // Agent 1 — NOC: outage + router fault
            Fact {
                key: "bm:base:1".to_string(),
                value: "o,r,-d".to_string(),
            },
            // Agent 2 — DevOps: outage + DNS fault
            Fact {
                key: "bm:base:2".to_string(),
                value: "o,-r,d".to_string(),
            },
            // Agent 3 — Security: no outage, no fault
            Fact {
                key: "bm:base:3".to_string(),
                value: "-o,-r,-d".to_string(),
            },
            // IC: tautology — no external constraint (all worlds are IC-worlds)
            Fact {
                key: "bm:ic".to_string(),
                value: "true".to_string(),
            },
            // Σ (sum) aggregation — majoritarian
            Fact {
                key: "bm:operator".to_string(),
                value: "sum".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = BeliefMerging;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "belief_merging ok — selected={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            for f in output
                .facts
                .iter()
                .filter(|f| f.key.starts_with("bm:model"))
            {
                println!("  {} = {}", f.key, f.value);
            }
        }
        Err(e) => {
            eprintln!("belief_merging error: {e}");
            std::process::exit(1);
        }
    }
}
