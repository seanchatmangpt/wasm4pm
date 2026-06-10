use super::{BreedLifecycleModel, LifecyclePhase};

/// Abductive IBE lifecycle
pub static ABDUCTIVE_IBE_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "abductive_ibe",
    phases: &[
        LifecyclePhase {
            name: "collect-observations",
            kinds: &["collect-observations"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "scoring",
            kinds: &["score-hypothesis", "compare"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "best-explanation",
            kinds: &["best-explanation"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Partial Order Plan lifecycle
pub static PARTIAL_ORDER_PLAN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "partial_order_plan",
    phases: &[
        LifecyclePhase {
            name: "init-plan",
            kinds: &["init-plan"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "planning",
            kinds: &["open-condition", "add-link", "add-step", "detect-threat", "promote", "demote", "backtrack"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "plan-complete",
            kinds: &["plan-complete"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Event Calculus lifecycle
pub static EVENT_CALCULUS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "event_calculus",
    phases: &[
        LifecyclePhase {
            name: "load-narrative",
            kinds: &["load-narrative"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "evaluation",
            kinds: &["evaluate-happens", "clipped-check", "holdsat-verdict"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "answer",
            kinds: &["answer"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
