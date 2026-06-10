//! Static per-breed lifecycle models for the P1 tier (10 symbolic-reasoning
//! breeds). Phase kinds mirror each breed's documented trace-kind contract.

use super::{BreedLifecycleModel, LifecyclePhase};

/// LTL monitor: ltl-init(1,1) → ltl-progress(1,*) → ltl-verdict(1,1).
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
            min_occurrences: 1,
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

/// Allen temporal: allen-load(1,*) → allen-compose(0,*) → allen-verdict(1,1).
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
            name: "compose",
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

/// Fuzzy logic: fuzzify(1,*) → fire(1,*) → aggregate(1,*) → defuzz(1,1).
pub static FUZZY_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "fuzzy_logic",
    phases: &[
        LifecyclePhase {
            name: "fuzzify",
            kinds: &["fuzzy-fuzzify"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fire",
            kinds: &["fuzzy-fire"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "aggregate",
            kinds: &["fuzzy-aggregate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "defuzz",
            kinds: &["fuzzy-defuzz"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Bayesian network: load-cpt(1,*) → observe(0,*) → eliminate(0,*) → verdict(1,1).
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

/// CSP AC-3: init(1,1) → {revise,assign,backtrack}(0,*) → verdict(1,1).
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
            name: "search",
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

/// Default logic: load(1,1) → {fire,block}(1,*) → extension(1,1).
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
            name: "apply",
            kinds: &["default-fire", "default-block"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "extension",
            kinds: &["default-extension"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// HTN planning: {decompose,apply,backtrack}(1,*) → plan(1,1).
pub static HTN_PLANNING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "htn_planning",
    phases: &[
        LifecyclePhase {
            name: "decompose",
            kinds: &["htn-decompose", "htn-apply", "htn-backtrack"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "plan",
            kinds: &["htn-plan"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Dempster–Shafer: load-bpa(1,1) → combine(0,*) → belief(1,1).
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

/// Frames inheritance: load(1,1) → walk(1,*) → resolve(1,1).
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
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "resolve",
            kinds: &["frame-resolve"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// EBL: explain(1,*) → generalize(1,*) → operationalize(1,1).
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
            min_occurrences: 1,
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
