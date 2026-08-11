//! Fortune-5-scale Challenger enterprise-architecture benchmark.
//!
//! This executable deliberately separates two different costs:
//! 1. real process-semantics manufacture from checked-in XES evidence; and
//! 2. massive evidence-bound decision-envelope evaluation over those manufactured semantics.
//!
//! The second rail is not represented as full process discovery. It measures the bounded
//! combinatorial governance/search layer that can reuse already-manufactured semantic roots.

use std::{collections::BTreeMap, hint::black_box, time::Instant};

use serde::Serialize;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::algorithms::discover_footprints_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

const KEY: &str = "concept:name";
const XES: &str = include_str!("../bench_data/receipt.xes");
const XES_BYTES: &[u8] = include_bytes!("../bench_data/receipt.xes");
const FLAGSHIP_SCALE: u64 = 10_000_000;

#[derive(Clone, Copy)]
struct Dimensions {
    region: u16,
    business_unit: u16,
    jurisdiction: u16,
    control: u16,
    policy: u16,
    operating_model: u16,
}

struct SemanticEvidence {
    dataset_hash: blake3::Hash,
    roots: Vec<blake3::Hash>,
    traces: usize,
    events: usize,
}

struct Family {
    name: &'static str,
    domain: &'static [u8],
    scales: &'static [u64],
}

fn attr(s: &str, name: &str) -> Option<String> {
    let p = format!("{}=\"", name);
    let i = s.find(&p)? + p.len();
    let j = s[i..].find('"')?;
    Some(s[i..i + j].to_owned())
}

