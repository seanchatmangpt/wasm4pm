use super::{BreedLifecycleModel, LifecyclePhase};

/// ASP lifecycle: ground(1,1) -> guess-candidate(1,*) -> reduct(0,*) -> least-model(0,*)
/// -> stable(0..* in stable-accept|stable-reject) -> answer-set(1,1)
pub static ASP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "asp",
    phases: &[
        LifecyclePhase {
            name: "ground",
            kinds: &["ground"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "guess",
            kinds: &["guess-candidate"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "reduct",
            kinds: &["reduct"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "least-model",
            kinds: &["least-model"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "stable",
            kinds: &["stable-accept", "stable-reject"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "answer-set",
            kinds: &["answer-set"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
    allowed_unknown_kinds: &[],
};

/// Description Logic lifecycle: normalize -> apply-cr{1..4}* -> fixpoint -> classify-verdict*
pub static DESCRIPTION_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "description_logic",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["normalize"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "rules",
            kinds: &["apply-cr1", "apply-cr2", "apply-cr3", "apply-cr4"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fixpoint",
            kinds: &["fixpoint"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["classify-verdict"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
    ],
    allowed_unknown_kinds: &[],
};

/// Abductive LP lifecycle: load-abducibles -> candidate-delta* -> explain-accept/reject* -> minimal-set
pub static ABDUCTIVE_LP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_lp",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["load-abducibles"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "abduce",
            kinds: &["candidate-delta", "derive"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["explain-accept", "explain-reject"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "summary",
            kinds: &["minimal-set"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
    allowed_unknown_kinds: &[],
};

/// Abductive IBE lifecycle: collect-observations -> score-hypothesis* -> compare* -> best-explanation
pub static ABDUCTIVE_IBE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_ibe",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["collect-observations"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "scoring",
            kinds: &["score-hypothesis"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "compare",
            kinds: &["compare"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "select",
            kinds: &["best-explanation"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
    allowed_unknown_kinds: &[],
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
    allowed_unknown_kinds: &["detect-threat", "promote"],
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
    allowed_unknown_kinds: &["ec-verdict"],
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
    allowed_unknown_kinds: &[],
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
    allowed_unknown_kinds: &[],
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
    allowed_unknown_kinds: &[],
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
    allowed_unknown_kinds: &["load-model"],
};

/// Script SAM lifecycle: select-script+ -> align-event* -> bind-role* -> infer-gap* -> summary
pub static SCRIPT_SAM_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "script_sam",
    phases: &[
        LifecyclePhase {
            name: "select",
            kinds: &["select-script"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "align",
            kinds: &["align-event"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "bind",
            kinds: &["bind-role"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "infer",
            kinds: &["infer-gap"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "summary",
            kinds: &["summary"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
    allowed_unknown_kinds: &[],
};

/// CLP lifecycle: post-constraint(0,*) -> propagate(0,*) -> solution(0,1)
pub static CLP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "clp",
    phases: &[
        LifecyclePhase {
            name: "post-constraint",
            kinds: &["post-constraint"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "propagate",
            kinds: &["propagate"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "solution",
            kinds: &["solution"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
    allowed_unknown_kinds: &[],
};
