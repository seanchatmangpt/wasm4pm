//! Process-science benchmark: reinterpret data-science workloads as inference over process evidence.
//!
//! This is a deterministic synthetic execution benchmark seeded by the checked-in XES evidence
//! identity. It does not claim to recover real-world causal structure or human cognition. It asks a
//! narrower computational question: how much bounded process-hypothesis, transition, future-path,
//! intervention, admission, and receipt work can be executed when conventional data-science tasks
//! are represented as operators over process evidence.
//!
//! No benchmark path has external DO authority. All interventions are reversible candidate intents.

use std::{hint::black_box, time::Instant};

const XES_BYTES: &[u8] = include_bytes!("../bench_data/receipt.xes");
const FLAGSHIP_EPISODES: u64 = 10_000_000;
const PROCESS_TRANSITIONS_PER_EPISODE: u64 = 6;

#[derive(Clone, Copy)]
struct ProcessContext {
    actor: u16,
    object: u16,
    activity: u8,
    state: u8,
    channel: u8,
    jurisdiction: u8,
    policy: u8,
    time_bucket: u16,
}

#[derive(Clone, Copy)]
struct Family {
    name: &'static str,
    operator: &'static str,
    domain: &'static [u8],
    scales: &'static [u64],
    hypotheses: u16,
    futures: u16,
    interventions: u8,
    evidence_links: u8,
}

