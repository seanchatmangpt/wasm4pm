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
    prolog::Prolog, soar::Soar, strips::Strips,
    ltl_monitor::LtlMonitor, allen_temporal::AllenTemporal, fuzzy_logic::FuzzyLogic,
    bayesian_network::BayesianNetwork, csp_ac3::CspAc3, default_logic::DefaultLogic,
    htn_planning::HtnPlanning, dempster_shafer::DempsterShafer,
    frames_inheritance::FramesInheritance, ebl::Ebl,
    BreedInput, Candidate, Case, CognitionBreed, Fact,
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
            Fact {
                key: "formula".into(),
                value: "G true".into(),
            },
            Fact {
                key: "relation".into(),
                value: "A meets B".into(),
            },
            Fact {
                key: "temperature".into(),
                value: "25.0".into(),
            },
            Fact {
                key: "fuzzy_set:temperature:warm".into(),
                value: "triangular 20,25,30".into(),
            },
            Fact {
                key: "fuzzy_set:ventilation:medium".into(),
                value: "triangular 10,50,90".into(),
            },
            Fact {
                key: "Alarm".into(),
                value: "true".into(),
            },
            Fact {
                key: "csp-var".into(),
                value: "V1:R,G,B".into(),
            },
            Fact {
                key: "csp-var".into(),
                value: "V2:R,G,B".into(),
            },
            Fact {
                key: "csp-constraint".into(),
                value: "V1!=V2".into(),
            },
            Fact {
                key: "tweety".into(),
                value: "tweety".into(),
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
            Rule {
                id: "rfuzzy".into(),
                premise: vec!["temperature is warm".into()],
                conclusion: "ventilation is medium".into(),
                certainty: 1.0,
            },
            Rule {
                id: "r-burg".into(),
                premise: vec![],
                conclusion: "Burglary=true".into(),
                certainty: 0.001,
            },
            Rule {
                id: "r-eq".into(),
                premise: vec![],
                conclusion: "Earthquake=true".into(),
                certainty: 0.002,
            },
            Rule {
                id: "r-alarm1".into(),
                premise: vec!["Burglary=true".into(), "Earthquake=true".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.95,
            },
            Rule {
                id: "r-alarm2".into(),
                premise: vec!["Burglary=true".into(), "Earthquake=false".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.94,
            },
            Rule {
                id: "r-alarm3".into(),
                premise: vec!["Burglary=false".into(), "Earthquake=true".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.29,
            },
            Rule {
                id: "r-alarm4".into(),
                premise: vec!["Burglary=false".into(), "Earthquake=false".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.001,
            },
            Rule {
                id: "r_default".into(),
                premise: vec!["tweety".into(), "unless:non_flying".into()],
                conclusion: "flies".into(),
                certainty: 1.0,
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
            Goal {
                id: "query".into(),
                predicate: "query".into(),
                value: "Burglary".into(),
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
    bench_breed!(group, "htn_planning", HtnPlanning);
    bench_breed!(group, "csp_ac3", CspAc3);
    bench_breed!(group, "default_logic", DefaultLogic);
    bench_breed!(group, "ltl_monitor", LtlMonitor);
    bench_breed!(group, "allen_temporal", AllenTemporal);
    bench_breed!(group, "fuzzy_logic", FuzzyLogic);
    bench_breed!(group, "bayesian_network", BayesianNetwork);
    bench_breed!(group, "dempster_shafer", DempsterShafer);

    let mut fi_input = input.clone();
    fi_input.intent = "resolve widget_a weight".to_string();
    fi_input.facts.push(Fact { key: "frame:widget_a:isa".into(), value: "widget".into() });
    fi_input.facts.push(Fact { key: "frame:widget:slot:weight:default".into(), value: "10kg".into() });
    fi_input.facts.push(Fact { key: "frame:widget_a:slot:weight".into(), value: "5kg".into() });
    group.bench_function("frames_inheritance", |b| b.iter(|| FramesInheritance.run(black_box(&fi_input))));

    let mut ebl_input_obj = input.clone();
    ebl_input_obj.facts.push(Fact { key: "has_handle(obj1)".into(), value: "true".into() });
    ebl_input_obj.facts.push(Fact { key: "concave(obj1)".into(), value: "true".into() });
    ebl_input_obj.rules.push(Rule {
        id: "r1_ebl".into(),
        premise: vec!["cup(?x)".into()],
        conclusion: "drinkable(?x)".into(),
        certainty: 1.0,
    });
    ebl_input_obj.rules.push(Rule {
        id: "r2_ebl".into(),
        premise: vec!["has_handle(?y)".into(), "concave(?y)".into()],
        conclusion: "cup(?y)".into(),
        certainty: 1.0,
    });
    ebl_input_obj.goals = vec![Goal {
        id: "g1".into(),
        predicate: "drinkable(obj1)".into(),
        value: "true".into(),
    }];
    group.bench_function("ebl", |b| b.iter(|| Ebl.run(black_box(&ebl_input_obj))));

    group.finish();
}

criterion_group!(benches, bench_breeds);
criterion_main!(benches);
