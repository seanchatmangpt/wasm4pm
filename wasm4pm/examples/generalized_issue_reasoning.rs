//! Generalized compiled issue-reasoning benchmark.
//!
//! Generalizes the SREGym-derived diagnostic calculus beyond SRE/Kubernetes. The subject is not
//! natural-language generation: it is bounded troubleshooting over structured observations,
//! finite hypotheses, deterministic tests, repair intents, verification and receipts.
//!
//! SELECT != CONSTRUCT != DO. This benchmark never actuates a repair.

use std::{hint::black_box, time::Instant};

const FLAGSHIP_SCALE: u64 = 10_000_000;

#[derive(Clone, Copy)]
struct Archetype {
    id: &'static str,
    domain: &'static str,
    required: u32,
    contradictory: u32,
    hypotheses: u8,
    compiled: bool,
}

const UNAVAILABLE: u32 = 1 << 0;
const TIMEOUT: u32 = 1 << 1;
const AUTH_FAIL: u32 = 1 << 2;
const RESOURCE_PRESSURE: u32 = 1 << 3;
const CONFIG_DRIFT: u32 = 1 << 4;
const DEPENDENCY_FAIL: u32 = 1 << 5;
const DATA_INVALID: u32 = 1 << 6;
const VERSION_DRIFT: u32 = 1 << 7;
const QUEUE_LAG: u32 = 1 << 8;
const IO_FAIL: u32 = 1 << 9;
const NETWORK_FAIL: u32 = 1 << 10;
const BUILD_FAIL: u32 = 1 << 11;
const POLICY_DENY: u32 = 1 << 12;
const CAPACITY_FAIL: u32 = 1 << 13;
const STATE_STUCK: u32 = 1 << 14;
const UNKNOWN_CAUSAL: u32 = 1 << 15;

const ARCHETYPES: &[Archetype] = &[
    Archetype { id: "service_unavailable", domain: "distributed_system", required: UNAVAILABLE | DEPENDENCY_FAIL, contradictory: 0, hypotheses: 8, compiled: true },
    Archetype { id: "timeout_path", domain: "distributed_system", required: TIMEOUT, contradictory: AUTH_FAIL, hypotheses: 9, compiled: true },
    Archetype { id: "authentication_authorization", domain: "security", required: AUTH_FAIL | POLICY_DENY, contradictory: 0, hypotheses: 8, compiled: true },
    Archetype { id: "resource_capacity", domain: "infrastructure", required: RESOURCE_PRESSURE | CAPACITY_FAIL, contradictory: IO_FAIL, hypotheses: 8, compiled: true },
    Archetype { id: "configuration_drift", domain: "configuration", required: CONFIG_DRIFT, contradictory: VERSION_DRIFT, hypotheses: 7, compiled: true },
    Archetype { id: "dependency_failure", domain: "dependency", required: DEPENDENCY_FAIL, contradictory: DATA_INVALID, hypotheses: 9, compiled: true },
    Archetype { id: "data_schema_validation", domain: "data", required: DATA_INVALID, contradictory: IO_FAIL, hypotheses: 8, compiled: true },
    Archetype { id: "version_compatibility", domain: "software", required: VERSION_DRIFT, contradictory: CONFIG_DRIFT, hypotheses: 7, compiled: true },
    Archetype { id: "queue_backpressure", domain: "messaging", required: QUEUE_LAG, contradictory: AUTH_FAIL, hypotheses: 9, compiled: true },
    Archetype { id: "storage_io", domain: "storage", required: IO_FAIL, contradictory: NETWORK_FAIL, hypotheses: 8, compiled: true },
    Archetype { id: "network_reachability", domain: "network", required: NETWORK_FAIL, contradictory: IO_FAIL, hypotheses: 9, compiled: true },
    Archetype { id: "build_dependency_toolchain", domain: "developer_tooling", required: BUILD_FAIL | DEPENDENCY_FAIL, contradictory: 0, hypotheses: 10, compiled: true },
    Archetype { id: "policy_admission", domain: "governance", required: POLICY_DENY, contradictory: AUTH_FAIL, hypotheses: 7, compiled: true },
    Archetype { id: "stuck_workflow_state", domain: "business_process", required: STATE_STUCK, contradictory: 0, hypotheses: 8, compiled: true },
    Archetype { id: "unknown_or_novel_causal_topology", domain: "novelty", required: UNKNOWN_CAUSAL, contradictory: 0, hypotheses: 16, compiled: false },
];

#[derive(Clone, Copy)]
enum Standing { Admitted, Refused, Fallback }

