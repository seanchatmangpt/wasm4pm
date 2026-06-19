use super::{BreedLifecycleModel, LifecyclePhase};

/// ASP lifecycle: asp-load -> asp-solve -> asp-model*
pub static ASP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "asp",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["asp-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "solve",
            kinds: &["asp-solve"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "model",
            kinds: &["asp-model"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Description Logic lifecycle: dl-load -> dl-subsume* -> dl-consistent
pub static DESCRIPTION_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "description_logic",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["dl-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "subsume",
            kinds: &["dl-subsume"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "consistent",
            kinds: &["dl-consistent"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Abductive LP lifecycle: alp-load -> alp-abduce -> alp-hypothesis*
pub static ABDUCTIVE_LP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_lp",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["alp-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "abduce",
            kinds: &["alp-abduce"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "hypothesis",
            kinds: &["alp-hypothesis"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Abductive IBE lifecycle: ibe-load -> ibe-explain -> ibe-select
pub static ABDUCTIVE_IBE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_ibe",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["ibe-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "explain",
            kinds: &["ibe-explain"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "select",
            kinds: &["ibe-select"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Partial Order Plan lifecycle: pop-init -> pop-resolve* -> pop-plan
pub static PARTIAL_ORDER_PLAN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "partial_order_plan",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["pop-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "resolve",
            kinds: &["pop-resolve"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "plan",
            kinds: &["pop-plan"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Event Calculus lifecycle: ec-load -> ec-infer* -> ec-model
pub static EVENT_CALCULUS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "event_calculus",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["ec-load"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "infer",
            kinds: &["ec-infer"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "model",
            kinds: &["ec-model"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// MDP lifecycle: mdp-init -> mdp-iterate* -> mdp-policy
pub static MDP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "mdp",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["mdp-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "iterate",
            kinds: &["mdp-iterate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "policy",
            kinds: &["mdp-policy"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Belief Merging lifecycle: bm-enumerate -> bm-filter* -> bm-distance -> bm-aggregate -> bm-select -> bm-merge
pub static BELIEF_MERGING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "belief_merging",
    phases: &[
        LifecyclePhase {
            name: "enumerate",
            kinds: &["enumerate-worlds"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "filter",
            kinds: &["filter-ic"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "distance",
            kinds: &["distance"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "aggregate",
            kinds: &["aggregate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "select",
            kinds: &["select-min"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "merge",
            kinds: &["merged-belief"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Version Space lifecycle: vs-init -> vs-update* -> vs-verdict
pub static VERSION_SPACE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "version_space",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["vs-init"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "update",
            kinds: &["vs-update"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["vs-verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Qualitative Reasoning lifecycle: qr-limit -> qr-branch* -> qr-envision*
pub static QUALITATIVE_REASON_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "qualitative_reason",
    phases: &[
        LifecyclePhase {
            name: "limit",
            kinds: &["limit-analysis"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "branch",
            kinds: &["branch-ambiguity"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "envision",
            kinds: &["envision-state"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// Script SAM lifecycle: script-selection -> alignment-success* -> inference-bounds -> role-binding* -> gap-inference*
pub static SCRIPT_SAM_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "script_sam",
    phases: &[
        LifecyclePhase {
            name: "select",
            kinds: &["script-selection"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "align",
            kinds: &["alignment-success"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "bounds",
            kinds: &["inference-bounds"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "bind",
            kinds: &["role-binding"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "infer",
            kinds: &["gap-inference"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
    ],
};

/// CLP lifecycle: clp-init? -> clp-propagate* -> clp-revise* -> clp-assign* -> clp-backtrack* -> clp-verdict?
pub static CLP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "clp",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["clp-init"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "propagate",
            kinds: &["clp-propagate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "revise",
            kinds: &["clp-revise"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "assign",
            kinds: &["clp-assign"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "backtrack",
            kinds: &["clp-backtrack"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["clp-verdict"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};