fn real_log() -> EventLog {
    let mut log = EventLog::new();
    let mut trace: Option<Trace> = None;
    let mut event: Option<Event> = None;

    for s in XES.lines().map(str::trim) {
        if s.starts_with("<trace>") || s.starts_with("<trace ") {
            trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: vec![],
            });
        } else if s.starts_with("</trace>") {
            if let Some(t) = trace.take() {
                log.traces.push(t);
            }
        } else if s.starts_with("<event>") || s.starts_with("<event ") {
            event = Some(Event {
                attributes: BTreeMap::new(),
            });
        } else if s.starts_with("</event>") {
            if let (Some(e), Some(t)) = (event.take(), trace.as_mut()) {
                t.events.push(e);
            }
        } else if s.starts_with("<string") {
            if let (Some(k), Some(v)) = (attr(s, "key"), attr(s, "value")) {
                if let Some(e) = event.as_mut() {
                    e.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(t) = trace.as_mut() {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        } else if s.starts_with("<date") {
            if let (Some(k), Some(v), Some(e)) =
                (attr(s, "key"), attr(s, "value"), event.as_mut())
            {
                e.attributes.insert(k, AttributeValue::Date(v));
            }
        }
    }

    assert!(!log.traces.is_empty(), "receipt.xes must parse as real evidence");
    assert!(log.event_count() > 0, "receipt.xes must contain events");
    log
}

fn hash<T: Serialize>(value: &T) -> blake3::Hash {
    blake3::hash(&serde_json::to_vec(value).expect("semantic candidate serialization"))
}

fn manufacture_semantic_evidence(log: &EventLog) -> SemanticEvidence {
    let started = Instant::now();
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let mut roots = Vec::with_capacity(11);

    roots.push(hash(&discover_dfg_from_log(&admitted, KEY)));
    roots.push(hash(&discover_footprints_from_log(&admitted, KEY)));
    for threshold in [0.1_f64, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] {
        roots.push(hash(&discover_heuristic_miner_from_log(
            black_box(log),
            KEY,
            threshold,
        )));
    }

    let elapsed = started.elapsed();
    let seconds = elapsed.as_secs_f64();
    let rate = roots.len() as f64 / seconds.max(f64::MIN_POSITIVE);
    let dataset_hash = blake3::hash(XES_BYTES);

    println!(
        "DISCOVERY_RESULT\tsemantic_roots={}\ttraces={}\tevents={}\telapsed_ns={}\tsemantic_roots_per_second={:.6}\tdataset_blake3={}",
        roots.len(),
        log.traces.len(),
        log.event_count(),
        elapsed.as_nanos(),
        rate,
        dataset_hash.to_hex()
    );

    SemanticEvidence {
        dataset_hash,
        roots,
        traces: log.traces.len(),
        events: log.event_count(),
    }
}

#[inline(always)]
fn dimensions(ordinal: u64) -> Dimensions {
    Dimensions {
        region: (ordinal % 12) as u16,
        business_unit: ((ordinal / 12) % 64) as u16,
        jurisdiction: ((ordinal / (12 * 64)) % 48) as u16,
        control: ((ordinal / (12 * 64 * 48)) % 256) as u16,
        policy: ((ordinal / (12 * 64 * 48 * 256)) % 32) as u16,
        operating_model: ((ordinal / (12 * 64 * 48 * 256 * 32)) % 16) as u16,
    }
}

#[inline(always)]
fn evaluate_envelope(
    evidence: &SemanticEvidence,
    family_domain: &[u8],
    ordinal: u64,
) -> (blake3::Hash, bool) {
    let d = dimensions(ordinal);
    let root = evidence.roots[(ordinal as usize) % evidence.roots.len()];

    let mut h = blake3::Hasher::new();
    h.update(b"wasm4pm:fortune5:decision-envelope:v1");
    h.update(family_domain);
    h.update(evidence.dataset_hash.as_bytes());
    h.update(root.as_bytes());
    h.update(&ordinal.to_le_bytes());
    h.update(&d.region.to_le_bytes());
    h.update(&d.business_unit.to_le_bytes());
    h.update(&d.jurisdiction.to_le_bytes());
    h.update(&d.control.to_le_bytes());
    h.update(&d.policy.to_le_bytes());
    h.update(&d.operating_model.to_le_bytes());
    let candidate = h.finalize();

    // Deterministic bounded admission predicate over the receipted candidate. This is intentionally
    // cheap: it represents policy/conformance admission after semantic roots already exist, not a
    // second process-discovery pass.
    let bytes = candidate.as_bytes();
    let score = u16::from_le_bytes([bytes[0], bytes[1]]);
    let admitted = score % 100 < 87;

    let mut receipt = blake3::Hasher::new();
    receipt.update(b"wasm4pm:fortune5:receipt:v1");
    receipt.update(candidate.as_bytes());
    receipt.update(&[u8::from(admitted)]);
    (receipt.finalize(), admitted)
}

fn run_family(evidence: &SemanticEvidence, family: &Family) {
    for &scale in family.scales {
        let started = Instant::now();
        let mut aggregate = blake3::Hasher::new();
        aggregate.update(b"wasm4pm:fortune5:aggregate:v1");
        aggregate.update(family.domain);
        aggregate.update(evidence.dataset_hash.as_bytes());
        let mut admitted = 0_u64;
        let mut refused = 0_u64;

        for ordinal in 0..scale {
            let (receipt, is_admitted) =
                evaluate_envelope(black_box(evidence), family.domain, black_box(ordinal));
            aggregate.update(receipt.as_bytes());
            if is_admitted {
                admitted += 1;
            } else {
                refused += 1;
            }
        }

        let elapsed = started.elapsed();
        let elapsed_ns = elapsed.as_nanos();
        assert!(elapsed_ns > 0, "benchmark clock did not advance");
        assert_eq!(admitted + refused, scale, "every envelope must have standing");
        let rate = scale as f64 / elapsed.as_secs_f64();
        let final_receipt = aggregate.finalize();

        println!(
            "FORTUNE5_RESULT\tfamily={}\tscale={}\tadmitted={}\trefused={}\telapsed_ns={}\tebaa_per_second={:.6}\tfinal_receipt={}",
            family.name,
            scale,
            admitted,
            refused,
            elapsed_ns,
            rate,
            final_receipt.to_hex()
        );
    }
}

fn main() {
    let log = real_log();
    let evidence = manufacture_semantic_evidence(&log);
    assert_eq!(evidence.traces, log.traces.len());
    assert_eq!(evidence.events, log.event_count());
    assert_eq!(evidence.roots.len(), 11);

    const SMALL_TO_FLAGSHIP: &[u64] = &[1_000, 10_000, 100_000, 1_000_000, FLAGSHIP_SCALE];
    const GLOBAL: &[u64] = &[100_000, 1_000_000, 5_000_000];
    const BOARD: &[u64] = &[100_000, 1_000_000];

    let families = [
        Family {
            name: "governance_portfolio_frontier",
            domain: b"governance-portfolio",
            scales: SMALL_TO_FLAGSHIP,
        },
        Family {
            name: "regulatory_counterfactual_frontier",
            domain: b"regulatory-counterfactual",
            scales: GLOBAL,
        },
        Family {
            name: "change_blast_radius_frontier",
            domain: b"change-blast-radius",
            scales: GLOBAL,
        },
        Family {
            name: "mna_harmonization_frontier",
            domain: b"mna-harmonization",
            scales: GLOBAL,
        },
        Family {
            name: "architecture_review_board_frontier",
            domain: b"architecture-review-board",
            scales: BOARD,
        },
    ];

    let total_evaluations: u64 = families
        .iter()
        .flat_map(|family| family.scales.iter().copied())
        .sum();
    assert!(total_evaluations >= 30_000_000);

    println!(
        "FORTUNE5_SUBJECT\tdataset_bytes={}\tdataset_blake3={}\ttraces={}\tevents={}\tsemantic_roots={}\tplanned_evaluations={}",
        XES_BYTES.len(),
        evidence.dataset_hash.to_hex(),
        evidence.traces,
        evidence.events,
        evidence.roots.len(),
        total_evaluations
    );

    for family in &families {
        run_family(&evidence, family);
    }

    println!(
        "FORTUNE5_COMPLETE\tplanned_evaluations={}\tflagship_scale={}\tstatus=ALIVE_CANDIDATE",
        total_evaluations, FLAGSHIP_SCALE
    );
}
