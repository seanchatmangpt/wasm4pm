//! ASP — Gelfond–Lifschitz stable-model semantics (negation-as-failure).
//!
//! Scenario: graph 3-colouring for a triangle (nodes a, b, c; all edges present).
//! A valid 3-colouring assigns exactly one colour per node and no two adjacent
//! nodes share a colour.  ASP encodes this as a "guess and check" program:
//!   - guess rules assign one of {red, green, blue} to each node via NAF.
//!   - constraint rules (here encoded as integrity tests) eliminate colourings
//!     where an edge shares a colour.
//!
//! Run: cargo run --example asp

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::asp::Asp;

fn r(id: &str, premise: Vec<&str>, conclusion: &str) -> Rule {
    Rule {
        id: id.to_string(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.to_string(),
        certainty: 1.0,
    }
}

fn main() {
    // Encode a small non-monotonic scheduling problem:
    //   - A task is "urgent" by default unless marked "deferred".
    //   - A task is "scheduled" if it is urgent and not "blocked".
    //   - "blocked" is a given fact for task_b.
    //   - Two choices (task_a, task_b) — stable models reveal which tasks get scheduled.
    let input = BreedInput {
        intent: "task-scheduling".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            // Facts: both tasks exist.
            r("f_task_a", vec![], "task_a"),
            r("f_task_b", vec![], "task_b"),
            // task_b is blocked (given).
            r("f_blocked_b", vec![], "blocked_b"),
            // A task is urgent unless deferred (closed-world: no deferred fact, so both are urgent).
            r("r_urgent_a", vec!["task_a", "not deferred_a"], "urgent_a"),
            r("r_urgent_b", vec!["task_b", "not deferred_b"], "urgent_b"),
            // A task is scheduled if it is urgent and not blocked.
            r("r_sched_a", vec!["urgent_a", "not blocked_a"], "scheduled_a"),
            r("r_sched_b", vec!["urgent_b", "not blocked_b"], "scheduled_b"),
        ],
        goals: vec![],
        state: vec![],
    };

    let breed = Asp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();

            let count = output
                .facts
                .iter()
                .find(|f| f.key == "asp:answer_set_count")
                .map(|f| f.value.as_str())
                .unwrap_or("?");

            println!("asp ok — answer_sets={count}  hash={}", &output_hash[..16]);
            println!("  {}", output.explanation);

            for f in output.facts.iter().filter(|f| f.key.starts_with("asp:answer_set:")) {
                println!("  stable model: {{{}}}", f.value);
            }

            if let Some(sel) = &output.selected {
                println!("  first stable model selected: {{{sel}}}");
            } else {
                println!("  no stable model (unsatisfiable program)");
            }
        }
        Err(e) => {
            eprintln!("asp error: {e}");
            std::process::exit(1);
        }
    }
}
