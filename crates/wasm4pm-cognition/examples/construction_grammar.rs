//! Construction Grammar — Goldberg argument-structure construction matcher.
//!
//! Demonstrates:
//!   1. Ditransitive construction ("she gave the child a book")
//!      — three argument slots: subj / rec / theme; no coercion (verb is ditransitive).
//!   2. Caused-motion with coercion ("he sneezed the napkin off the table")
//!      — intransitive verb coerced into a caused-motion frame (Goldberg 1995 signature example).
//!
//! Run: cargo run --example construction_grammar

use wasm4pm_cognition::breeds::construction_grammar::ConstructionGrammar;
use wasm4pm_cognition::breeds::{dispatch::run_breed, BreedInput, Fact};

/// Build a fact vec with the required utterance plus lexicon entries.
fn make_input(utterance: &str, lexicon: &[(&str, &str)], valences: &[(&str, &str)]) -> BreedInput {
    let mut facts = vec![Fact {
        key: "cxg:utterance".to_string(),
        value: utterance.to_string(),
    }];
    for (word, pos) in lexicon {
        facts.push(Fact {
            key: format!("lex:{}:pos", word),
            value: pos.to_string(),
        });
    }
    for (word, val) in valences {
        facts.push(Fact {
            key: format!("lex:{}:valence", word),
            value: val.to_string(),
        });
    }
    BreedInput {
        intent: "parse".to_string(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn run_example(label: &str, input: BreedInput) {
    let breed = ConstructionGrammar;
    match run_breed(&breed, &input) {
        Ok(output) => {
            let output_json = serde_json::to_string(&output).expect("serialize output");
            let output_hash = blake3::hash(output_json.as_bytes()).to_hex().to_string();
            println!("=== {} ===", label);
            println!("  construction : {:?}", output.selected);
            for f in &output.facts {
                if f.key.starts_with("cxg:") {
                    println!("  {} = {}", f.key, f.value);
                }
            }
            println!("  explanation  : {}", output.explanation);
            println!("  output_hash  : {}", &output_hash[..16]);
            println!();
        }
        Err(e) => {
            eprintln!("construction_grammar error [{}]: {}", label, e);
            std::process::exit(1);
        }
    }
}

fn main() {
    // ── Example 1: Ditransitive ────────────────────────────────────────────────
    // "she gave the child a book"
    // Post-verbal chunks: NP("the child") NP("a book") → ditransitive
    // Verb lexical valence is also ditransitive, so no coercion.
    let ditransitive = make_input(
        "she gave the child a book",
        &[
            ("she", "pron"),
            ("gave", "verb"),
            ("the", "det"),
            ("child", "noun"),
            ("a", "det"),
            ("book", "noun"),
        ],
        &[("gave", "ditransitive")],
    );
    run_example("ditransitive — she gave the child a book", ditransitive);

    // ── Example 2: Caused-motion with Goldberg coercion ───────────────────────
    // "he sneezed the napkin off the table"
    // "sneeze" is intransitive but appears in a caused-motion frame (NP PP).
    // The construction contributes the CAUSE-MOVE meaning — canonical coercion case.
    let coerced_motion = make_input(
        "he sneezed the napkin off the table",
        &[
            ("he", "pron"),
            ("sneezed", "verb"),
            ("the", "det"),
            ("napkin", "noun"),
            ("off", "prep"),
            ("table", "noun"),
        ],
        &[("sneezed", "intransitive")],
    );
    run_example(
        "caused-motion coercion — he sneezed the napkin off the table",
        coerced_motion,
    );

    // ── Example 3: Transitive ─────────────────────────────────────────────────
    // "the dog chased the cat"
    // Post-verbal chunks: NP("the cat") → transitive, ACT-ON frame.
    let transitive = make_input(
        "the dog chased the cat",
        &[
            ("the", "det"),
            ("dog", "noun"),
            ("chased", "verb"),
            ("cat", "noun"),
        ],
        &[("chased", "transitive")],
    );
    run_example("transitive — the dog chased the cat", transitive);
}
