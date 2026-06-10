use super::{BreedLifecycleModel, LifecyclePhase};

/// MYCIN lifecycle
pub static MYCIN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "mycin",
    phases: &[
        LifecyclePhase {
            name: "load-facts",
            kinds: &["load-fact"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fire-rules",
            kinds: &["fire-rule"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// Hearsay lifecycle: seed + post-hypothesis+
pub static HEARSAY_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "hearsay",
    phases: &[LifecyclePhase {
        name: "hypothesize",
        kinds: &[
            "seed",
            "post-hypothesis",
            "enqueue-ksar",
            "stale-ksar",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// CBR lifecycle: build-index → retrieve-candidates → score-case+ → decision?
pub static CBR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "cbr",
    phases: &[
        LifecyclePhase {
            name: "index",
            kinds: &["build-index"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "retrieve",
            kinds: &["retrieve-candidates"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "score",
            kinds: &[
                "score-case",
                "reuse-adapt",
                "revise-accept",
                "revise-reject",
                "retain-case",
            ],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// GPS lifecycle: reduce-gap / apply-operator
pub static GPS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "gps",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "reduce-gap",
            "apply-operator",
            "check-presatisfied",
            "match-goal",
            "set-goal",
            "subgoal",
            "achieve-diff",
            "decision",
            "no-plan",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// STRIPS lifecycle: subgoal/try-action/execute/iterate-depth+
pub static STRIPS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "strips",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "subgoal",
            "try-action",
            "execute",
            "iterate-depth",
            "check-presatisfied",
            "frame-axioms-loaded",
            "apply-action",
            "add-effect",
            "del-effect",
            "decision",
            "no-plan",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Prolog lifecycle: intern-fact/load-rule* → kernel-query+ → decision?
pub static PROLOG_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "prolog",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["intern-fact", "load-fact", "load-rule"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "query",
            kinds: &[
                "kernel-query",
                "unify",
                "sld-step",
                "match-rule",
                "bind-var",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// SOAR lifecycle: evaluate-single/prohibit/veto/dominate/impasse (preference evaluation)
pub static SOAR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "soar",
    phases: &[LifecyclePhase {
        name: "evaluate",
        kinds: &[
            "evaluate-single",
            "prohibit",
            "veto-non-required",
            "dominate",
            "impasse",
            "propose-operator",
            "preference",
            "decide-operator",
            "impasse-unresolved-fallback",
            "subgoal",
            "apply-operator",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// ELIZA lifecycle: try-pattern* → match-pattern/bind-slot+
pub static ELIZA_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "eliza",
    phases: &[LifecyclePhase {
        name: "match",
        kinds: &[
            "try-pattern",
            "match-pattern",
            "bind-slot",
            "keyword-match",
            "transform",
            "reflect",
            "response",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// DENDRAL lifecycle: eliminate/survive+ (constraint-test then prune)
pub static DENDRAL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "dendral",
    phases: &[LifecyclePhase {
        name: "test",
        kinds: &[
            "eliminate",
            "survive",
            "generate-hypothesis",
            "enumerate",
            "test-hypothesis",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Neurosis lifecycle: seed-beliefs + affect-snapshot
pub static AUTOINSTINCT_NEUROSIS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_neurosis",
    phases: &[LifecyclePhase {
        name: "analyze",
        kinds: &[
            "seed-beliefs",
            "affect-snapshot",
            "analyze",
            "detect-pattern",
            "belief-update",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Vision lifecycle: observe-object / find-clear-object
pub static AUTOINSTINCT_VISION_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_vision",
    phases: &[LifecyclePhase {
        name: "perceive",
        kinds: &[
            "observe-object",
            "find-clear-object",
            "perceive",
            "segment",
            "classify",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Semantics lifecycle: init-parser + extract-act/no-act-found
pub static AUTOINSTINCT_SEMANTICS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_semantics",
    phases: &[LifecyclePhase {
        name: "parse",
        kinds: &[
            "init-parser",
            "no-act-found",
            "extract-act",
            "extract-recipient",
            "extract-source",
            "parse",
            "frame-bind",
            "atrans",
            "ptrans",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Learning lifecycle: no-plan-found | plan-step+
pub static AUTOINSTINCT_LEARNING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_learning",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "plan-step",
            "no-plan-found",
            "update-distance",
            "expand-frontier",
            "goal-reached",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};
