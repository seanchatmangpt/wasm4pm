use super::{BreedLifecycleModel, LifecyclePhase};

/// LTL Monitor lifecycle: ltl-init -> ltl-progress* -> ltl-verdict
pub static LTL_MONITOR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ltl_monitor",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["ltl-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "progress",
            kinds: &["ltl-progress"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["ltl-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Allen Temporal lifecycle: init -> propagate* -> inconsistent?
pub static ALLEN_TEMPORAL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "allen_temporal",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "propagation",
            kinds: &["propagate", "inconsistent"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Fuzzy Logic lifecycle: fuzzify -> fire-rule* -> defuzzify*
pub static FUZZY_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "fuzzy_logic",
    phases: &[
        LifecyclePhase {
            name: "fuzzification",
            kinds: &["fuzzify"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "rules-evaluation",
            kinds: &["fire-rule"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "defuzzification",
            kinds: &["defuzzify"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Bayesian Network lifecycle: init -> enumerate* -> query-result
pub static BAYESIAN_NETWORK_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "bayesian_network",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "enumeration",
            kinds: &["enumerate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "query-result",
            kinds: &["query-result"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// HTN Planning lifecycle: decompose/apply/backtrack* -> plan
pub static HTN_PLANNING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "htn_planning",
    phases: &[
        LifecyclePhase {
            name: "planning",
            kinds: &["htn-decompose", "htn-apply", "htn-backtrack", "htn-plan", "decision", "no-plan-found"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
    ],
};



/// Dempster-Shafer lifecycle: ds-load-bpa -> ds-combine* -> ds-belief
pub static DEMPSTER_SHAFER_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "dempster_shafer",
    phases: &[
        LifecyclePhase {
            name: "load-bpa",
            kinds: &["ds-load-bpa"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "combine",
            kinds: &["ds-combine"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "belief",
            kinds: &["ds-belief"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

