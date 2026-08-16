//! Forward-deployed engineer cognition benchmark.
//!
//! This is a deterministic simulation of bounded engineering cognition over deployed-enterprise
//! incident/change envelopes. It does not benchmark human thought, LLM inference, or actuation.
//! The simulated cognition graph is:
//!
//! OBSERVE -> ROUTE -> HYPOTHESIZE -> TEST -> CONSTRUCT -> VERIFY -> ADMIT/REFUSE -> RECEIPT
//!
//! Known patterns may route through a hook-like fast path, but hooks manufacture candidate intents
//! only. No benchmark path acquires DO authority or actuates an external system.

use std::{hint::black_box, time::Instant};

const XES_BYTES: &[u8] = include_bytes!("../bench_data/receipt.xes");
const FLAGSHIP_EPISODES: u64 = 10_000_000;
const COGNITION_TRANSITIONS_PER_EPISODE: u64 = 8;

#[derive(Clone, Copy)]
struct DeployedContext {
    tenant: u16,
    region: u8,
    site: u16,
    service: u16,
    incident_class: u8,
    jurisdiction: u8,
    control_family: u8,
    change_window: u8,
}

#[derive(Clone, Copy)]
struct Family {
    name: &'static str,
    domain: &'static [u8],
    scales: &'static [u64],
    hypotheses_per_episode: u16,
    force_known_pattern: bool,
}

#[derive(Default)]
struct Counters {
    episodes: u64,
    hypotheses: u64,
    known_pattern_routes: u64,
    search_routes: u64,
    admitted: u64,
    refused: u64,
    cognition_transitions: u64,
}

#[inline(always)]
fn context(ordinal: u64) -> DeployedContext {
    DeployedContext {
        tenant: (ordinal % 500) as u16,
        region: ((ordinal / 500) % 12) as u8,
        site: ((ordinal / (500 * 12)) % 2_048) as u16,
        service: ((ordinal / (500 * 12 * 2_048)) % 512) as u16,
        incident_class: ((ordinal / 17) % 32) as u8,
        jurisdiction: ((ordinal / 31) % 48) as u8,
        control_family: ((ordinal / 43) % 64) as u8,
        change_window: ((ordinal / 59) % 24) as u8,
    }
}

