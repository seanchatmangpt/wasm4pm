//! Divan benchmark matrix for every legally admitted cognition breed.
//!
//! Anti-hiding doctrine:
//! - the benchmark argument set is generated directly from `BreedId::ALL`, so a newly
//!   admitted breed automatically becomes a benchmark case;
//! - every case must have a paper fixture and pass the full lawful pipeline before timing;
//! - kernel-only and full-lifecycle timings are reported separately so shared OCEL/receipt
//!   work cannot hide a slow cognition implementation;
//! - geometric batch sizes expose fixed-cost, allocation, and throughput pathologies;
//! - an adversarial context-pressure rail injects 0..4096 irrelevant facts so linear scans,
//!   accidental quadratic work, and allocation blowups become visible as input size grows;
//! - Divan's allocation profiler reports allocation count/bytes alongside latency;
//! - inputs are generated outside the measured region and outputs are black-boxed;
//! - the companion `divan_benchmark_contract` test makes missing/invalid fixtures a hard
//!   test failure rather than silently skipping a cognition.

use std::fmt;
use std::fs;
use std::path::PathBuf;

use divan::counter::ItemsCount;
use divan::{black_box, AllocProfiler, Bencher};
use wasm4pm_cognition::breeds::dispatch::{dispatch_breed_id, dispatch_breed_test_id};
use wasm4pm_cognition::breeds::{BreedId, BreedInput, Fact};

#[global_allocator]
static ALLOC: AllocProfiler = AllocProfiler::system();

/// Geometric work amplification. A benchmark point is N independent cognition executions,
/// not N repetitions hidden inside Divan's own sampler. This makes throughput scaling and
/// per-execution allocation growth explicit in the report.
const BATCHES: [usize; 4] = [1, 4, 16, 64];

/// Adversarial enterprise-context sizes. These facts use a reserved benchmark namespace and
/// are deliberately unrelated to the paper fixture. A cognition that needs only a narrow
/// prefix/key should not accidentally become quadratic in the total observation envelope.
const CONTEXT_NOISE: [usize; 4] = [0, 64, 512, 4096];

#[derive(Clone, Copy, Debug)]
struct Scenario {
    breed: BreedId,
    batch: usize,
}

impl fmt::Display for Scenario {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/batch={}", self.breed, self.batch)
    }
}

#[derive(Clone, Copy, Debug)]
struct ContextScenario {
    breed: BreedId,
    noise_facts: usize,
}

impl fmt::Display for ContextScenario {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/noise_facts={}", self.breed, self.noise_facts)
    }
}

fn scenarios() -> impl Iterator<Item = Scenario> {
    BreedId::ALL.into_iter().flat_map(|breed| {
        BATCHES
            .into_iter()
            .map(move |batch| Scenario { breed, batch })
    })
}

fn context_scenarios() -> impl Iterator<Item = ContextScenario> {
    BreedId::ALL.into_iter().flat_map(|breed| {
        CONTEXT_NOISE
            .into_iter()
            .map(move |noise_facts| ContextScenario { breed, noise_facts })
    })
}

fn fixture_path(id: BreedId) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("papers")
        .join(format!("{}.json", id))
}

/// Mirrors the paper-falsification fixture admission rule. Missing fields are defaults;
/// malformed fields fail loudly. There is deliberately no skip path.
fn fixture_input(id: BreedId) -> BreedInput {
    let path = fixture_path(id);
    let raw = fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "{}: benchmark fixture {} unavailable: {e}",
            id,
            path.display()
        )
    });
    let json: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("{}: invalid benchmark fixture {}: {e}", id, path.display()));
    let mut inp = json["input"].clone();
    let obj = inp
        .as_object_mut()
        .unwrap_or_else(|| panic!("{}: fixture input must be an object", id));
    obj.entry("intent").or_insert(serde_json::json!(""));
    for key in ["candidates", "facts", "cases", "rules", "goals", "state"] {
        obj.entry(key).or_insert(serde_json::json!([]));
    }
    serde_json::from_value(inp)
        .unwrap_or_else(|e| panic!("{}: fixture cannot deserialize as BreedInput: {e}", id))
}

