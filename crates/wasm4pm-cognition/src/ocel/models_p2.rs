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
