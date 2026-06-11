//! ILP (FOIL) — top-down induction of first-order Horn clauses by information gain.
//! Demonstrates learning a `grandparent/2` rule from family relationship facts.
//! Run: cargo run --example ilp

use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};
use wasm4pm_cognition::breeds::ilp::Ilp;

fn main() {
    // Domain: family relationships.
    // Target: grandparent(X, Z)
    // Background: parent(X, Y) facts.
    // Positive examples: known grandparent pairs.
    // Negative examples: non-grandparent pairs.
    //
    // Family tree:
    //   ann --parent--> bob --parent--> carol
    //   ann --parent--> bob --parent--> dave
    //   tom --parent--> liz --parent--> carol
    //
    // So: grandparent(ann,carol), grandparent(ann,dave), grandparent(tom,carol)
    // Negatives: grandparent(bob,ann), grandparent(liz,tom)

    let input = BreedInput {
        intent: "induce-grandparent-rule".to_string(),
        candidates: vec![],
        facts: vec![
            // Positive examples (target relation to learn)
            Fact { key: "pos:grandparent(ann,carol)".to_string(), value: "1".to_string() },
            Fact { key: "pos:grandparent(ann,dave)".to_string(),  value: "1".to_string() },
            Fact { key: "pos:grandparent(tom,carol)".to_string(), value: "1".to_string() },
            // Negative examples
            Fact { key: "neg:grandparent(bob,ann)".to_string(),   value: "1".to_string() },
            Fact { key: "neg:grandparent(liz,tom)".to_string(),   value: "1".to_string() },
            // Background knowledge: parent/2 facts
            Fact { key: "bg:parent(ann,bob)".to_string(), value: "1".to_string() },
            Fact { key: "bg:parent(bob,carol)".to_string(), value: "1".to_string() },
            Fact { key: "bg:parent(bob,dave)".to_string(), value: "1".to_string() },
            Fact { key: "bg:parent(tom,liz)".to_string(), value: "1".to_string() },
            Fact { key: "bg:parent(liz,carol)".to_string(), value: "1".to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = Ilp;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("ilp ok — hash={}", &output_hash[..16]);
            println!("  {}", output.explanation);
            for fact in &output.facts {
                if fact.key.starts_with("ilp:rule:") {
                    println!("  rule: {}", fact.value);
                }
            }
        }
        Err(e) => {
            eprintln!("ilp error: {e}");
            std::process::exit(1);
        }
    }
}
