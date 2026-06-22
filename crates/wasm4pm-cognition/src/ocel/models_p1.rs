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

/// Allen Temporal lifecycle: allen-load* -> allen-compose* -> allen-verdict
pub static ALLEN_TEMPORAL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "allen_temporal",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["allen-load"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "propagation",
            kinds: &["allen-compose"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["allen-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Fuzzy Logic lifecycle: fuzzy-fuzzify* -> fuzzy-fire* -> fuzzy-aggregate* -> fuzzy-defuzz*
pub static FUZZY_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "fuzzy_logic",
    phases: &[
        LifecyclePhase {
            name: "fuzzification",
            kinds: &["fuzzy-fuzzify"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "rules-evaluation",
            kinds: &["fuzzy-fire"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "aggregation",
            kinds: &["fuzzy-aggregate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "defuzzification",
            kinds: &["fuzzy-defuzz"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Bayesian Network lifecycle: bn-load-cpt* -> bn-observe* -> bn-eliminate* -> bn-verdict
pub static BAYESIAN_NETWORK_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "bayesian_network",
    phases: &[
        LifecyclePhase {
            name: "load-cpt",
            kinds: &["bn-load-cpt"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "observe",
            kinds: &["bn-observe"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "eliminate",
            kinds: &["bn-eliminate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["bn-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// HTN Planning lifecycle: decompose/apply/backtrack* -> plan
pub static HTN_PLANNING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "htn_planning",
    phases: &[LifecyclePhase {
        name: "planning",
        kinds: &[
            "htn-decompose",
            "htn-apply",
            "htn-backtrack",
            "htn-plan",
            "decision",
            "no-plan-found",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
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

/// CSP AC-3 lifecycle: csp-init -> csp-revise/csp-assign/csp-backtrack* -> csp-verdict
pub static CSP_AC3_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "csp_ac3",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["csp-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "propagation",
            kinds: &["csp-revise", "csp-assign", "csp-backtrack"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["csp-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Default Logic lifecycle: default-load -> default-block/default-fire* -> default-extension
pub static DEFAULT_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "default_logic",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["default-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "reasoning",
            kinds: &["default-block", "default-fire"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["default-extension"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Frames Inheritance lifecycle: frame-load -> frame-walk* -> frame-resolve
pub static FRAMES_INHERITANCE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "frames_inheritance",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["frame-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "walk",
            kinds: &["frame-walk"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "resolve",
            kinds: &["frame-resolve"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// EBL lifecycle: ebl-explain+ -> ebl-generalize* -> ebl-operationalize
pub static EBL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ebl",
    phases: &[
        LifecyclePhase {
            name: "explain",
            kinds: &["ebl-explain"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "generalize",
            kinds: &["ebl-generalize"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "operationalize",
            kinds: &["ebl-operationalize"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
