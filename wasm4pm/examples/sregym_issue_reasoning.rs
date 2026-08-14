//! SREGym-derived compiled troubleshooting benchmark.
//!
//! This executable benchmarks bounded issue reasoning that can be represented as an admitted
//! diagnostic graph rather than delegated to an LLM. It is derived from the public SREGym problem
//! taxonomy at an exact upstream revision; it does not copy or execute SREGym grading logic.
//!
//! Authority boundary: every episode ends before DO. The benchmark manufactures diagnostic
//! conclusions / repair intents and receipts only; `actuation=REFUSED` is invariant.

use std::{hint::black_box, time::Instant};

const SREGYM_REPO: &str = "SREGym/SREGym";
const SREGYM_REVISION: &str = "ba07faf1a322f9b6d4a279643bb796aa2f36f64b";
const SREGYM_PROBLEM_LIST_BLOB: &str = "41f9e5d96c14be808a863cca4842cb3479863300";
const FLAGSHIP_SCALE: u64 = 10_000_000;

#[derive(Clone, Copy)]
struct Archetype {
    id: &'static str,
    required: u16,
    contradictory: u16,
    hypotheses: u8,
    compiled: bool,
}

// Evidence bits model stable troubleshooting observations, not natural-language answers.
const POD_PENDING: u16 = 1 << 0;
const RESTARTING: u16 = 1 << 1;
const NO_ENDPOINTS: u16 = 1 << 2;
const DNS_FAIL: u16 = 1 << 3;
const AUTH_FAIL: u16 = 1 << 4;
const OOM: u16 = 1 << 5;
const IO_FAIL: u16 = 1 << 6;
const CONFIG_DRIFT: u16 = 1 << 7;
const HIGH_CPU: u16 = 1 << 8;
const QUEUE_LAG: u16 = 1 << 9;
const NETWORK_LOSS: u16 = 1 << 10;
const APP_ERROR: u16 = 1 << 11;

// These archetypes are abstractions of recurring SREGym failure families. Stable invariant-driven
// classes are compiled; open-ended/metastable cases remain explicit fallback candidates.
const ARCHETYPES: &[Archetype] = &[
    Archetype {
        id: "scheduling_capacity",
        required: POD_PENDING,
        contradictory: 0,
        hypotheses: 7,
        compiled: true,
    },
    Archetype {
        id: "probe_restart_loop",
        required: RESTARTING,
        contradictory: POD_PENDING,
        hypotheses: 6,
        compiled: true,
    },
    Archetype {
        id: "service_selector_endpoint",
        required: NO_ENDPOINTS,
        contradictory: DNS_FAIL,
        hypotheses: 6,
        compiled: true,
    },
    Archetype {
        id: "dns_coredns_policy",
        required: DNS_FAIL,
        contradictory: NO_ENDPOINTS,
        hypotheses: 7,
        compiled: true,
    },
    Archetype {
        id: "rbac_or_credentials",
        required: AUTH_FAIL,
        contradictory: 0,
        hypotheses: 8,
        compiled: true,
    },
    Archetype {
        id: "resource_oom",
        required: OOM,
        contradictory: IO_FAIL,
        hypotheses: 6,
        compiled: true,
    },
    Archetype {
        id: "storage_mount_io",
        required: IO_FAIL,
        contradictory: DNS_FAIL,
        hypotheses: 8,
        compiled: true,
    },
    Archetype {
        id: "config_env_image",
        required: CONFIG_DRIFT | APP_ERROR,
        contradictory: IO_FAIL,
        hypotheses: 9,
        compiled: true,
    },
    Archetype {
        id: "cpu_saturation",
        required: HIGH_CPU,
        contradictory: POD_PENDING,
        hypotheses: 8,
        compiled: true,
    },
    Archetype {
        id: "queue_backpressure",
        required: QUEUE_LAG,
        contradictory: AUTH_FAIL,
        hypotheses: 9,
        compiled: true,
    },
    Archetype {
        id: "network_path_loss",
        required: NETWORK_LOSS,
        contradictory: OOM,
        hypotheses: 10,
        compiled: true,
    },
    Archetype {
        id: "metastable_or_unknown",
        required: HIGH_CPU | QUEUE_LAG,
        contradictory: 0,
        hypotheses: 12,
        compiled: false,
    },
];

