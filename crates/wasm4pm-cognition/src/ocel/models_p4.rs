use crate::ocel::{BreedLifecycleModel, LifecyclePhase};

/// POMDP lifecycle model.
pub const POMDP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "pomdp",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["parse-model", "init-belief"],
            min_occurrences: 2,
            max_occurrences: 2,
        },
        LifecyclePhase {
            name: "update",
            kinds: &["belief-update"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "pbvi",
            kinds: &["expand-belief-points", "pbvi-backup"],
            min_occurrences: 2,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["select-action"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Markov Logic lifecycle model.
pub const MARKOV_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "markov_logic",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["ground-clauses", "clamp-evidence", "init-assignment"],
            min_occurrences: 3,
            max_occurrences: 3,
        },
        LifecyclePhase {
            name: "search",
            kinds: &["flip", "restart"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["map-found"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
