//! Criterion latency benchmarks for all 13 wasm4pm-cognition breeds.
//!
//! Measures the wall-clock cost of `CognitionBreed::run()` at the Rust
//! boundary (no WASM serialization overhead) with a representative
//! BreedInput that exercises each algorithm's core path.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::{
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr, dendral::Dendral, frame::Eliza, gps::Gps, hearsay::Hearsay, production_rules::Mycin,
    prolog::Prolog, soar::Soar, strips::Strips, BreedInput, Candidate, Case, CognitionBreed, Fact,
    Goal, Rule, StateAtom,
};

fn make_input() -> BreedInput {
    BreedInput {
        intent: "select architecture for high-throughput distributed system".into(),
        candidates: vec![
            Candidate {
                id: "centralized-cloud".into(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "edge-mesh".into(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "hybrid-fog".into(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "requirement:offline".into(),
                value: "false".into(),
            },
            Fact {
                key: "scale:billion".into(),
                value: "true".into(),
            },
            Fact {
                key: "latency:critical".into(),
                value: "true".into(),
            },
            Fact {
                key: "budget:high".into(),
                value: "true".into(),
            },
        ],
        cases: vec![
            Case {
                id: "case-001".into(),
                intent: "high-throughput distributed system".into(),
                architecture: "centralized-cloud".into(),
                outcome_score: 0.88,
                facts: vec![
                    Fact {
                        key: "scale:billion".into(),
                        value: "true".into(),
                    },
                    Fact {
                        key: "latency:critical".into(),
                        value: "true".into(),
                    },
                ],
            },
            Case {
                id: "case-002".into(),
                intent: "offline-first edge deployment".into(),
                architecture: "edge-mesh".into(),
                outcome_score: 0.75,
                facts: vec![Fact {
                    key: "requirement:offline".into(),
                    value: "true".into(),
                }],
            },
        ],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["scale:billion".into(), "latency:critical".into()],
                conclusion: "recommend:centralized-cloud".into(),
                certainty: 0.85,
            },
            Rule {
                id: "r2".into(),
                premise: vec!["requirement:offline".into()],
                conclusion: "eliminate:centralized-cloud".into(),
                certainty: 0.95,
            },
            Rule {
                id: "r3".into(),
                premise: vec!["budget:high".into()],
                conclusion: "prefer:managed-service".into(),
                certainty: 0.70,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".into(),
                predicate: "performance".into(),
                value: "high".into(),
            },
            Goal {
                id: "g2".into(),
                predicate: "cost".into(),
                value: "controlled".into(),
            },
        ],
        state: vec![
            StateAtom {
                predicate: "service:online".into(),
                value: "true".into(),
            },
            StateAtom {
                predicate: "infra:provisioned".into(),
                value: "false".into(),
            },
        ],
    }
}

fn bench_breeds(c: &mut Criterion) {
    let input = make_input();

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr) => {
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    let mut group = c.benchmark_group("breed_latency");
    // Reduce sample size for speed; criterion defaults to 100 samples / 5s warmup
    group.sample_size(50);

    bench_breed!(group, "mycin", Mycin);
    bench_breed!(group, "strips", Strips);
    bench_breed!(group, "prolog", Prolog);
    bench_breed!(group, "eliza", Eliza);
    bench_breed!(group, "cbr", Cbr);
    bench_breed!(group, "dendral", Dendral);
    bench_breed!(group, "gps", Gps);
    bench_breed!(group, "soar", Soar);
    bench_breed!(group, "hearsay", Hearsay);
    bench_breed!(group, "autoinstinct_learning", AutoinstinctLearning);
    bench_breed!(group, "autoinstinct_semantics", AutoinstinctSemantics);
    bench_breed!(group, "autoinstinct_neurosis", AutoinstinctNeurosis);
    bench_breed!(group, "autoinstinct_vision", AutoinstinctVision);

    group.finish();
}

// ── P4 tier benchmarks (each breed exercises its core path on its paper
// fixture-sized input; POMDP note: the PRD allots 50–300µs for POMDP, the
// global ≤100µs budget is kept via the structural caps — see docs/breeds/pomdp.md).

fn p4_input(facts: Vec<(&str, &str)>) -> BreedInput {
    BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: facts
            .into_iter()
            .map(|(k, v)| Fact {
                key: k.into(),
                value: v.into(),
            })
            .collect(),
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn tiger_bench_input() -> BreedInput {
    let mut facts: Vec<(String, String)> = vec![
        ("pomdp:states".into(), "tiger-left,tiger-right".into()),
        ("pomdp:actions".into(), "listen,open-left,open-right".into()),
        ("pomdp:observations".into(), "hear-left,hear-right".into()),
        ("pomdp:gamma".into(), "0.95".into()),
        ("pomdp:horizon".into(), "3".into()),
        ("pomdp:b0:tiger-left".into(), "0.5".into()),
        ("pomdp:b0:tiger-right".into(), "0.5".into()),
        ("pomdp:o:listen:tiger-left:hear-left".into(), "0.85".into()),
        ("pomdp:o:listen:tiger-left:hear-right".into(), "0.15".into()),
        ("pomdp:o:listen:tiger-right:hear-left".into(), "0.15".into()),
        ("pomdp:o:listen:tiger-right:hear-right".into(), "0.85".into()),
        ("pomdp:step:0".into(), "listen|hear-left".into()),
    ];
    for s in ["tiger-left", "tiger-right"] {
        for sp in ["tiger-left", "tiger-right"] {
            facts.push((
                format!("pomdp:t:listen:{}:{}", s, sp),
                if s == sp { "1.0" } else { "0.0" }.into(),
            ));
        }
        facts.push((format!("pomdp:r:listen:{}", s), "-1.0".into()));
    }
    for a in ["open-left", "open-right"] {
        for s in ["tiger-left", "tiger-right"] {
            for sp in ["tiger-left", "tiger-right"] {
                facts.push((format!("pomdp:t:{}:{}:{}", a, s, sp), "0.5".into()));
            }
            for ob in ["hear-left", "hear-right"] {
                facts.push((format!("pomdp:o:{}:{}:{}", a, s, ob), "0.5".into()));
            }
        }
    }
    facts.push(("pomdp:r:open-left:tiger-left".into(), "-100.0".into()));
    facts.push(("pomdp:r:open-left:tiger-right".into(), "10.0".into()));
    facts.push(("pomdp:r:open-right:tiger-left".into(), "10.0".into()));
    facts.push(("pomdp:r:open-right:tiger-right".into(), "-100.0".into()));
    BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: facts
            .into_iter()
            .map(|(k, v)| Fact { key: k, value: v })
            .collect(),
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn bench_p4_breeds(c: &mut Criterion) {
    use wasm4pm_cognition::breeds::{
        construction_grammar::ConstructionGrammar, contingent_plan::ContingentPlan,
        markov_logic::MarkovLogic, meta_reasoning::MetaReasoning, pomdp::Pomdp,
        tableaux::Tableaux,
    };

    macro_rules! bench_breed {
        ($group:expr, $name:expr, $breed:expr, $input:expr) => {
            let input = $input;
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    let mut group = c.benchmark_group("breed_latency_p4");
    group.sample_size(50);

    bench_breed!(
        group,
        "tableaux",
        Tableaux,
        p4_input(vec![("tableaux:formula", "((a -> b) -> a) -> a")])
    );
    bench_breed!(
        group,
        "construction_grammar",
        ConstructionGrammar,
        p4_input(vec![
            ("cxg:utterance", "he sneezed the napkin off the table"),
            ("lex:he:pos", "pron"),
            ("lex:sneezed:pos", "verb"),
            ("lex:sneezed:valence", "intransitive"),
            ("lex:the:pos", "det"),
            ("lex:napkin:pos", "noun"),
            ("lex:off:pos", "prep"),
            ("lex:table:pos", "noun"),
        ])
    );
    bench_breed!(
        group,
        "markov_logic",
        MarkovLogic,
        p4_input(vec![
            ("mln:clause:c1", "1.5|!smokes_anna,cancer_anna"),
            ("mln:clause:c2", "1.5|!smokes_bob,cancer_bob"),
            ("mln:clause:c3", "1.1|!friends_ab,!smokes_anna,smokes_bob"),
            ("mln:clause:c4", "1.1|!friends_ab,!smokes_bob,smokes_anna"),
            ("evidence:smokes_anna", "true"),
            ("evidence:friends_ab", "true"),
        ])
    );
    bench_breed!(group, "pomdp", Pomdp, tiger_bench_input());
    bench_breed!(
        group,
        "contingent_plan",
        ContingentPlan,
        p4_input(vec![
            ("cp:unknown", "dirt"),
            ("cp:goal:dirt", "false"),
            ("cp:act:suck:pre", "dirt"),
            ("cp:act:suck:del", "dirt"),
            ("cp:sense:check-dirt", "dirt"),
        ])
    );
    bench_breed!(
        group,
        "meta_reasoning",
        MetaReasoning,
        p4_input(vec![
            ("breed:mycin:conclusion", "therapy=gentamicin"),
            ("breed:mycin:confidence", "0.8"),
            ("breed:prolog:conclusion", "therapy=none"),
            ("breed:prolog:confidence", "0.6"),
        ])
    );

    group.finish();
}

criterion_group!(benches, bench_breeds, bench_p4_breeds);
criterion_main!(benches);
