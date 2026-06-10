//! Criterion latency benchmarks for all 13 wasm4pm-cognition breeds.
//!
//! Measures the wall-clock cost of `CognitionBreed::run()` at the Rust
//! boundary (no WASM serialization overhead) with a representative
//! BreedInput that exercises each algorithm's core path.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::{
    allen_temporal::AllenTemporal, autoinstinct_learning::AutoinstinctLearning,
    autoinstinct_neurosis::AutoinstinctNeurosis, autoinstinct_semantics::AutoinstinctSemantics,
    autoinstinct_vision::AutoinstinctVision, bayesian_network::BayesianNetwork, cbr::Cbr,
    csp_ac3::CspAc3, default_logic::DefaultLogic, dempster_shafer::DempsterShafer,
    dendral::Dendral, ebl::Ebl, frame::Eliza, frames_inheritance::FramesInheritance,
    fuzzy_logic::FuzzyLogic, gps::Gps, hearsay::Hearsay, htn_planning::HtnPlanning,
    ltl_monitor::LtlMonitor, production_rules::Mycin, prolog::Prolog, soar::Soar, strips::Strips,
    BreedInput, Candidate, Case, CognitionBreed, Fact, Goal, Rule, StateAtom,
};

fn fact(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

fn rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

/// Representative P1 inputs exercising each algorithm core path.
fn p1_input(breed: &str) -> BreedInput {
    let mut input = BreedInput {
        intent: "bench".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    match breed {
        "ltl_monitor" => {
            input.facts = vec![
                fact("ltl:formula", "G (red -> !green)"),
                fact("trace:0", "red"),
                fact("trace:1", "green"),
                fact("trace:2", "red"),
                fact("trace:3", "green"),
            ];
        }
        "allen_temporal" => {
            input.facts = vec![
                fact("relation", "gamma,delta,p"),
                fact("relation", "delta,eps,m"),
                fact("relation", "eps,zeta,o"),
            ];
        }
        "fuzzy_logic" => {
            input.facts = vec![
                fact("fuzzy:zlorp:lo", "tri:0,0,6"),
                fact("fuzzy:zlorp:mid", "tri:2,5,8"),
                fact("fuzzy:gwib:out", "tri:0,50,100"),
                fact("fuzzy:input:zlorp", "3.7"),
            ];
            input.rules = vec![
                rule("r1", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0),
                rule("r2", vec!["fuzzy:zlorp:lo"], "fuzzy:gwib:out", 1.0),
            ];
        }
        "bayesian_network" => {
            input.facts = vec![
                fact("cpt:B", "0.001"),
                fact("cpt:E", "0.002"),
                fact("cpt:A|B,E", "0.001,0.29,0.94,0.95"),
                fact("cpt:J|A", "0.05,0.90"),
                fact("cpt:M|A", "0.01,0.70"),
                fact("evidence:J", "true"),
                fact("evidence:M", "true"),
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "query".into(), value: "prob:B".into() }];
        }
        "csp_ac3" => {
            input.facts = vec![
                fact("csp-var", "V1:B,G,R"),
                fact("csp-var", "V2:B,G,R"),
                fact("csp-var", "V3:B,G,R"),
                fact("csp-var", "V4:B,G,R"),
                fact("csp-constraint", "V1!=V2"),
                fact("csp-constraint", "V1!=V3"),
                fact("csp-constraint", "V1!=V4"),
                fact("csp-constraint", "V2!=V3"),
                fact("csp-constraint", "V2!=V4"),
            ];
        }
        "default_logic" => {
            input.facts = vec![fact("obs:tweety", "penguin")];
            input.rules = vec![
                rule("r_isa", vec!["penguin"], "bird", 1.0),
                rule("r_penguin", vec!["penguin"], "not_flies", 1.0),
                rule("r_birds_fly", vec!["bird", "unless:not_flies"], "flies", 0.9),
            ];
        }
        "htn_planning" => {
            input.state = vec![
                StateAtom { predicate: "pkg".into(), value: "at_depot".into() },
                StateAtom { predicate: "truck".into(), value: "at_depot".into() },
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "task".into(), value: "deliver".into() }];
            input.rules = vec![
                rule("method:deliver:by_truck", vec!["pkg=at_depot"], "op:load;op:drive;op:unload", 1.0),
                rule("op:load", vec!["pkg=at_depot", "truck=at_depot"], "!pkg=at_depot;pkg=in_truck", 1.0),
                rule("op:drive", vec!["truck=at_depot"], "!truck=at_depot;truck=at_dest", 1.0),
                rule("op:unload", vec!["pkg=in_truck", "truck=at_dest"], "!pkg=in_truck;pkg=at_dest", 1.0),
            ];
        }
        "dempster_shafer" => {
            input.rules = vec![
                rule("witnessA", vec![], "flim", 0.5),
                rule("witnessB", vec![], "flam", 0.75),
                rule("witnessC", vec![], "flim,flam", 0.5),
            ];
            input.goals = vec![Goal { id: "query".into(), predicate: "query".into(), value: "flim".into() }];
        }
        "frames_inheritance" => {
            input.intent = "resolve zilk color".into();
            input.facts = vec![
                fact("frame:zilk:isa", "welp"),
                fact("frame:welp:isa", "snorf"),
                fact("frame:snorf:slot:color:default", "blue"),
                fact("frame:welp:slot:color", "red"),
            ];
        }
        "ebl" => {
            input.facts = vec![
                fact("weight(krate1,light)", "true"),
                fact("weight(bench1,heavy)", "true"),
            ];
            input.rules = vec![
                rule("r1", vec!["lighter(?x,?y)"], "safe_to_stack(?x,?y)", 1.0),
                rule("r2", vec!["weight(?x,light)", "weight(?y,heavy)"], "lighter(?x,?y)", 1.0),
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "safe_to_stack(krate1,bench1)".into(), value: "true".into() }];
        }
        _ => unreachable!("unknown P1 bench breed"),
    }
    input
}

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

    macro_rules! bench_p1_breed {
        ($group:expr, $name:expr, $breed:expr) => {
            let input = p1_input($name);
            $group.bench_function($name, |b| b.iter(|| $breed.run(black_box(&input))));
        };
    }

    bench_p1_breed!(group, "ltl_monitor", LtlMonitor);
    bench_p1_breed!(group, "allen_temporal", AllenTemporal);
    bench_p1_breed!(group, "fuzzy_logic", FuzzyLogic);
    bench_p1_breed!(group, "bayesian_network", BayesianNetwork);
    bench_p1_breed!(group, "csp_ac3", CspAc3);
    bench_p1_breed!(group, "default_logic", DefaultLogic);
    bench_p1_breed!(group, "htn_planning", HtnPlanning);
    bench_p1_breed!(group, "dempster_shafer", DempsterShafer);
    bench_p1_breed!(group, "frames_inheritance", FramesInheritance);
    bench_p1_breed!(group, "ebl", Ebl);

    group.finish();
}

criterion_group!(benches, bench_breeds);
criterion_main!(benches);
