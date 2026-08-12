//! Hard admission contract for the cognition Divan matrix.
//!
//! Performance numbers are meaningless when an implementation can avoid real work. This test
//! therefore proves that every legally admitted cognition is benchmark-eligible through the
//! exact full dispatch path before any timing result is accepted.
//!
//! Research-grade admission also requires a grounded paper fixture with a citation, a precise
//! locus in the source, a non-empty expected falsifier, and enough semantic input to prevent
//! an empty/default-input implementation from acquiring a flattering benchmark number.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use wasm4pm_cognition::breeds::dispatch::{dispatch_breed_id, dispatch_breed_test_id};
use wasm4pm_cognition::breeds::{BreedId, BreedInput};

fn fixture_path(id: BreedId) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("papers")
        .join(format!("{}.json", id))
}

fn fixture_json(id: BreedId) -> serde_json::Value {
    let path = fixture_path(id);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{}: benchmark fixture {} unavailable: {e}", id, path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("{}: invalid benchmark fixture {}: {e}", id, path.display()))
}

fn fixture_input(id: BreedId) -> BreedInput {
    let json = fixture_json(id);
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

fn nonempty_str<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(|x| x.as_str()).filter(|s| !s.trim().is_empty())
}

#[test]
fn divan_matrix_is_exactly_the_55_admitted_cognitions() {
    assert_eq!(
        BreedId::ALL.len(),
        55,
        "benchmark crown moved: update the explicit 55-cognition acceptance boundary"
    );
    let unique: BTreeSet<_> = BreedId::ALL.into_iter().collect();
    assert_eq!(unique.len(), 55, "BreedId::ALL contains duplicate cognition ids");
}

/// The real, documented extraction-method taxonomy (set 2026-06-10,
/// `af86f29c` "finish periodic table"; per-breed rationale in
/// `docs/breeds/oracle-specs/*.md`) describing *how* a paper's worked
/// example was transcribed into a machine-checkable fixture -- verbatim
/// quote, adapted/pre-composed encoding, instantiated from a general
/// schema, propositionalized, etc. All are real, non-trivial transcription
/// work and are accepted here.
///
/// `"citation-only"` is deliberately excluded: it is the one category
/// meaning the paper was cited but never actually transcribed into a real
/// worked example -- exactly what this test (added later, 2026-08-09
/// `d64a3d75c` "harden cognition benchmark research admission") exists to
/// catch. A fixture using it (currently only `soar.json`) is SUPPOSED to
/// keep failing this assertion until it's re-grounded for real; that is
/// not a bug in this allowlist.
const ALLOWED_EXTRACTION_KINDS: &[&str] = &[
    "grounded",
    "verbatim",
    "adapted",
    "instantiated",
    "grounded-encoding",
    "verbatim-propositionalized",
    "secondary-source",
    "operationalized",
    "closed-form-instance",
];

#[test]
fn every_cognition_benchmark_is_paper_grounded_and_falsifiable() {
    for id in BreedId::ALL {
        let json = fixture_json(id);
        let id_text = id.to_string();
        assert_eq!(
            json.get("breed").and_then(|x| x.as_str()),
            Some(id_text.as_str()),
            "{}: fixture identity is not bound to the benchmarked cognition",
            id
        );

        let provenance = json
            .get("provenance")
            .and_then(|x| x.as_object())
            .unwrap_or_else(|| panic!("{}: benchmark fixture has no provenance object", id));
        let provenance_value = serde_json::Value::Object(provenance.clone());
        for key in ["paper", "citation", "locus"] {
            assert!(
                nonempty_str(&provenance_value, key).is_some(),
                "{}: benchmark fixture missing grounded provenance field {key}",
                id
            );
        }
        let extraction = nonempty_str(&provenance_value, "extraction");
        assert!(
            extraction.is_some_and(|e| ALLOWED_EXTRACTION_KINDS.contains(&e)),
            "{}: benchmark fixture's extraction kind {:?} is not in the documented taxonomy \
             {ALLOWED_EXTRACTION_KINDS:?} (see docs/breeds/oracle-specs/*.md). Note \
             \"citation-only\" is deliberately never accepted here -- it means the fixture was \
             never actually re-grounded, not that this allowlist is wrong.",
            id,
            extraction
        );

        let expected = json
            .get("expected")
            .and_then(|x| x.as_object())
            .unwrap_or_else(|| panic!("{}: benchmark fixture has no expected falsifier", id));
        assert!(
            !expected.is_empty(),
            "{}: empty expected object would make the paper oracle vacuous",
            id
        );

        let input = fixture_input(id);
        let semantic_atoms = input.candidates.len()
            + input.facts.len()
            + input.cases.len()
            + input.rules.len()
            + input.goals.len()
            + input.state.len();
        assert!(
            semantic_atoms > 0 || !input.intent.trim().is_empty(),
            "{}: benchmark fixture is an empty/default cognition problem",
            id
        );
    }
}

#[test]
fn every_admitted_cognition_has_real_benchmark_work_and_evidence() {
    for id in BreedId::ALL {
        let input = fixture_input(id);

        let raw = dispatch_breed_test_id(id, &input)
            .unwrap_or_else(|e| panic!("{}: raw cognition benchmark path failed: {e}", id));
        assert_eq!(raw.breed, id, "{}: raw output attributed to another breed", id);
        assert!(
            !raw.inference_trace.is_empty(),
            "{}: raw cognition did zero observable inference work",
            id
        );

        let full = dispatch_breed_id(id, &input)
            .unwrap_or_else(|e| panic!("{}: lawful benchmark path failed: {e}", id));
        assert_eq!(full.breed, id, "{}: full output attributed to another breed", id);
        assert!(
            !full.inference_trace.is_empty(),
            "{}: full cognition did zero observable inference work",
            id
        );
        assert!(full.ocel_log.is_some(), "{}: benchmark path emitted no OCEL evidence", id);
        assert!(
            full.inference_trace
                .windows(2)
                .all(|w| w[0].step < w[1].step),
            "{}: trace is not strictly monotonic",
            id
        );
    }
}
