//! Static per-breed lifecycle models for the P4 tier (tableaux,
//! construction_grammar, markov_logic, pomdp, contingent_plan,
//! meta_reasoning). Trace kinds match the P4 plan table exactly.

use super::{BreedLifecycleModel, LifecyclePhase};

/// Tableaux: parse-formula → sign-root → {alpha,beta,close,open}+ → verdict.
pub static TABLEAUX_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "tableaux",
    phases: &[
        LifecyclePhase {
            name: "parse",
            kinds: &["parse-formula"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "sign",
            kinds: &["sign-root"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "expand",
            kinds: &["alpha-expand", "beta-expand", "close-branch", "open-branch"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "verdict",
            kinds: &["verdict"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Construction grammar: tokenize → pos-tag+ → chunk+ → match+ → bind* → fuse.
pub static CONSTRUCTION_GRAMMAR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "construction_grammar",
    phases: &[
        LifecyclePhase {
            name: "tokenize",
            kinds: &["tokenize"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "pos-tag",
            kinds: &["pos-tag"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "chunk",
            kinds: &["chunk"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "match",
            kinds: &["match-construction"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "bind",
            kinds: &["bind-slot"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fuse",
            kinds: &["fuse-meaning"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Markov logic: ground → clamp → init → flip*/restart* → map-found.
pub static MARKOV_LOGIC_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "markov_logic",
    phases: &[
        LifecyclePhase {
            name: "ground",
            kinds: &["ground-clauses"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "clamp",
            kinds: &["clamp-evidence"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "init",
            kinds: &["init-assignment"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "search",
            kinds: &["flip", "restart"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "map",
            kinds: &["map-found"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// POMDP: parse → init-belief → belief-update* → expand → pbvi-backup+ → select.
pub static POMDP_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "pomdp",
    phases: &[
        LifecyclePhase {
            name: "parse",
            kinds: &["parse-model"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "init",
            kinds: &["init-belief"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "filter",
            kinds: &["belief-update"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "expand",
            kinds: &["expand-belief-points"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "backup",
            kinds: &["pbvi-backup"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "select",
            kinds: &["select-action"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Contingent planning: init-belief → search+ → plan-complete.
pub static CONTINGENT_PLAN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "contingent_plan",
    phases: &[
        LifecyclePhase {
            name: "init",
            kinds: &["init-belief"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "search",
            kinds: &["or-expand", "sense-branch", "and-join", "goal-reached"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "complete",
            kinds: &["plan-complete"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};

/// Meta-reasoning: ingest-report+ → conflict-detected* → vote+ → resolve.
pub static META_REASONING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "meta_reasoning",
    phases: &[
        LifecyclePhase {
            name: "ingest",
            kinds: &["ingest-report"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "conflicts",
            kinds: &["conflict-detected"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "vote",
            kinds: &["vote"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "resolve",
            kinds: &["resolve"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
    ],
};