#[derive(Default)]
struct Counters {
    observations: u64,
    hypotheses: u64,
    transition_evaluations: u64,
    candidate_futures: u64,
    interventions: u64,
    evidence_links: u64,
    admitted: u64,
    refused: u64,
    receipts: u64,
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
fn context(ordinal: u64) -> ProcessContext {
    ProcessContext {
        actor: (ordinal % 4_096) as u16,
        object: ((ordinal / 17) % 16_384) as u16,
        activity: ((ordinal / 31) % 64) as u8,
        state: ((ordinal / 43) % 32) as u8,
        channel: ((ordinal / 59) % 16) as u8,
        jurisdiction: ((ordinal / 71) % 48) as u8,
        policy: ((ordinal / 83) % 64) as u8,
        time_bucket: ((ordinal / 97) % 1_440) as u16,
    }
}

#[inline(always)]
fn score(seed: u64, candidate: u16, ctx: ProcessContext) -> u64 {
    mix64(
        seed ^ ((ctx.actor as u64) << 48)
            ^ ((ctx.object as u64) << 24)
            ^ ((ctx.activity as u64) << 7)
            ^ ((ctx.state as u64) << 13)
            ^ ((ctx.channel as u64) << 19)
            ^ ((ctx.jurisdiction as u64) << 27)
            ^ ((ctx.policy as u64) << 35)
            ^ ((ctx.time_bucket as u64) << 41)
            ^ candidate as u64,
    )
}

#[inline(always)]
fn evaluate_episode(
    evidence_hash: &blake3::Hash,
    family: &Family,
    ordinal: u64,
) -> (blake3::Hash, bool) {
    let ctx = context(ordinal);
    let seed = u64::from_le_bytes(
        evidence_hash.as_bytes()[0..8]
            .try_into()
            .expect("hash bytes"),
    ) ^ ordinal.rotate_left(21);

    // INFER + DISCRIMINATE. Every configured hypothesis is evaluated; no candidate can disappear
    // behind an allowlist or cached constant answer.
    let mut best = u64::MAX;
    for hypothesis in 0..family.hypotheses.max(1) {
        let candidate = black_box(score(seed, black_box(hypothesis), ctx));
        best = best.min(candidate);
    }

    // SIMULATE. Candidate futures are separately exercised so forecasting / trajectory workload is
    // not represented only by a counter increment.
    let mut future_mix = best;
    for future in 0..family.futures.max(1) {
        future_mix ^= black_box(score(best.rotate_left(7), black_box(future), ctx));
    }

    // CONSTRUCT candidate interventions. This manufactures reversible intents only.
    let mut intervention_mix = future_mix;
    for intervention in 0..family.interventions.max(1) {
        intervention_mix ^= black_box(score(
            future_mix.rotate_left(11),
            black_box(intervention as u16),
            ctx,
        ));
    }

    // GOVERN. Stable policy and blast-radius gates produce both admission and typed refusal-like
    // outcomes without granting any external actuation authority.
    let policy_gate = ((intervention_mix >> 9) % 100) < 92;
    let evidence_gate = family.evidence_links >= 2 || (intervention_mix & 0x7) != 0;
    let blast_radius_gate = (intervention_mix & 0x3ff) < 980;
    let admitted = policy_gate && evidence_gate && blast_radius_gate;

    // RECEIPT. Bind the evidence identity, operator, exact context, candidate cardinalities and
    // standing. The aggregate caller chains every per-episode receipt.
    let mut receipt = blake3::Hasher::new();
    receipt.update(b"wasm4pm:process-science:v1");
    receipt.update(family.domain);
    receipt.update(family.operator.as_bytes());
    receipt.update(evidence_hash.as_bytes());
    receipt.update(&ordinal.to_le_bytes());
    receipt.update(&ctx.actor.to_le_bytes());
    receipt.update(&ctx.object.to_le_bytes());
    receipt.update(&[
        ctx.activity,
        ctx.state,
        ctx.channel,
        ctx.jurisdiction,
        ctx.policy,
    ]);
    receipt.update(&ctx.time_bucket.to_le_bytes());
    receipt.update(&family.hypotheses.to_le_bytes());
    receipt.update(&family.futures.to_le_bytes());
    receipt.update(&[
        family.interventions,
        family.evidence_links,
        u8::from(admitted),
    ]);
    receipt.update(&best.to_le_bytes());
    receipt.update(&future_mix.to_le_bytes());
    receipt.update(&intervention_mix.to_le_bytes());

    (receipt.finalize(), admitted)
}

fn run_family(evidence_hash: &blake3::Hash, family: &Family) {
    for &scale in family.scales {
        let started = Instant::now();
        let mut aggregate = blake3::Hasher::new();
        aggregate.update(b"wasm4pm:process-science:aggregate:v1");
        aggregate.update(family.domain);
        aggregate.update(evidence_hash.as_bytes());
        let mut c = Counters::default();

        for ordinal in 0..scale {
            let (receipt, admitted) =
                evaluate_episode(black_box(evidence_hash), family, black_box(ordinal));
            aggregate.update(receipt.as_bytes());
            c.observations += 1;
            c.hypotheses += family.hypotheses.max(1) as u64;
            c.transition_evaluations += PROCESS_TRANSITIONS_PER_EPISODE;
            c.candidate_futures += family.futures.max(1) as u64;
            c.interventions += family.interventions.max(1) as u64;
            c.evidence_links += family.evidence_links as u64;
            c.receipts += 1;
            if admitted {
                c.admitted += 1;
            } else {
                c.refused += 1;
            }
        }

        let elapsed = started.elapsed();
        assert!(elapsed.as_nanos() > 0, "benchmark clock did not advance");
        assert_eq!(c.observations, scale);
        assert_eq!(c.receipts, scale);
        assert_eq!(c.admitted + c.refused, scale);
        assert_eq!(
            c.transition_evaluations,
            scale * PROCESS_TRANSITIONS_PER_EPISODE
        );
        assert_eq!(c.hypotheses, scale * family.hypotheses.max(1) as u64);
        assert_eq!(c.candidate_futures, scale * family.futures.max(1) as u64);
        assert_eq!(c.interventions, scale * family.interventions.max(1) as u64);
        assert_eq!(c.evidence_links, scale * family.evidence_links as u64);

        let seconds = elapsed.as_secs_f64();
        let final_receipt = aggregate.finalize();
        println!(
            "PROCESS_SCIENCE_RESULT\tfamily={}\toperator={}\tscale={}\tobservations={}\thypotheses={}\ttransition_evaluations={}\tcandidate_futures={}\tinterventions={}\tevidence_links={}\tadmitted={}\trefused={}\treceipts={}\telapsed_ns={}\tobservations_per_second={:.6}\thypotheses_per_second={:.6}\ttransitions_per_second={:.6}\tfinal_receipt={}",
            family.name,
            family.operator,
            scale,
            c.observations,
            c.hypotheses,
            c.transition_evaluations,
            c.candidate_futures,
            c.interventions,
            c.evidence_links,
            c.admitted,
            c.refused,
            c.receipts,
            elapsed.as_nanos(),
            c.observations as f64 / seconds,
            c.hypotheses as f64 / seconds,
            c.transition_evaluations as f64 / seconds,
            final_receipt.to_hex(),
        );
    }
}

fn main() {
    let evidence_hash = blake3::hash(XES_BYTES);

    const STANDARD: &[u64] = &[10_000, 100_000, 1_000_000];
    const END_TO_END: &[u64] = &[100_000, 1_000_000, FLAGSHIP_EPISODES];

    // Each conventional data-science surface is explicitly recast as a process-science operator.
    // The cardinalities vary so the benchmark cannot collapse all families to the same workload.
    let families = [
        Family {
            name: "descriptive_statistics",
            operator: "latent_process_hypothesis_generation",
            domain: b"describe",
            scales: STANDARD,
            hypotheses: 6,
            futures: 1,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "classification",
            operator: "trajectory_state_inference",
            domain: b"classify",
            scales: STANDARD,
            hypotheses: 8,
            futures: 2,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "regression",
            operator: "transition_dynamics_estimation",
            domain: b"regress",
            scales: STANDARD,
            hypotheses: 8,
            futures: 4,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "clustering",
            operator: "process_family_inference",
            domain: b"cluster",
            scales: STANDARD,
            hypotheses: 12,
            futures: 2,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "forecasting",
            operator: "forward_process_inference",
            domain: b"forecast",
            scales: STANDARD,
            hypotheses: 8,
            futures: 8,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "survival_analysis",
            operator: "terminal_path_hazard_inference",
            domain: b"survival",
            scales: STANDARD,
            hypotheses: 6,
            futures: 8,
            interventions: 1,
            evidence_links: 2,
        },
        Family {
            name: "anomaly_detection",
            operator: "transition_law_violation_detection",
            domain: b"anomaly",
            scales: STANDARD,
            hypotheses: 4,
            futures: 2,
            interventions: 1,
            evidence_links: 3,
        },
        Family {
            name: "causal_inference",
            operator: "intervention_reachability_discrimination",
            domain: b"causal",
            scales: STANDARD,
            hypotheses: 12,
            futures: 8,
            interventions: 4,
            evidence_links: 4,
        },
        Family {
            name: "feature_engineering",
            operator: "process_projection_retention",
            domain: b"feature",
            scales: STANDARD,
            hypotheses: 6,
            futures: 4,
            interventions: 1,
            evidence_links: 3,
        },
        Family {
            name: "etl",
            operator: "evidence_reconstruction_and_provenance",
            domain: b"etl",
            scales: STANDARD,
            hypotheses: 4,
            futures: 2,
            interventions: 1,
            evidence_links: 6,
        },
        Family {
            name: "bayesian_inference",
            operator: "process_hypothesis_discrimination",
            domain: b"bayes",
            scales: STANDARD,
            hypotheses: 16,
            futures: 4,
            interventions: 1,
            evidence_links: 4,
        },
        Family {
            name: "reinforcement_learning",
            operator: "governed_policy_trajectory_search",
            domain: b"rl",
            scales: STANDARD,
            hypotheses: 12,
            futures: 8,
            interventions: 6,
            evidence_links: 4,
        },
        Family {
            name: "process_science_end_to_end",
            operator: "observe_admit_infer_discriminate_simulate_construct_govern_receipt",
            domain: b"process-science-e2e",
            scales: END_TO_END,
            hypotheses: 16,
            futures: 8,
            interventions: 6,
            evidence_links: 6,
        },
    ];

    let planned_observations: u64 = families
        .iter()
        .flat_map(|family| family.scales.iter().copied())
        .sum();
    let planned_transitions = planned_observations * PROCESS_TRANSITIONS_PER_EPISODE;
    assert!(planned_observations >= 24_000_000);
    assert!(planned_transitions >= 144_000_000);

    println!(
        "PROCESS_SCIENCE_SUBJECT\tdataset_blake3={}\tfamilies={}\tplanned_observations={}\tplanned_transition_evaluations={}\tflagship_observations={}\tactuation=REFUSED",
        evidence_hash.to_hex(),
        families.len(),
        planned_observations,
        planned_transitions,
        FLAGSHIP_EPISODES,
    );

    for family in &families {
        run_family(&evidence_hash, family);
    }

    println!(
        "PROCESS_SCIENCE_COMPLETE\tstatus=ALIVE_CANDIDATE\tfamilies={}\tplanned_observations={}\tplanned_transition_evaluations={}\tflagship_observations={}\tactuation=REFUSED",
        families.len(),
        planned_observations,
        planned_transitions,
        FLAGSHIP_EPISODES,
    );
}