struct Family {
    name: &'static str,
    domain: &'static [u8],
    scales: &'static [u64],
}

#[derive(Clone, Copy)]
enum Standing {
    Admitted,
    Refused,
    Fallback,
}

struct Episode {
    receipt: blake3::Hash,
    standing: Standing,
    hypotheses_eliminated: u64,
    transitions: u64,
    compiled_path: bool,
}

#[inline(always)]
fn evidence_for(ordinal: u64, archetype: Archetype) -> u16 {
    // Deterministically make most episodes complete, some contradictory, and some incomplete.
    // This exercises admission/refusal/fallback boundaries without pretending to replay real incidents.
    let mut evidence = archetype.required;
    let mode = ordinal % 100;
    if mode < 8 {
        evidence &= !archetype.required;
    } else if mode < 13 {
        evidence |= archetype.contradictory;
    }
    if ordinal % 7 == 0 {
        evidence |= APP_ERROR;
    }
    if ordinal % 11 == 0 {
        evidence |= CONFIG_DRIFT;
    }
    evidence
}

#[inline(always)]
fn evaluate_episode(family: &Family, ordinal: u64) -> Episode {
    let archetype = ARCHETYPES[(ordinal as usize) % ARCHETYPES.len()];
    let evidence = evidence_for(ordinal, archetype);

    // OBSERVE -> NORMALIZE -> ROUTE
    let required_present =
        archetype.required != 0 && (evidence & archetype.required) == archetype.required;
    let contradiction = archetype.contradictory != 0 && (evidence & archetype.contradictory) != 0;

    // HYPOTHESIZE -> ELIMINATE -> CONSTRUCT -> VERIFY -> ADMIT/REFUSE/FALLBACK -> RECEIPT
    let hypotheses = archetype.hypotheses as u64;
    let eliminated = if required_present {
        hypotheses.saturating_sub(1)
    } else {
        hypotheses / 2
    };
    let standing = if !archetype.compiled {
        Standing::Fallback
    } else if !required_present || contradiction {
        Standing::Refused
    } else {
        Standing::Admitted
    };
    let compiled_path = archetype.compiled;

    let mut candidate = blake3::Hasher::new();
    candidate.update(b"wasm4pm:sregym:troubleshooting:v1");
    candidate.update(family.domain);
    candidate.update(SREGYM_REVISION.as_bytes());
    candidate.update(SREGYM_PROBLEM_LIST_BLOB.as_bytes());
    candidate.update(archetype.id.as_bytes());
    candidate.update(&ordinal.to_le_bytes());
    candidate.update(&evidence.to_le_bytes());
    candidate.update(&[archetype.hypotheses, u8::from(compiled_path)]);
    candidate.update(&[match standing {
        Standing::Admitted => 1,
        Standing::Refused => 2,
        Standing::Fallback => 3,
    }]);
    let candidate = candidate.finalize();

    let mut receipt = blake3::Hasher::new();
    receipt.update(b"wasm4pm:sregym:receipt:v1");
    receipt.update(candidate.as_bytes());
    receipt.update(b"actuation=REFUSED");

    Episode {
        receipt: receipt.finalize(),
        standing,
        hypotheses_eliminated: eliminated,
        transitions: 8,
        compiled_path,
    }
}