#[inline(always)]
fn mix64(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

#[inline(always)]
fn hypothesis_score(seed: u64, hypothesis: u16, ctx: DeployedContext) -> u64 {
    let packed = seed
        ^ ((ctx.tenant as u64) << 48)
        ^ ((ctx.site as u64) << 24)
        ^ ((ctx.service as u64) << 8)
        ^ ((ctx.incident_class as u64) << 3)
        ^ ((ctx.jurisdiction as u64) << 17)
        ^ ((ctx.control_family as u64) << 29)
        ^ ((ctx.change_window as u64) << 37)
        ^ hypothesis as u64;
    mix64(packed)
}

#[inline(always)]
fn evaluate_episode(
    evidence_hash: &blake3::Hash,
    family: &Family,
    ordinal: u64,
) -> (blake3::Hash, u16, bool, bool) {
    let ctx = context(ordinal);

    // ROUTE: deterministic known-pattern recognition. This models a compiled knowledge-hook route,
    // not ambient execution authority. Unknown patterns retain a wider search portfolio.
    let naturally_known = (ctx.incident_class as u16 + ctx.service + ctx.region as u16) % 5 != 0;
    let known_pattern = family.force_known_pattern || naturally_known;
    let portfolio = if known_pattern {
        family.hypotheses_per_episode.min(2).max(1)
    } else {
        family.hypotheses_per_episode.max(8)
    };

    // HYPOTHESIZE + TEST + CONSTRUCT + VERIFY: all candidates are reversible. The best score is
    // selected only as a candidate repair plan; no external system is touched.
    let mut best = u64::MAX;
    let seed = u64::from_le_bytes(
        evidence_hash.as_bytes()[0..8]
            .try_into()
            .expect("hash bytes"),
    ) ^ ordinal.rotate_left(17);
    for hypothesis in 0..portfolio {
        let score = black_box(hypothesis_score(seed, black_box(hypothesis), ctx));
        if score < best {
            best = score;
        }
    }

    // ADMIT/REFUSE: bounded policy/consequence gate. About 91% of candidate plans are admitted to
    // the reversible candidate set; refusal remains an ordinary measured outcome.
    let policy_gate = ((best >> 8) % 100) < 91;
    let blast_radius_gate = (best & 0x3ff) < 960;
    let admitted = policy_gate && blast_radius_gate;

    // RECEIPT binds exact evidence, family, deployed context, portfolio size and standing.
    let mut receipt = blake3::Hasher::new();
    receipt.update(b"wasm4pm:fde-cognition:v1");
    receipt.update(family.domain);
    receipt.update(evidence_hash.as_bytes());
    receipt.update(&ordinal.to_le_bytes());
    receipt.update(&ctx.tenant.to_le_bytes());
    receipt.update(&[ctx.region]);
    receipt.update(&ctx.site.to_le_bytes());
    receipt.update(&ctx.service.to_le_bytes());
    receipt.update(&[ctx.incident_class]);
    receipt.update(&[ctx.jurisdiction]);
    receipt.update(&[ctx.control_family]);
    receipt.update(&[ctx.change_window]);
    receipt.update(&portfolio.to_le_bytes());
    receipt.update(&best.to_le_bytes());
    receipt.update(&[u8::from(known_pattern), u8::from(admitted)]);

    (receipt.finalize(), portfolio, known_pattern, admitted)
}

fn run_family(evidence_hash: &blake3::Hash, family: &Family) {
    for &scale in family.scales {
        let started = Instant::now();
        let mut aggregate = blake3::Hasher::new();
        aggregate.update(b"wasm4pm:fde-cognition:aggregate:v1");
        aggregate.update(family.domain);
        aggregate.update(evidence_hash.as_bytes());
        let mut c = Counters::default();

        for ordinal in 0..scale {
            let (receipt, hypotheses, known_pattern, admitted) =
                evaluate_episode(black_box(evidence_hash), family, black_box(ordinal));
            aggregate.update(receipt.as_bytes());
            c.episodes += 1;
            c.hypotheses += hypotheses as u64;
            c.cognition_transitions += COGNITION_TRANSITIONS_PER_EPISODE;
            if known_pattern {
                c.known_pattern_routes += 1;
            } else {
                c.search_routes += 1;
            }
            if admitted {
                c.admitted += 1;
            } else {
                c.refused += 1;
            }
        }

        let elapsed = started.elapsed();
        let elapsed_ns = elapsed.as_nanos();
        assert!(elapsed_ns > 0, "benchmark clock did not advance");
        assert_eq!(c.episodes, scale);
        assert_eq!(c.known_pattern_routes + c.search_routes, scale);
        assert_eq!(c.admitted + c.refused, scale);
        assert_eq!(
            c.cognition_transitions,
            scale * COGNITION_TRANSITIONS_PER_EPISODE
        );

        let seconds = elapsed.as_secs_f64();
        let episodes_per_second = c.episodes as f64 / seconds;
        let hypotheses_per_second = c.hypotheses as f64 / seconds;
        let transitions_per_second = c.cognition_transitions as f64 / seconds;
        let final_receipt = aggregate.finalize();

        println!(
            "FDE_COGNITION_RESULT\tfamily={}\tscale={}\thypotheses={}\tknown_pattern_routes={}\tsearch_routes={}\tadmitted={}\trefused={}\tcognition_transitions={}\telapsed_ns={}\tepisodes_per_second={:.6}\thypotheses_per_second={:.6}\ttransitions_per_second={:.6}\tfinal_receipt={}",
            family.name,
            scale,
            c.hypotheses,
            c.known_pattern_routes,
            c.search_routes,
            c.admitted,
            c.refused,
            c.cognition_transitions,
            elapsed_ns,
            episodes_per_second,
            hypotheses_per_second,
            transitions_per_second,
            final_receipt.to_hex()
        );
    }
}

fn main() {
    let evidence_hash = blake3::hash(XES_BYTES);

    const TRIAGE: &[u64] = &[10_000, 100_000, 1_000_000];
    const GLOBAL: &[u64] = &[100_000, 1_000_000];
    const HOOK: &[u64] = &[100_000, 1_000_000, 5_000_000];
    const END_TO_END: &[u64] = &[100_000, 1_000_000, FLAGSHIP_EPISODES];

    let families = [
        Family {
            name: "incident_hypothesis_portfolio",
            domain: b"incident-hypothesis",
            scales: TRIAGE,
            hypotheses_per_episode: 8,
            force_known_pattern: false,
        },
        Family {
            name: "repair_plan_search",
            domain: b"repair-plan-search",
            scales: GLOBAL,
            hypotheses_per_episode: 16,
            force_known_pattern: false,
        },
        Family {
            name: "cross_site_generalization",
            domain: b"cross-site-generalization",
            scales: GLOBAL,
            hypotheses_per_episode: 12,
            force_known_pattern: false,
        },
        Family {
            name: "compiled_known_pattern_hook",
            domain: b"compiled-known-pattern-hook",
            scales: HOOK,
            hypotheses_per_episode: 1,
            force_known_pattern: true,
        },
        Family {
            name: "forward_deployed_engineer_end_to_end",
            domain: b"fde-end-to-end",
            scales: END_TO_END,
            hypotheses_per_episode: 12,
            force_known_pattern: false,
        },
    ];

    let planned_episodes: u64 = families
        .iter()
        .flat_map(|family| family.scales.iter().copied())
        .sum();
    let planned_transitions = planned_episodes * COGNITION_TRANSITIONS_PER_EPISODE;
    assert!(planned_episodes >= 20_000_000);
    assert!(planned_transitions >= 160_000_000);

    println!(
        "FDE_COGNITION_SUBJECT\tdataset_bytes={}\tdataset_blake3={}\tplanned_episodes={}\tplanned_cognition_transitions={}\ttransition_model=observe-route-hypothesize-test-construct-verify-admit-receipt\tactuation=REFUSED",
        XES_BYTES.len(),
        evidence_hash.to_hex(),
        planned_episodes,
        planned_transitions
    );

    for family in &families {
        run_family(&evidence_hash, family);
    }

    println!(
        "FDE_COGNITION_COMPLETE\tplanned_episodes={}\tplanned_cognition_transitions={}\tflagship_episodes={}\tstatus=ALIVE_CANDIDATE\tactuation=REFUSED",
        planned_episodes,
        planned_transitions,
        FLAGSHIP_EPISODES
    );
}