/// Fail closed before measurement. A zero-work/constant stub is not allowed to acquire a
/// flattering benchmark number merely because it returns quickly.
fn preflight(id: BreedId, input: &BreedInput) {
    let out = dispatch_breed_id(id, input)
        .unwrap_or_else(|e| panic!("{}: full-path benchmark admission failed: {e}", id));
    assert_eq!(
        out.breed, id,
        "{}: output was attributed to the wrong breed",
        id
    );
    assert!(
        !out.inference_trace.is_empty(),
        "{}: empty inference trace is ineligible for benchmarking",
        id
    );
    assert!(
        out.ocel_log.is_some(),
        "{}: full-path benchmark produced no OCEL evidence",
        id
    );
    assert!(
        out.inference_trace
            .windows(2)
            .all(|w| w[0].step < w[1].step),
        "{}: inference trace steps are not strictly monotonic",
        id
    );
}

/// Give each independent execution a distinct, semantically irrelevant nonce. This defeats
/// pointer/content memoization as a way to manufacture an unrealistically cheap batch number.
fn with_nonce(mut input: BreedInput, nonce: usize) -> BreedInput {
    input.facts.push(Fact {
        key: "__bench:nonce".to_string(),
        value: nonce.to_string(),
    });
    input
}

fn workload(s: Scenario) -> Vec<BreedInput> {
    let base = fixture_input(s.breed);
    (0..s.batch)
        .map(|nonce| {
            let input = with_nonce(base.clone(), nonce);
            preflight(s.breed, &input);
            input
        })
        .collect()
}

fn context_workload(s: ContextScenario) -> BreedInput {
    let mut input = fixture_input(s.breed);
    input.facts.reserve(s.noise_facts);
    for i in 0..s.noise_facts {
        input.facts.push(Fact {
            key: format!("__bench:irrelevant:{i:08}"),
            value: format!("noise-{i:08}-{}", s.breed),
        });
    }
    preflight(s.breed, &input);
    input
}

/// Raw cognition kernel. This intentionally bypasses lifecycle/OCEL work so poor algorithmic
/// complexity cannot hide behind shared governance overhead.
#[divan::bench(args = scenarios(), min_time = 0.05, max_time = 0.5)]
fn kernel_only(bencher: Bencher, scenario: Scenario) {
    let inputs = workload(scenario);
    bencher
        .counter(ItemsCount::new(scenario.batch))
        .bench_local(|| {
            let mut evidence = 0usize;
            for input in black_box(&inputs) {
                let out =
                    dispatch_breed_test_id(scenario.breed, black_box(input)).unwrap_or_else(|e| {
                        panic!("{} kernel failed during benchmark: {e}", scenario.breed)
                    });
                evidence = evidence
                    .wrapping_add(out.inference_trace.len())
                    .wrapping_add(out.facts.len())
                    .wrapping_add(out.candidates.len());
                black_box(&out);
            }
            black_box(evidence)
        });
}

/// Complete lawful cognition path: precondition -> cognition -> postcondition -> OCEL
/// derivation/conformance. Compare this with `kernel_only` to quantify governance tax rather
/// than letting that tax mask a bad implementation.
#[divan::bench(args = scenarios(), min_time = 0.05, max_time = 0.5)]
fn full_lifecycle(bencher: Bencher, scenario: Scenario) {
    let inputs = workload(scenario);
    bencher
        .counter(ItemsCount::new(scenario.batch))
        .bench_local(|| {
            let mut evidence = 0usize;
            for input in black_box(&inputs) {
                let out = dispatch_breed_id(scenario.breed, black_box(input)).unwrap_or_else(|e| {
                    panic!("{} lifecycle failed during benchmark: {e}", scenario.breed)
                });
                evidence = evidence
                    .wrapping_add(out.inference_trace.len())
                    .wrapping_add(out.facts.len())
                    .wrapping_add(out.candidates.len());
                black_box(&out);
            }
            black_box(evidence)
        });
}

/// Input-size complexity rail. The useful paper problem stays fixed while irrelevant admitted
/// context grows geometrically. This makes accidental whole-context scans and O(n^2) joins
/// obvious in the latency/allocation curve instead of letting a tiny fixture look healthy.
#[divan::bench(args = context_scenarios(), min_time = 0.05, max_time = 0.5)]
fn context_pressure(bencher: Bencher, scenario: ContextScenario) {
    let input = context_workload(scenario);
    bencher
        .counter(ItemsCount::new(input.facts.len()))
        .bench_local(|| {
            let out =
                dispatch_breed_test_id(scenario.breed, black_box(&input)).unwrap_or_else(|e| {
                    panic!("{} context-pressure kernel failed: {e}", scenario.breed)
                });
            black_box(out)
        });
}

fn main() {
    // 55 admitted breeds x ((4 batch sizes x 2 measurement surfaces) + 4 context sizes)
    // = 660 independently named measurements. Allocation profiling is active for every point.
    divan::main();
}
