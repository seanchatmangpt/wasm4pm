//! Data-driven Criterion latency benchmark for every cognition breed.
//!
//! This bench is intentionally NOT hand-maintained. It discovers its workload
//! from `tests/fixtures/papers/*.json` at compile time (`include_dir`-style
//! directory walk at runtime), parses each fixture's `input` object into a
//! `BreedInput` (mirroring `tests/paper_falsification.rs::fixture_input`),
//! resolves the breed via `BreedId::from_str_id(<fixture-stem>)`, and benches
//! `dispatch_breed_id(id, &input)` for each resolved breed.
//!
//! A fixture stem that does not resolve to a `BreedId` (e.g. an alias) is
//! SKIPPED with a logged note — it never panics the bench build/run. This
//! design cannot rot when a breed is added: drop a fixture, get a bench.

use std::fs;
use std::path::PathBuf;

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_cognition::breeds::dispatch::dispatch_breed_id;
use wasm4pm_cognition::breeds::{BreedId, BreedInput};

/// Replicate `tests/paper_falsification.rs::fixture_input`: fixtures may omit
/// fields; fill defaults before strict deserialization into `BreedInput`.
fn fixture_input(json: &serde_json::Value) -> BreedInput {
    let mut inp = json["input"].clone();
    let obj = inp
        .as_object_mut()
        .expect("fixture input must be an object");
    obj.entry("intent").or_insert(serde_json::json!(""));
    for k in ["candidates", "facts", "cases", "rules", "goals", "state"] {
        obj.entry(k).or_insert(serde_json::json!([]));
    }
    serde_json::from_value(inp).expect("fixture input must deserialize into BreedInput")
}

/// (stem, resolved BreedId, parsed input) for every fixture that resolves.
/// Returns a deterministically-ordered Vec (sorted by stem) so the bench set
/// is stable across runs — no HashMap iteration anywhere.
fn resolved_fixtures() -> Vec<(String, BreedId, BreedInput)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("papers");

    let mut entries: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("cannot read fixture dir {}: {}", dir.display(), e))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    entries.sort();

    let mut resolved = Vec::new();
    for path in entries {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        match BreedId::from_str_id(&stem) {
            Some(id) => {
                let raw = fs::read_to_string(&path)
                    .unwrap_or_else(|e| panic!("cannot read fixture {}: {}", path.display(), e));
                let json: serde_json::Value = serde_json::from_str(&raw)
                    .unwrap_or_else(|e| panic!("invalid JSON in {}: {}", path.display(), e));
                resolved.push((stem, id, fixture_input(&json)));
            }
            None => {
                eprintln!(
                    "breed_latency: SKIP fixture '{}' — stem does not resolve to a BreedId (alias?)",
                    stem
                );
            }
        }
    }
    resolved
}

fn bench_breeds(c: &mut Criterion) {
    let fixtures = resolved_fixtures();

    let mut group = c.benchmark_group("breed_latency");
    group.sample_size(50);

    for (stem, id, input) in &fixtures {
        group.bench_function(stem.as_str(), |b| {
            b.iter(|| black_box(dispatch_breed_id(*id, black_box(input))))
        });
    }

    group.finish();
}

criterion_group!(benches, bench_breeds);
criterion_main!(benches);
