//! Static per-breed lifecycle models for the P5 tier (triz).
//! Trace kinds match what each breed's `run()` actually emits.

use super::{BreedLifecycleModel, LifecyclePhase};

/// TRIZ: per (improving, worsening) pair, emit exactly one of
/// physical-contradiction | technical-contradiction | no-matrix-entry.
/// Pairs interleave freely, so all three kinds share one unbounded phase;
/// `postconditions` requires a non-empty trace, hence min 1.
pub static TRIZ_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "triz",
    phases: &[LifecyclePhase {
        name: "resolve-contradiction",
        kinds: &[
            "physical-contradiction",
            "technical-contradiction",
            "no-matrix-entry",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Morphological (Zwicky GMA): define-parameter+ → compute-field-size →
/// cca-assess* (only when exclusion judgments exist) → synthesize-solution-space.
pub static MORPHOLOGICAL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "morphological",
    phases: &[
        LifecyclePhase {
            name: "define",
            kinds: &["define-parameter"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "field-size",
            kinds: &["compute-field-size"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "cca",
            kinds: &["cca-assess"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "synthesize",
            kinds: &["synthesize-solution-space"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// OCPM route discoverer: process-event+ → discover-route+ → discover-route-empty?.
/// `discover-route-empty` is emitted only when no events parsed (degenerate input).
pub static OCPM_ROUTE_DISCOVERER_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "ocpm_route_discoverer",
    phases: &[
        LifecyclePhase {
            name: "process",
            kinds: &["process-event"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "discover",
            kinds: &["discover-route"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "empty",
            kinds: &["discover-route-empty"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};
