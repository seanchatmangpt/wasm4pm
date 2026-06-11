//! POMDP — exact Bayes belief update + bounded PBVI.
//! Classic tiger problem: Kaelbling, Littman & Cassandra 1998.
//! After hearing the tiger on the left twice, the planner opens the right door.
//! Run: cargo run --example pomdp

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::pomdp::Pomdp;

fn fact(k: &str, v: &str) -> Fact {
    Fact { key: k.to_string(), value: v.to_string() }
}

fn main() {
    // Tiger problem: two hidden states, three actions, two observations.
    // Listen costs -1 but sharpens belief; opening the wrong door costs -100.
    let mut facts = vec![
        fact("pomdp:states",       "tiger-left,tiger-right"),
        fact("pomdp:actions",      "listen,open-left,open-right"),
        fact("pomdp:observations", "hear-left,hear-right"),
        fact("pomdp:gamma",        "0.95"),
        fact("pomdp:horizon",      "3"),
        // Uniform prior — no idea where the tiger is.
        fact("pomdp:b0:tiger-left",  "0.5"),
        fact("pomdp:b0:tiger-right", "0.5"),
        // listen: tiger stays put; observation is 85% accurate.
        fact("pomdp:t:listen:tiger-left:tiger-left",   "1.0"),
        fact("pomdp:t:listen:tiger-left:tiger-right",  "0.0"),
        fact("pomdp:t:listen:tiger-right:tiger-left",  "0.0"),
        fact("pomdp:t:listen:tiger-right:tiger-right", "1.0"),
        fact("pomdp:r:listen:tiger-left",  "-1.0"),
        fact("pomdp:r:listen:tiger-right", "-1.0"),
        fact("pomdp:o:listen:tiger-left:hear-left",   "0.85"),
        fact("pomdp:o:listen:tiger-left:hear-right",  "0.15"),
        fact("pomdp:o:listen:tiger-right:hear-left",  "0.15"),
        fact("pomdp:o:listen:tiger-right:hear-right", "0.85"),
        // open-left: resets tiger position to uniform; observation uninformative.
        fact("pomdp:t:open-left:tiger-left:tiger-left",   "0.5"),
        fact("pomdp:t:open-left:tiger-left:tiger-right",  "0.5"),
        fact("pomdp:t:open-left:tiger-right:tiger-left",  "0.5"),
        fact("pomdp:t:open-left:tiger-right:tiger-right", "0.5"),
        fact("pomdp:o:open-left:tiger-left:hear-left",    "0.5"),
        fact("pomdp:o:open-left:tiger-left:hear-right",   "0.5"),
        fact("pomdp:o:open-left:tiger-right:hear-left",   "0.5"),
        fact("pomdp:o:open-left:tiger-right:hear-right",  "0.5"),
        fact("pomdp:r:open-left:tiger-left",  "-100.0"),
        fact("pomdp:r:open-left:tiger-right",   "10.0"),
        // open-right: mirror of open-left.
        fact("pomdp:t:open-right:tiger-left:tiger-left",   "0.5"),
        fact("pomdp:t:open-right:tiger-left:tiger-right",  "0.5"),
        fact("pomdp:t:open-right:tiger-right:tiger-left",  "0.5"),
        fact("pomdp:t:open-right:tiger-right:tiger-right", "0.5"),
        fact("pomdp:o:open-right:tiger-left:hear-left",    "0.5"),
        fact("pomdp:o:open-right:tiger-left:hear-right",   "0.5"),
        fact("pomdp:o:open-right:tiger-right:hear-left",   "0.5"),
        fact("pomdp:o:open-right:tiger-right:hear-right",  "0.5"),
        fact("pomdp:r:open-right:tiger-left",   "10.0"),
        fact("pomdp:r:open-right:tiger-right", "-100.0"),
        // Observed history: heard tiger on the left twice in a row.
        // Belief updates to ~0.9698 tiger-left, making open-right dominant.
        fact("pomdp:step:0", "listen|hear-left"),
        fact("pomdp:step:1", "listen|hear-left"),
    ];

    let input = BreedInput {
        intent: "tiger-avoidance".to_string(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = Pomdp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!(
                "pomdp ok — action={:?}  hash={}",
                output.selected,
                &output_hash[..16]
            );
            println!("  {}", output.explanation);
            // Print posterior belief for each state.
            for f in &output.facts {
                if f.key.starts_with("pomdp:belief:") {
                    println!("  {} = {}", f.key, f.value);
                }
            }
        }
        Err(e) => {
            eprintln!("pomdp error: {e}");
            std::process::exit(1);
        }
    }
}