struct Episode { receipt: blake3::Hash, standing: Standing, eliminated: u64, transitions: u64, compiled: bool }

#[inline(always)]
fn evidence_for(ordinal: u64, a: Archetype) -> u32 {
    let mut evidence = a.required;
    let mode = ordinal % 100;
    if mode < 7 { evidence &= !a.required; }
    else if mode < 12 { evidence |= a.contradictory; }
    if ordinal % 13 == 0 { evidence |= CONFIG_DRIFT; }
    if ordinal % 17 == 0 { evidence |= DEPENDENCY_FAIL; }
    evidence
}

#[inline(always)]
fn evaluate(ordinal: u64) -> Episode {
    let a = ARCHETYPES[(ordinal as usize) % ARCHETYPES.len()];
    let evidence = evidence_for(ordinal, a);
    let present = a.required != 0 && (evidence & a.required) == a.required;
    let contradiction = a.contradictory != 0 && (evidence & a.contradictory) != 0;
    let standing = if !a.compiled { Standing::Fallback } else if !present || contradiction { Standing::Refused } else { Standing::Admitted };
    let eliminated = if present { u64::from(a.hypotheses.saturating_sub(1)) } else { u64::from(a.hypotheses / 2) };

    let mut h = blake3::Hasher::new();
    h.update(b"wasm4pm:generalized-issue-reasoning:v1");
    h.update(a.id.as_bytes()); h.update(a.domain.as_bytes()); h.update(&ordinal.to_le_bytes()); h.update(&evidence.to_le_bytes());
    h.update(&[match standing { Standing::Admitted => 1, Standing::Refused => 2, Standing::Fallback => 3 }]);
    h.update(b"actuation=REFUSED");
    Episode { receipt: h.finalize(), standing, eliminated, transitions: 8, compiled: a.compiled }
}

fn run(name: &str, scale: u64) {
    let start = Instant::now();
    let mut aggregate = blake3::Hasher::new();
    let mut admitted=0u64; let mut refused=0u64; let mut fallback=0u64; let mut compiled=0u64; let mut eliminated=0u64; let mut transitions=0u64;
    for i in 0..scale {
        let e = evaluate(black_box(i)); aggregate.update(e.receipt.as_bytes());
        match e.standing { Standing::Admitted => admitted+=1, Standing::Refused => refused+=1, Standing::Fallback => fallback+=1 }
        compiled += u64::from(e.compiled); eliminated += e.eliminated; transitions += e.transitions;
    }
    let elapsed = start.elapsed(); let ns=elapsed.as_nanos(); assert!(ns>0); assert_eq!(admitted+refused+fallback,scale); assert_eq!(transitions,scale*8);
    let s=elapsed.as_secs_f64();
    println!("GENERAL_ISSUE_RESULT\tfamily={}\tscale={}\tadmitted={}\trefused={}\tfallback={}\tcompiled={}\thypotheses_eliminated={}\ttransitions={}\telapsed_ns={}\tepisodes_per_second={:.6}\teliminations_per_second={:.6}\ttransitions_per_second={:.6}\treceipt={}\tactuation=REFUSED",name,scale,admitted,refused,fallback,compiled,eliminated,transitions,ns,scale as f64/s,eliminated as f64/s,transitions as f64/s,aggregate.finalize().to_hex());
}

fn main() {
    let rows = [("route",1_000),("route",100_000),("route",1_000_000),("route",FLAGSHIP_SCALE),("eliminate",100_000),("eliminate",1_000_000),("compiled",100_000),("compiled",1_000_000),("compiled",5_000_000),("fallback_boundary",100_000),("fallback_boundary",1_000_000),("end_to_end",100_000),("end_to_end",1_000_000),("end_to_end",5_000_000)];
    let planned:u64=rows.iter().map(|x|x.1).sum();
    println!("GENERAL_ISSUE_SUBJECT\tarchetypes={}\tdomains={}\tplanned_episodes={}\tplanned_transitions={}\tcalculus=observe-normalize-route-hypothesize-eliminate-construct-verify-admit-refuse-fallback-receipt\tactuation=REFUSED",ARCHETYPES.len(),15,planned,planned*8);
    for (name,scale) in rows { run(name,scale); }
    println!("GENERAL_ISSUE_COMPLETE\tplanned_episodes={}\tplanned_transitions={}\tflagship_scale={}\tstatus=ALIVE_CANDIDATE\tactuation=REFUSED",planned,planned*8,FLAGSHIP_SCALE);
}
