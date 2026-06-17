//! chain_learning — 3-stage cognition chain: EBL → ILP → VersionSpace
//!
//! Theme: Knowledge acquisition pipeline.
//!   Stage 0 (Ebl):          Explanation-based learning — generalise "cup is liftable"
//!   Stage 1 (Ilp):          Induce rules from EBL explanation + negative examples
//!   Stage 2 (VersionSpace):  Maintain S/G boundary; specialise/generalise from ILP rules
//!
//! Between stages the blake3 output_hash[:16] of the previous stage is embedded
//! as fact `prior_hash` in the next stage's input, creating an unforgeable chain.

use wasm4pm_cognition::breeds::ebl::Ebl;
use wasm4pm_cognition::breeds::ilp::Ilp;
use wasm4pm_cognition::breeds::version_space::VersionSpace;
use wasm4pm_cognition::breeds::{
    dispatch::run_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn hash_output(output: &wasm4pm_cognition::breeds::BreedOutput) -> String {
    let json = serde_json::to_string(output).expect("BreedOutput serialization");
    blake3::hash(json.as_bytes()).to_hex().to_string()
}

fn main() {
    // -----------------------------------------------------------------------
    // Stage 0 — EBL: generalise "cup1 is liftable" into a reusable rule
    // -----------------------------------------------------------------------
    let ebl_input = BreedInput {
        intent: "learn liftable concept from cup1 example".to_string(),
        candidates: vec![Candidate {
            id: "cup1".to_string(),
            score: 1.0,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![
            // ground atoms for the training example
            Fact {
                key: "has_handle(cup1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "light_weight(cup1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "stable(cup1)".to_string(),
                value: "true".to_string(),
            },
        ],
        rules: vec![
            // domain theory: liftable if has_handle AND light_weight AND stable
            Rule {
                id: "dr1".to_string(),
                premise: vec![
                    "has_handle(?x)".to_string(),
                    "light_weight(?x)".to_string(),
                    "stable(?x)".to_string(),
                ],
                conclusion: "liftable(?x)".to_string(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "g0".to_string(),
            predicate: "liftable(cup1)".to_string(),
            value: "true".to_string(),
        }],
        cases: vec![],
        state: vec![],
    };

    let ebl_breed = Ebl;
    let ebl_output = run_breed(&ebl_breed, &ebl_input).unwrap_or_else(|e| {
        eprintln!("stage 0 [ebl] FAILED: {}", e);
        std::process::exit(1);
    });

    let ebl_hash = hash_output(&ebl_output);
    let ebl_prior = ebl_hash[..16].to_string();
    println!("stage 0 [ebl]: ok  hash={}", ebl_prior);

    // -----------------------------------------------------------------------
    // Stage 1 — ILP: induce liftable(X) :- has_handle(X), light_weight(X)
    //           from positive/negative examples; embed ebl prior_hash
    // -----------------------------------------------------------------------
    let ilp_input = BreedInput {
        intent: "induce liftable predicate from positive and negative examples".to_string(),
        candidates: vec![],
        facts: vec![
            // chain: prior stage hash
            Fact {
                key: "prior_hash".to_string(),
                value: ebl_prior,
            },
            // positive examples
            Fact {
                key: "pos:liftable(cup1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "pos:liftable(mug1)".to_string(),
                value: "true".to_string(),
            },
            // negative examples
            Fact {
                key: "neg:liftable(boulder1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "neg:liftable(anvil1)".to_string(),
                value: "true".to_string(),
            },
            // background knowledge
            Fact {
                key: "bg:has_handle(cup1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "bg:has_handle(mug1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "bg:has_handle(boulder1)".to_string(),
                value: "false".to_string(),
            },
            Fact {
                key: "bg:has_handle(anvil1)".to_string(),
                value: "false".to_string(),
            },
            Fact {
                key: "bg:light_weight(cup1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "bg:light_weight(mug1)".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "bg:light_weight(boulder1)".to_string(),
                value: "false".to_string(),
            },
            Fact {
                key: "bg:light_weight(anvil1)".to_string(),
                value: "false".to_string(),
            },
        ],
        rules: vec![],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "induce".to_string(),
            value: "liftable".to_string(),
        }],
        cases: vec![],
        state: vec![],
    };

    let ilp_breed = Ilp;
    let ilp_output = run_breed(&ilp_breed, &ilp_input).unwrap_or_else(|e| {
        eprintln!("stage 1 [ilp] FAILED: {}", e);
        std::process::exit(1);
    });

    let ilp_hash = hash_output(&ilp_output);
    let ilp_prior = ilp_hash[..16].to_string();
    println!("stage 1 [ilp]:  ok  hash={}", ilp_prior);

    // -----------------------------------------------------------------------
    // Stage 2 — VersionSpace: maintain S/G boundary over liftable attributes
    //           (handle, weight); embed ilp prior_hash
    // -----------------------------------------------------------------------
    let vs_input = BreedInput {
        intent: "refine liftable version-space from ILP-derived examples".to_string(),
        candidates: vec![],
        facts: vec![
            // chain: prior stage hash
            Fact {
                key: "prior_hash".to_string(),
                value: ilp_prior,
            },
            // attribute names
            Fact {
                key: "vs:attrs".to_string(),
                value: "handle,weight".to_string(),
            },
            // positive examples: has_handle=yes, weight=light
            Fact {
                key: "vs:example:0".to_string(),
                value: "yes,light:+".to_string(),
            },
            Fact {
                key: "vs:example:1".to_string(),
                value: "yes,light:+".to_string(),
            },
            // negative examples: no handle or heavy
            Fact {
                key: "vs:example:2".to_string(),
                value: "no,heavy:-".to_string(),
            },
            Fact {
                key: "vs:example:3".to_string(),
                value: "yes,heavy:-".to_string(),
            },
        ],
        rules: vec![],
        goals: vec![Goal {
            id: "g2".to_string(),
            predicate: "eliminate".to_string(),
            value: "liftable".to_string(),
        }],
        cases: vec![],
        state: vec![],
    };

    let vs_breed = VersionSpace;
    let vs_output = run_breed(&vs_breed, &vs_input).unwrap_or_else(|e| {
        eprintln!("stage 2 [version_space] FAILED: {}", e);
        std::process::exit(1);
    });

    let vs_hash = hash_output(&vs_output);
    println!("stage 2 [version_space]: ok  hash={}", &vs_hash[..16]);

    println!();
    println!("chain complete — unforgeable: each stage hash is embedded in the next");
}