fn run_family(family: &Family) {
    for &scale in family.scales {
        let started = Instant::now();
        let mut aggregate = blake3::Hasher::new();
        aggregate.update(b"wasm4pm:sregym:aggregate:v1");
        aggregate.update(family.domain);
        let mut admitted = 0_u64;
        let mut refused = 0_u64;
        let mut fallback = 0_u64;
        let mut compiled = 0_u64;
        let mut hypotheses_eliminated = 0_u64;
        let mut transitions = 0_u64;

        for ordinal in 0..scale {
            let episode = evaluate_episode(black_box(family), black_box(ordinal));
            aggregate.update(episode.receipt.as_bytes());
            match episode.standing {
                Standing::Admitted => admitted += 1,
                Standing::Refused => refused += 1,
                Standing::Fallback => fallback += 1,
            }
            compiled += u64::from(episode.compiled_path);
            hypotheses_eliminated += episode.hypotheses_eliminated;
            transitions += episode.transitions;
        }

        let elapsed = started.elapsed();
        let elapsed_ns = elapsed.as_nanos();
        assert!(elapsed_ns > 0);
        assert_eq!(admitted + refused + fallback, scale);
        assert_eq!(transitions, scale * 8);
        let seconds = elapsed.as_secs_f64();
        let final_receipt = aggregate.finalize();

        println!(
            "SREGYM_REASONING_RESULT\tfamily={}\tscale={}\tadmitted={}\trefused={}\tfallback={}\tcompiled={}\thypotheses_eliminated={}\ttransitions={}\telapsed_ns={}\tepisodes_per_second={:.6}\thypotheses_eliminated_per_second={:.6}\ttransitions_per_second={:.6}\tfinal_receipt={}\tactuation=REFUSED",
            family.name,
            scale,
            admitted,
            refused,
            fallback,
            compiled,
            hypotheses_eliminated,
            transitions,
            elapsed_ns,
            scale as f64 / seconds,
            hypotheses_eliminated as f64 / seconds,
            transitions as f64 / seconds,
            final_receipt.to_hex(),
        );
    }
}

fn main() {
    const ROUTING: &[u64] = &[1_000, 100_000, 1_000_000, FLAGSHIP_SCALE];
    const GLOBAL: &[u64] = &[100_000, 1_000_000, 5_000_000];
    const BOARD: &[u64] = &[100_000, 1_000_000];

    let families = [
        Family {
            name: "symptom_to_diagnostic_route",
            domain: b"route",
            scales: ROUTING,
        },
        Family {
            name: "hypothesis_elimination",
            domain: b"eliminate",
            scales: GLOBAL,
        },
        Family {
            name: "compiled_known_troubleshooting",
            domain: b"compiled",
            scales: GLOBAL,
        },
        Family {
            name: "llm_fallback_boundary",
            domain: b"fallback",
            scales: BOARD,
        },
        Family {
            name: "issue_reasoning_end_to_end",
            domain: b"end-to-end",
            scales: GLOBAL,
        },
    ];

    let planned_episodes: u64 = families.iter().flat_map(|f| f.scales.iter().copied()).sum();
    let planned_transitions = planned_episodes * 8;
    assert!(planned_episodes >= 30_000_000);

    let mut taxonomy = blake3::Hasher::new();
    taxonomy.update(b"wasm4pm:sregym:taxonomy:v1");
    taxonomy.update(SREGYM_REPO.as_bytes());
    taxonomy.update(SREGYM_REVISION.as_bytes());
    taxonomy.update(SREGYM_PROBLEM_LIST_BLOB.as_bytes());
    for a in ARCHETYPES {
        taxonomy.update(a.id.as_bytes());
        taxonomy.update(&a.required.to_le_bytes());
        taxonomy.update(&a.contradictory.to_le_bytes());
        taxonomy.update(&[a.hypotheses, u8::from(a.compiled)]);
    }

    println!(
        "SREGYM_REASONING_SUBJECT\tupstream_repo={}\tupstream_revision={}\tproblem_list_blob={}\tarchetypes={}\ttaxonomy_receipt={}\tplanned_episodes={}\tplanned_transitions={}\tactuation=REFUSED",
        SREGYM_REPO,
        SREGYM_REVISION,
        SREGYM_PROBLEM_LIST_BLOB,
        ARCHETYPES.len(),
        taxonomy.finalize().to_hex(),
        planned_episodes,
        planned_transitions,
    );

    for family in &families {
        run_family(family);
    }

    println!(
        "SREGYM_REASONING_COMPLETE\tplanned_episodes={}\tplanned_transitions={}\tflagship_scale={}\tstatus=ALIVE_CANDIDATE\tactuation=REFUSED",
        planned_episodes,
        planned_transitions,
        FLAGSHIP_SCALE,
    );
}
