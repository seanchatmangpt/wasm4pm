//! Phase 13 — ProofPack integration tests.
//!
//! Verifies that ProofPackWriter creates correct directory structure,
//! writes valid JSON files, and that the BLAKE3 hash chain detects tampering.
//!
//! All tests use `ProofPackWriter::for_test()` so packs land in
//! `target/test-proof-packs/` and never contaminate `target/proof-packs/`.
//!
//! Run: `cargo test --test proof_pack_tests --features browser`

use wasm4pm::testing::conformance::AndonPull;
use wasm4pm::testing::proof_pack::ProofPackWriter;
use wasm4pm::testing::{ConformanceVerdict, PowlTestHarness};

#[test]
fn proof_pack_writer_creates_required_directory() {
    let writer = ProofPackWriter::for_test("test-pack-dirs-01");
    assert!(writer.dir().exists(), "ProofPackWriter must create the pack directory");
}

#[test]
fn write_ocel_creates_events_file() {
    let mut h = PowlTestHarness::new("ocel-evidence-route");
    h.record_activity("test.started");
    let ocel = h.export_ocel();
    let writer = ProofPackWriter::for_test("test-ocel-write-02");
    writer.write_ocel(&ocel).expect("write_ocel must succeed");
    assert!(
        writer.dir().join("OCEL/events.json").exists(),
        "OCEL/events.json must exist after write_ocel"
    );
}

#[test]
fn write_ocel_records_actual_events() {
    let mut h = PowlTestHarness::new("ocel-content-route");
    h.record_activity("A");
    h.record_activity("B");
    let ocel = h.export_ocel();
    let writer = ProofPackWriter::for_test("test-ocel-content-03");
    writer.write_ocel(&ocel).unwrap();
    let content = std::fs::read_to_string(writer.dir().join("OCEL/events.json")).unwrap();
    assert!(content.contains("\"A\"") || content.contains("A"), "OCEL must record activity A");
}

#[test]
fn finalize_with_andon_writes_verdict_json() {
    let writer = ProofPackWriter::for_test("test-finalize-andon-04");
    writer
        .finalize(&ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete))
        .expect("finalize must succeed");
    let verdict_path = writer.dir().join("FINAL/verdict.json");
    assert!(verdict_path.exists(), "FINAL/verdict.json must exist after finalize");
    let content = std::fs::read_to_string(verdict_path).unwrap();
    assert!(
        content.contains("TestRouteIncomplete"),
        "verdict.json must record the andon reason; got: {content}"
    );
}

#[test]
fn finalize_with_passed_writes_accepted_verdict() {
    let writer = ProofPackWriter::for_test("test-finalize-passed-05");
    writer
        .finalize(&ConformanceVerdict::Passed)
        .expect("finalize must succeed for Passed verdict");
    let content =
        std::fs::read_to_string(writer.dir().join("FINAL/verdict.json")).unwrap();
    assert!(content.contains("Accepted"), "Passed verdict must write 'Accepted' to verdict.json");
}

#[test]
fn artifact_proof_hashes_are_written_after_finalize() {
    let mut h = PowlTestHarness::new("hash-verification-route");
    h.record_activity("test.started");
    let writer = ProofPackWriter::for_test("test-hash-verify-06");
    writer.write_ocel(&h.export_ocel()).unwrap();
    writer.finalize(&ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete)).unwrap();
    assert!(
        writer.dir().join("ARTIFACT_PROOF/file-hashes.json").exists(),
        "ARTIFACT_PROOF/file-hashes.json must exist after finalize"
    );
}

#[test]
fn artifact_proof_includes_final_verdict_hash() {
    let writer = ProofPackWriter::for_test("test-verdict-in-hashes-07");
    writer.finalize(&ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete)).unwrap();
    let hashes_raw =
        std::fs::read_to_string(writer.dir().join("ARTIFACT_PROOF/file-hashes.json")).unwrap();
    let hashes: serde_json::Value = serde_json::from_str(&hashes_raw).unwrap();
    assert!(
        hashes.get("FINAL/verdict.json").is_some(),
        "ARTIFACT_PROOF/file-hashes.json must include FINAL/verdict.json hash"
    );
}

#[test]
fn tampered_verdict_hash_does_not_match_recorded_hash() {
    // Anti-fake: tampering FINAL/verdict.json after finalize() invalidates the
    // recorded BLAKE3 hash. The `wpm proof verify` command detects this mismatch.
    let writer = ProofPackWriter::for_test("test-anti-fake-verdict-08");
    writer.finalize(&ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete)).unwrap();

    let hashes_raw =
        std::fs::read_to_string(writer.dir().join("ARTIFACT_PROOF/file-hashes.json")).unwrap();
    let hashes: serde_json::Value = serde_json::from_str(&hashes_raw).unwrap();
    let recorded_hash = hashes["FINAL/verdict.json"].as_str().unwrap().to_string();

    // Tamper with the verdict.
    std::fs::write(writer.dir().join("FINAL/verdict.json"), r#"{"verdict":"Accepted"}"#).unwrap();

    let tampered_bytes = std::fs::read(writer.dir().join("FINAL/verdict.json")).unwrap();
    let actual_hash = blake3::hash(&tampered_bytes).to_hex().to_string();

    assert_ne!(
        recorded_hash, actual_hash,
        "tampered verdict.json must not match the BLAKE3 hash recorded at finalize time"
    );
}

#[test]
fn manifest_is_written_by_finalize() {
    let writer = ProofPackWriter::for_test("test-manifest-09");
    writer.finalize(&ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete)).unwrap();
    assert!(
        writer.dir().join("MANIFEST.json").exists(),
        "MANIFEST.json must exist after finalize"
    );
}

#[test]
fn write_proof_dimensions_records_not_measured() {
    use wasm4pm::testing::conformance::ProofDimension;
    let report = wasm4pm::testing::ReplayReport {
        fitness: ProofDimension::Measured(1.0),
        precision: ProofDimension::Measured(1.0),
        receipt_coverage: ProofDimension::NotMeasured,
        required_stage_coverage: ProofDimension::Measured(1.0),
        object_lifecycle_validity: ProofDimension::NotMeasured,
    };
    let writer = ProofPackWriter::for_test("test-proof-dims-10");
    writer.write_proof_dimensions(&report).unwrap();
    let content =
        std::fs::read_to_string(writer.dir().join("PLACEHOLDER_PROOF/proof-dimensions.json"))
            .unwrap();
    assert!(
        content.contains("not_measured"),
        "proof-dimensions.json must record 'not_measured' for unimplemented dims"
    );
    assert!(
        content.contains("receipt_coverage"),
        "proof-dimensions.json must name the receipt_coverage dimension"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Separation tests: test packs must land in target/test-proof-packs/, not
// target/proof-packs/. This prevents test artifacts from appearing as real
// proof packs when `wpm proof verify` scans target/proof-packs/.
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn for_test_writes_to_test_proof_packs_not_real_proof_packs() {
    let writer = ProofPackWriter::for_test("separation-check-11");
    let dir = writer.dir();
    assert!(
        dir.to_string_lossy().contains("test-proof-packs"),
        "for_test() must write to target/test-proof-packs/, not target/proof-packs/; got: {dir:?}"
    );
    assert!(
        !dir.to_string_lossy().contains("/proof-packs/separation-check-11"),
        "for_test() must not use the real proof-packs directory"
    );
}
